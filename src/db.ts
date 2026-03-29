import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { MCPTool } from "./types";

import "dotenv/config";

const defaultDbDir = process.env.APP_DATA_DIR || process.cwd();
const dbPath = process.env.DB_PATH || path.join(defaultDbDir, "mcp_bridge.db");
const seedDbPath = process.env.DB_SEED_PATH;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

if (!fs.existsSync(dbPath) && seedDbPath && fs.existsSync(seedDbPath) && seedDbPath !== dbPath) {
  fs.copyFileSync(seedDbPath, dbPath);
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    folder TEXT,
    description TEXT,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    headers TEXT,
    body TEXT,
    responseFilter TEXT,
    parameters TEXT,
    responseFields TEXT,
    createdAt INTEGER
  )
`);

try {
  db.exec("ALTER TABLE tools ADD COLUMN folder TEXT");
} catch (e) {
}

try {
  db.exec("ALTER TABLE tools ADD COLUMN responseFields TEXT");
} catch (e) {
}

db.exec(`
  CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    toolId TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    method TEXT,
    url TEXT,
    status INTEGER,
    requestBody TEXT,
    responseBody TEXT,
    error TEXT,
    FOREIGN KEY(toolId) REFERENCES tools(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

export const toolService = {
  getSettings: () => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings: Record<string, any> = {
      globalHeaders: [],
      proxyUrl: ""
    };
    rows.forEach((row: any) => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });
    return settings;
  },

  updateSetting: (key: string, value: any) => {
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    return stmt.run(key, typeof value === "string" ? value : JSON.stringify(value));
  },

  saveLog: (log: any) => {
    const stmt = db.prepare(`
      INSERT INTO execution_logs (id, toolId, timestamp, method, url, status, requestBody, responseBody, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      log.id || randomUUID(),
      log.toolId,
      Date.now(),
      log.method,
      log.url,
      log.status,
      JSON.stringify(log.requestBody),
      JSON.stringify(log.responseBody),
      log.error
    );
  },

  getLogs: (toolId: string) => {
    return db.prepare("SELECT * FROM execution_logs WHERE toolId = ? ORDER BY timestamp DESC LIMIT 50").all(toolId).map((l: any) => {
      let requestBody = null;
      let responseBody = null;
      try {
        requestBody = JSON.parse(l.requestBody || "null");
      } catch (e) {
        console.error("Failed to parse requestBody", e);
      }
      try {
        responseBody = JSON.parse(l.responseBody || "null");
      } catch (e) {
        console.error("Failed to parse responseBody", e);
      }
      return {
        ...l,
        requestBody,
        responseBody
      };
    });
  },

  cleanupLogs: () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return db.prepare("DELETE FROM execution_logs WHERE timestamp < ?").run(oneDayAgo);
  },

  getAll: () => {
    const tools = db.prepare("SELECT * FROM tools ORDER BY createdAt DESC").all();
    return tools.map((t: any) => {
      let headers = [];
      let parameters = [];
      let responseFields = [];
      try {
        headers = JSON.parse(t.headers || "[]");
      } catch (e) {
        console.error("Failed to parse headers", e);
      }
      try {
        parameters = JSON.parse(t.parameters || "[]");
      } catch (e) {
        console.error("Failed to parse parameters", e);
      }
      try {
        responseFields = JSON.parse(t.responseFields || "[]");
      } catch (e) {
        console.error("Failed to parse responseFields", e);
      }
      return {
        ...t,
        headers,
        parameters,
        responseFields
      };
    });
  },

  save: (tool: MCPTool) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO tools (id, name, folder, description, method, url, headers, body, responseFilter, parameters, responseFields, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      tool.id,
      tool.name,
      tool.folder || null,
      tool.description,
      tool.method,
      tool.url,
      JSON.stringify(tool.headers),
      tool.body,
      tool.responseFilter,
      JSON.stringify(tool.parameters),
      JSON.stringify(tool.responseFields || []),
      tool.createdAt || Date.now()
    );
  },

  delete: (id: string) => {
    return db.prepare("DELETE FROM tools WHERE id = ?").run(id);
  }
};
