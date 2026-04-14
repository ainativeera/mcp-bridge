import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { toolService } from "./src/db";
import { buildMcpToolDefinition } from "./src/lib/mcp-description";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { v4 as uuidv4Lib } from "uuid";

import "dotenv/config";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production" ? {
    target: "pino-pretty",
    options: { colorize: true }
  } : undefined
});

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  dbPath: process.env.DB_PATH || "./mcp_bridge.db",
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10)
  },
  corsOrigins: process.env.CORS_ORIGINS?.split(",").map(o => o.trim()) || ["*"],
  getApiKey: () => {
    const dbApiKey = toolService.getSettings()?.apiKey;
    return dbApiKey || process.env.API_KEY || null;
  }
};

async function startServer() {
  const app = express();
  let db: any;

  type SessionState = {
    response: express.Response;
    createdAt: number;
    lastActivityAt: number;
    lastMethod: string;
    messageCount: number;
    initialized: boolean;
    userAgent?: string;
    remoteAddress?: string;
    lastError?: string;
  };

  try {
    const Database = (await import("better-sqlite3")).default;
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    logger.info({ dbPath: config.dbPath }, "Database connected");
  } catch (error) {
    logger.fatal({ error }, "Failed to connect to database");
    process.exit(1);
  }

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  const corsOptions: cors.CorsOptions = {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
  };
  app.use(cors(corsOptions));

  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use("/api", apiLimiter);
  app.use("/sse", apiLimiter);
  app.use("/messages", apiLimiter);

  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const apiKey = config.getApiKey();
    if (config.nodeEnv === "development" && !apiKey) {
      return next();
    }
    if (!apiKey) {
      return next();
    }
    const clientApiKey = req.headers["x-api-key"] as string;
    if (!clientApiKey || clientApiKey !== apiKey) {
      logger.warn({ ip: req.ip, path: req.path, apiKey: !!apiKey }, "Unauthorized access attempt");
      return res.status(401).json({ error: "Unauthorized: Invalid or missing API key" });
    }
    next();
  };

  const sessions = new Map<string, SessionState>();
  let toolsVersion = 0;
  let cachedTools: any[] | null = null;
  let cachedMcpTools: any[] | null = null;

  const getSessionSummaries = () =>
    Array.from(sessions.entries())
      .map(([sessionId, session]) => ({
        sessionId,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        lastMethod: session.lastMethod,
        messageCount: session.messageCount,
        initialized: session.initialized,
        userAgent: session.userAgent,
        remoteAddress: session.remoteAddress,
        lastError: session.lastError
      }))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  const broadcastToolsChange = () => {
    toolsVersion++;
    cachedTools = null;
    cachedMcpTools = null;
    sessions.forEach((session) => {
      session.response.write(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/tools/list_changed",
        params: {}
      })}\n\n`);
    });
  };

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: "1.0.0"
    });
  });

  app.get("/api/status", (req, res) => {
    res.json({
      activeConnections: sessions.size,
      uptime: process.uptime(),
      toolsCount: toolService.getAll().length,
      toolsVersion,
      sessions: getSessionSummaries().slice(0, 5)
    });
  });

  app.get("/sse", (req, res) => {
    const startTime = Date.now();
    const sessionId = uuidv4Lib();
    const protocol = req.protocol;
    const host = req.get('host');
    const messagesUrl = `${protocol}://${host}/messages?sessionId=${sessionId}`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.write(`event: endpoint\ndata: ${messagesUrl}\n\n`);
    res.write(`event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: true },
          resources: {}
        },
        serverInfo: { name: "MCP-Bridge", version: "1.0.0" }
      }
    })}\n\n`);

    sessions.set(sessionId, {
      response: res,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      lastMethod: "connect",
      messageCount: 0,
      initialized: false,
      userAgent: req.get("user-agent") || undefined,
      remoteAddress: req.ip
    });
    logger.info({ 
      sessionId, 
      setupTime: Date.now() - startTime 
    }, "New SSE connection");

    req.on("close", () => {
      sessions.delete(sessionId);
      logger.info({ sessionId }, "SSE connection closed");
    });
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const sessionState = sessions.get(sessionId);
    const session = sessionState?.response;
    const message = req.body;
    const requestStartTime = Date.now();

    if (!message || !message.jsonrpc || message.jsonrpc !== "2.0") {
      return res.status(400).json({ error: "Invalid JSON-RPC request" });
    }

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    sessionState.lastActivityAt = Date.now();
    sessionState.lastMethod = message.method;
    sessionState.messageCount += 1;
    sessionState.lastError = undefined;

    try {
      switch (message.method) {
        case "initialize": {
          const startTime = Date.now();
          sessionState.initialized = true;
          sendJsonRpcResponse(session, message.id, {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: { listChanged: true },
              resources: {}
            },
            serverInfo: { name: "MCP-Bridge", version: "1.0.0" }
          });
          logger.info({ 
            method: "initialize", 
            duration: Date.now() - startTime 
          }, "MCP method performance");
          break;
        }

        case "resources/list": {
          sendJsonRpcResponse(session, message.id, { resources: [] });
          logger.info({
            method: "resources/list",
            duration: Date.now() - requestStartTime,
            sessionId
          }, "MCP method performance");
          break;
        }

        case "tools/list": {
          const startTime = Date.now();
          
          if (!cachedMcpTools) {
            const tools = toolService.getAll();
            const dbTime = Date.now() - startTime;
            
            const mapStartTime = Date.now();
            cachedMcpTools = tools.map((t: any) => {
              const toolDefinition = buildMcpToolDefinition({
                name: t.name,
                description: t.description || '',
                parameters: t.parameters || [],
                responseFields: t.responseFields || []
              });

              return {
                name: toolDefinition.name,
                description: toolDefinition.description,
                inputSchema: toolDefinition.inputSchema,
                outputSchema: toolDefinition.outputSchema
              };
            });
            const mapTime = Date.now() - mapStartTime;
            const totalTime = Date.now() - startTime;
            
            logger.info({ 
              toolCount: tools.length, 
              dbTime, 
              mapTime, 
              totalTime,
              cached: false
            }, "tools/list performance");
          } else {
            logger.info({ 
              toolCount: cachedMcpTools.length, 
              duration: Date.now() - startTime,
              cached: true
            }, "tools/list performance");
          }
          
          sendJsonRpcResponse(session, message.id, { tools: cachedMcpTools, toolsVersion });
          break;
        }

        case "tools/call": {
          const { name, arguments: args } = message.params || {};
          if (!name) {
            sendJsonRpcError(session, message.id, -32602, "Missing required parameter: name");
            break;
          }
          
          const tools = cachedTools || toolService.getAll();
          if (!cachedTools) {
            cachedTools = tools;
          }
          
          const tool = tools.find((t: any) => t.name === name);

          if (!tool) {
            sendJsonRpcError(session, message.id, -32601, `Tool not found: ${name}`);
            break;
          }

          try {
            const result = await executeToolInternal(tool, args || {});
            const returnValue = result.response.structuredData !== undefined
              ? result.response.structuredData
              : result.response.filteredData;
            const responsePayload: Record<string, any> = {
              content: [{ type: "text", text: toJsonText(returnValue) }]
            };

            if (result.response.structuredData !== undefined) {
              responsePayload.structuredContent = result.response.structuredData;
            }

            sendJsonRpcResponse(session, message.id, responsePayload);
            logger.info({
              method: "tools/call",
              toolName: name,
              duration: Date.now() - requestStartTime,
              sessionId
            }, "MCP method performance");
          } catch (error: any) {
            sessionState.lastError = error.message;
            sendJsonRpcError(session, message.id, -32000, error.message);
          }
          break;
        }

        default: {
          sessionState.lastError = `Method not found: ${message.method}`;
          sendJsonRpcError(session, message.id, -32601, `Method not found: ${message.method}`);
        }
      }
    } catch (error: any) {
      sessionState.lastError = error.message;
      logger.error({ error, method: message.method }, "Error processing message");
      sendJsonRpcError(session, message.id, -32000, "Internal error");
    }

    res.status(200).send("OK");
  });

  function sendJsonRpcResponse(res: express.Response, id: any, result: any) {
    res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`);
  }

  function sendJsonRpcError(res: express.Response, id: any, code: number, message: string) {
    res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n\n`);
  }

  const heartbeatInterval = setInterval(() => {
    sessions.forEach((session, sessionId) => {
      try {
        session.response.write(`: ping ${Date.now()}\n\n`);
      } catch (error: any) {
        logger.warn({ sessionId, error: error?.message }, "Failed to send SSE heartbeat");
        sessions.delete(sessionId);
      }
    });
  }, 15000);

  function isTreeResponseField(field: any) {
    return Array.isArray(field?.children) || field?.name === "root";
  }

  function isFieldIncluded(field: any) {
    return field?.includeInResponse !== false;
  }

  function normalizePathParts(path?: string) {
    if (!path || path === "$" || path === "$.") {
      return [];
    }

    return path
      .replace(/^\$\./, "")
      .replace(/^\$/, "")
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .map((part: string) => part.trim())
      .filter((part: string) => part.length > 0);
  }

  function getValueByPath(source: any, path?: string) {
    if (!path || path === "$" || path === "$.") {
      return source;
    }

    const pathParts = normalizePathParts(path);
    let currentValue = source;

    for (const part of pathParts) {
      if (currentValue === null || currentValue === undefined) {
        return undefined;
      }

      const isIndex = /^\d+$/.test(part);
      const nextValue = isIndex && Array.isArray(currentValue)
        ? currentValue[Number(part)]
        : currentValue[part];

      if (nextValue === undefined) {
        return undefined;
      }

      currentValue = nextValue;
    }

    return currentValue;
  }

  function getRelativePath(parentPath: string | undefined, childPath: string | undefined) {
    const childParts = normalizePathParts(childPath);
    const parentParts = normalizePathParts(parentPath);

    if (parentParts.length === 0) {
      return childPath;
    }

    const matchesPrefix = parentParts.every((part, index) => childParts[index] === part);
    if (!matchesPrefix) {
      return childPath;
    }

    const relativeParts = childParts.slice(parentParts.length);
    if (relativeParts.length === 0) {
      return "$";
    }

    return relativeParts.join(".");
  }

  function buildStructuredContent(tool: any, responseData: any, filteredData: any) {
    if (!Array.isArray(tool.responseFields) || tool.responseFields.length === 0) {
      return filteredData;
    }

    const extractFieldValue = (field: any, scopedSource: any, fallbackSource: any, parentPath?: string): any => {
      const localPath = getRelativePath(parentPath, field.path);
      const localValue = getValueByPath(scopedSource, localPath);
      const fallbackValue = localValue !== undefined ? localValue : getValueByPath(fallbackSource, field.path);
      const resolvedValue = localValue !== undefined ? localValue : fallbackValue;

      if (field.type === "object") {
        const objectValue = resolvedValue && typeof resolvedValue === "object" && !Array.isArray(resolvedValue)
          ? resolvedValue
          : {};
        const nextObject: Record<string, any> = {};

        (field.children || []).forEach((child: any) => {
          if (!child?.name || child.name === "item" || !isFieldIncluded(child)) {
            return;
          }

          const childValue = extractFieldValue(child, objectValue, fallbackValue, field.path);
          if (childValue !== undefined) {
            nextObject[child.name] = childValue;
          }
        });

        return nextObject;
      }

      if (field.type === "array") {
        const arrayValue = Array.isArray(resolvedValue) ? resolvedValue : [];
        const itemField = (field.children || []).find((child: any) => child?.name === "item");

        if (!itemField || !isFieldIncluded(itemField)) {
          return arrayValue;
        }

        return arrayValue.map((item) => extractFieldValue(itemField, item, item, field.path));
      }

      return resolvedValue;
    };

    const rootField = tool.responseFields[0];

    if (isTreeResponseField(rootField)) {
      const rootPath = rootField?.path || "$";
      const rootScopedValue = getValueByPath(filteredData, rootPath);
      const rootValue = rootScopedValue !== undefined
        ? rootScopedValue
        : getValueByPath(responseData, rootPath);

      if (rootField?.name === "root") {
        if (rootField.type === "array") {
          const itemField = (rootField.children || []).find((child: any) => child?.name === "item");
          const arrayValue = Array.isArray(rootValue) ? rootValue : [];

          if (!itemField || !isFieldIncluded(itemField)) {
            return arrayValue;
          }

          return arrayValue.map((item) => extractFieldValue(itemField, item, item, rootField.path));
        }

        if (rootField.type === "object") {
          const objectValue = rootValue && typeof rootValue === "object" && !Array.isArray(rootValue) ? rootValue : {};
          const nextObject: Record<string, any> = {};

          (rootField.children || []).forEach((child: any) => {
            if (!child?.name || child.name === "item" || !isFieldIncluded(child)) {
              return;
            }

            const childValue = extractFieldValue(child, objectValue, rootValue, rootField.path);
            if (childValue !== undefined) {
              nextObject[child.name] = childValue;
            }
          });

          return nextObject;
        }

        return rootValue;
      }

      if (!isFieldIncluded(rootField)) {
        return undefined;
      }

      return { [rootField.name]: extractFieldValue(rootField, filteredData, responseData, "$") };
    }

    const structuredContent: Record<string, any> = {};

    tool.responseFields.forEach((field: any) => {
      if (!field?.name || !isFieldIncluded(field)) {
        return;
      }

      const valueFromFiltered = getValueByPath(filteredData, field.path);
      const value = valueFromFiltered !== undefined
        ? valueFromFiltered
        : getValueByPath(responseData, field.path);

      structuredContent[field.name] = value;
    });

    return structuredContent;
  }

  function toJsonText(value: any) {
    return JSON.stringify(value === undefined ? null : value);
  }

  async function executeToolInternal(tool: any, values: any) {
    let finalUrl = tool.url;
    let finalBody = tool.body;
    let logError: string | undefined;
    let responseStatus: number | undefined;
    try {
      Object.entries(values).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        finalUrl = finalUrl.replace(new RegExp(placeholder, "g"), String(value));
        if (typeof finalBody === "string") {
          finalBody = finalBody.replace(new RegExp(placeholder, "g"), String(value));
        }
      });

      const headers: Record<string, string> = {};

      const settings = toolService.getSettings();
      if (settings.globalHeaders) {
        settings.globalHeaders.forEach((h: any) => {
          if (h.key && h.value) headers[h.key] = h.value;
        });
      }

      tool.headers.forEach((h: any) => {
        if (h.key && h.value) headers[h.key] = h.value;
      });

      const response = await fetch(finalUrl, {
        method: tool.method,
        headers,
        body: tool.method !== "GET" ? finalBody : undefined
      });

      responseStatus = response.status;
      const contentType = response.headers.get("content-type");
      let data: any;

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
        try {
          data = JSON.parse(data);
        } catch {
          // Keep as text
        }
      }

      let filteredData = data;

      if (tool.responseFilter) {
        const extractedData = getValueByPath(filteredData, tool.responseFilter);
        if (extractedData !== undefined) {
          filteredData = extractedData;
        }
      }

      const structuredData = buildStructuredContent(tool, data, filteredData);

      const logId = uuidv4Lib();
      toolService.saveLog({
        id: logId,
        toolId: tool.id,
        method: tool.method,
        url: finalUrl,
        status: responseStatus,
        requestBody: finalBody,
        responseBody: data
      });

      return { response: { status: responseStatus, filteredData, structuredData } };
    } catch (error: any) {
      logError = error.message;
      const logId = uuidv4Lib();
      toolService.saveLog({
        id: logId,
        toolId: tool.id,
        method: tool.method,
        url: finalUrl,
        status: responseStatus || 500,
        requestBody: finalBody,
        error: logError
      });
      throw error;
    }
  }

  app.get("/api/tools", (req, res) => {
    res.json(toolService.getAll());
  });

  app.get("/api/settings", (req, res) => {
    res.json(toolService.getSettings());
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    toolService.updateSetting(key, value);
    res.json({ success: true });
  });

  app.get("/api/logs/:toolId", (req, res) => {
    res.json(toolService.getLogs(req.params.toolId));
  });

  app.post("/api/tools", (req, res) => {
    toolService.save(req.body);
    broadcastToolsChange();
    res.json({ success: true });
  });

  app.delete("/api/tools/:id", (req, res) => {
    toolService.delete(req.params.id);
    broadcastToolsChange();
    res.json({ success: true });
  });

  app.post("/api/execute", async (req, res) => {
    const { tool, values } = req.body;
    try {
      const result = await executeToolInternal(tool, values);
      const returnValue = result.response.structuredData !== undefined
        ? result.response.structuredData
        : result.response.filteredData;
      res.json({
        request: { url: tool.url, method: tool.method, headers: tool.headers, body: tool.body },
        response: {
          status: result.response.status,
          data: result.response.filteredData,
          filteredData: result.response.filteredData,
          structuredData: result.response.structuredData,
          returnValue
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  if (config.nodeEnv !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    logger.info("Vite middleware enabled (development mode)");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    logger.info({ distPath }, "Static files served (production mode)");
  }

  const server = app.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "Server started");
  });

  setInterval(() => {
    logger.info("Cleaning up old logs...");
    toolService.cleanupLogs();
  }, 60 * 60 * 1000);
  toolService.cleanupLogs();

  const gracefulShutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    clearInterval(heartbeatInterval);
    server.close(() => {
      logger.info("HTTP server closed");
      if (db) {
        db.close();
        logger.info("Database connection closed");
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled rejection");
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
