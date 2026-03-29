# MCP Bridge

Turn internal APIs and cURL workflows into local MCP tools for AI agents.

MCP Bridge helps teams convert existing HTTP operations into tools that Claude Desktop, Cursor, Zed, and other MCP clients can call through a local server. The project is designed for real-world office automation scenarios where users already have working cURL commands and want to make them safe, reusable, and agent-friendly.

## Why MCP Bridge

- Import existing cURL commands instead of rebuilding integrations from scratch
- Define MCP-friendly parameter schemas and response descriptions
- Run a local MCP SSE server for desktop AI clients
- Test, debug, and iterate on tools before exposing them to agents
- Package the experience as a desktop app for non-technical users

## Core Capabilities

- cURL import: parse common request shapes into editable MCP tools
- Tool editor: configure method, URL, headers, body, parameters, and output fields
- Response shaping: extract the useful parts of large JSON responses
- Local persistence: store tools and logs in SQLite
- MCP transport: expose tools through a local SSE endpoint
- Desktop packaging: ship as an Electron app for macOS and Windows

## Use Cases

- Turn internal approval or CRM APIs into agent-callable tools
- Wrap repetitive office workflows behind stable MCP actions
- Prototype agent integrations against existing APIs quickly
- Give AI assistants safe, structured access to business operations

## Screenshots

Add screenshots or a short demo GIF here once the UI is stable. A strong open source landing page benefits a lot from a quick visual preview.

## Architecture

```text
React UI
  -> Electron desktop shell
  -> Local Express server
  -> SQLite storage
  -> MCP SSE endpoint
  -> External APIs imported from cURL definitions
```

Key entry points:

- `src/App.tsx`: main application UI
- `server.ts`: local Express server and MCP SSE implementation
- `electron-main.ts`: Electron main process and desktop bridge
- `src/db.ts`: SQLite persistence layer

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer recommended
- macOS for mac desktop packaging
- Windows for native Windows validation, or macOS with Electron Builder cross-packaging support

### Install

```bash
npm install
```

### Run The Web App

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Run The Desktop App In Development

```bash
npm run electron:dev
```

### Build

```bash
npm run build
```

### Create Desktop Packages

```bash
npm run dist:mac
npm run dist:win
```

### Quality Checks

```bash
npm run check
```

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed.

Important values:

- `PORT`: local HTTP and SSE port
- `NODE_ENV`: development or production
- `DB_PATH`: SQLite database location
- `API_KEY`: optional API key for protecting local MCP access
- `RATE_LIMIT_WINDOW_MS`: API rate limiting window
- `RATE_LIMIT_MAX_REQUESTS`: max requests allowed in the window
- `CORS_ORIGINS`: comma-separated origins
- `LOG_LEVEL`: logger verbosity

## MCP Endpoint

When the server is running locally, the SSE endpoint is:

```text
http://localhost:3000/sse
```

In the packaged desktop app, the UI surfaces the detected local network address to make client setup easier across devices on the same LAN.

## Suggested MCP Client Config

```json
{
  "mcpServers": {
    "mcp-bridge": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

If you enable an API key:

```json
{
  "mcpServers": {
    "mcp-bridge": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "your-secret-api-key"
      }
    }
  }
}
```

## Roadmap

- Safer write-action confirmation for high-risk tools
- Better auth templates for API keys, cookies, and OAuth-style flows
- More robust cURL parsing coverage
- Tool publishing workflow with validation and risk levels
- Richer audit logs, replay, and observability
- Reusable connector templates for office SaaS products

## Contributing

Contributions are welcome. Start here:

- Read [CONTRIBUTING.md](./CONTRIBUTING.md)
- Review [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Check [SECURITY.md](./SECURITY.md) for sensitive reports

## Community Standards

- Be respectful and constructive
- Prefer small, focused pull requests
- Include reproduction steps for bugs
- Keep office automation and agent safety in mind when proposing features

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
