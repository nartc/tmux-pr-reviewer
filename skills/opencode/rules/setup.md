# Setup

## Quick Check

- Config: `~/.config/local-pr-reviewer/config.json`
- If missing: not set up, offer to set up
- If exists: verify setup

## First-Time Setup

1. Ask: "Where should I clone local-pr-reviewer? (e.g., ~/tools)"
2. Ask: "Clone via HTTPS or SSH?"
3. Ask: "Set up AI for smart comment processing? (y/n)"
4. Ask: "Paths to scan for git repos?"

Then execute:

1. Clone to `{path}/local-pr-reviewer`
2. Write `.env`
3. Run `pnpm install && pnpm build`
4. Configure MCP in `~/.opencode.json`
5. Write `~/.config/local-pr-reviewer/config.json`
6. Start webapp

## Idempotent Check

1. `config.json` exists? If no, full setup
2. `installPath` exists? If no, re-clone
3. `node_modules` exists? If no, `pnpm install`
4. Build exists? If no, `pnpm build`
5. Health check passes? If no, start webapp

## MCP Config

Add to `~/.opencode.json`:

```json
{
	"mcpServers": {
		"local-pr-reviewer": {
			"command": "node",
			"args": ["{installPath}/local-pr-reviewer/dist/mcp-server/index.js"]
		}
	}
}
```
