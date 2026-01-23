# Plan: High-DX Flow for Local PR Reviewer

## Context

Transform local-pr-reviewer from manual setup + polling to automatic setup + signal-based awareness. Agent sets up once globally, works everywhere across all repos and sessions.

## Current vs New Flow

### Current (Clunky)

1. User manually clones repo
2. User runs pnpm install, build, start
3. User manually configures MCP server
4. User adds comments via webapp
5. User manually asks agent "check for PR comments"

### New (High-DX)

1. User says "set up local-pr-reviewer" or "/local-pr-review setup"
2. Agent handles everything (clone, build, config, start)
3. User adds comments via webapp
4. Agent automatically detects and asks to address comments

---

## Phase 1: Config & Signal Infrastructure

### File Structure

```
~/.config/local-pr-reviewer/
├── config.json                         # Install config
├── runtime.json                        # Running webapp info
└── signals/
    └── {owner}-{repo}-{hash6}.json     # Pending review signals
```

### config.json

```json
{
	"installPath": "/Users/nartc/tools/local-pr-reviewer",
	"installedAt": "2026-01-20T10:00:00Z"
}
```

### runtime.json

```json
{
	"port": 3456,
	"pid": 12345,
	"startedAt": "2026-01-23T14:00:00Z"
}
```

### Signal file (e.g., `nartc-my-project-a1b2c3.json`)

```json
{
	"repoPath": "/Users/nartc/code/my-project",
	"sessionId": "uuid-here",
	"pendingCount": 3,
	"createdAt": "2026-01-23T14:30:00Z",
	"remoteUrl": "git@github.com:nartc/my-project.git"
}
```

### New File: `app/lib/global-config.ts`

| Function                         | Purpose                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `getConfigDir()`                 | Returns `~/.config/local-pr-reviewer/`, creates if missing   |
| `getConfig()`                    | Reads `config.json`                                          |
| `saveConfig(data)`               | Writes `config.json`                                         |
| `getRuntime()`                   | Reads `runtime.json`                                         |
| `saveRuntime(data)`              | Writes `runtime.json`                                        |
| `getSignalsDir()`                | Returns `{configDir}/signals/`, creates if missing           |
| `writeSignal(repo)`              | Creates/updates signal file                                  |
| `deleteSignal(repo)`             | Removes signal file                                          |
| `updateSignalCount(repo, delta)` | Increments/decrements pendingCount                           |
| `getSignalFileName(repoPath)`    | Returns `{owner}-{repo}-{hash6}.json` (hash from local path) |

---

## Phase 2: Webapp Changes

### 2.1 Signal Management

| Change                       | File                           | Description                                |
| ---------------------------- | ------------------------------ | ------------------------------------------ |
| Write signal on send         | `app/routes/api.send.ts`       | After `markAsSent()`, call `writeSignal()` |
| Update signal on resolve     | `app/routes/api.comments.ts`   | Decrement `pendingCount`, delete if 0      |
| Delete signal on session end | `app/services/repo-service.ts` | New method for ending session              |

### 2.2 Health Endpoint

**New file**: `app/routes/api.health.ts`

```typescript
// GET /api/health
export function loader() {
	return Response.json({ status: 'ok' });
}
```

### 2.3 UI Additions

| UI Element           | Location                | Action                         |
| -------------------- | ----------------------- | ------------------------------ |
| "End Session" button | `app/routes/review.tsx` | Ends session, deletes signal   |
| "Delete Repo" action | `app/routes/_index.tsx` | Removes repo, cleans up signal |

### 2.4 Port Auto-Assignment

**Modify**: `server.js`

```javascript
import { createServer } from 'net';

async function findAvailablePort(startPort = 3000, endPort = 3999) {
	const randomPort = () =>
		Math.floor(Math.random() * (endPort - startPort + 1)) + startPort;

	const isPortAvailable = (port) =>
		new Promise((resolve) => {
			const server = createServer();
			server.once('error', () => resolve(false));
			server.once('listening', () => {
				server.close();
				resolve(true);
			});
			server.listen(port);
		});

	// Try specified PORT env first, then random
	const portsToTry = process.env.PORT
		? [parseInt(process.env.PORT)]
		: Array.from({ length: 10 }, randomPort);

	for (const port of portsToTry) {
		if (await isPortAvailable(port)) return port;
	}
	throw new Error('No available port found');
}

const PORT = await findAvailablePort();

// Write runtime.json
const runtimePath = path.join(
	os.homedir(),
	'.config/local-pr-reviewer/runtime.json',
);
fs.writeFileSync(
	runtimePath,
	JSON.stringify(
		{
			port: PORT,
			pid: process.pid,
			startedAt: new Date().toISOString(),
		},
		null,
		2,
	),
);

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});

// Cleanup runtime.json on graceful shutdown
const cleanup = () => {
	try {
		fs.unlinkSync(runtimePath);
	} catch {}
	process.exit(0);
};
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
```

---

## Phase 3: MCP Server Changes

### 3.1 New Tool: `check_for_pending_reviews`

**New file**: `mcp-server/tools/check-pending-reviews.ts`

**Purpose**: Lightweight signal scan - no DB, just filesystem

**Input**: None

**Output**:

```json
{
	"configured": true,
	"webappUrl": "http://localhost:3456",
	"hasPending": true,
	"pending": [
		{
			"repoPath": "/Users/nartc/code/my-project",
			"repoName": "nartc/my-project",
			"pendingCount": 3,
			"waitingSince": "2026-01-23T14:30:00Z"
		}
	]
}
```

**Logic**:

1. Read `~/.config/local-pr-reviewer/config.json`
    - If missing → return `{ configured: false }`
2. Read `runtime.json` for webapp URL
3. Scan signals directory
4. For each `.json` file:
    - Parse content
    - If `createdAt` > 7 days → delete (stale cleanup)
    - Else → add to pending list
5. Return results

### 3.2 Enhanced: `check_pr_comments`

**Modify**: `mcp-server/tools/check-comments.ts`

After successful delivery:

1. Recalculate pending count for session
2. If all resolved → delete signal file
3. Else → update signal with new count

### 3.3 Shared Utilities

**New file**: `mcp-server/shared/global-config.ts`

Mirror of webapp utilities:

- `getConfigDir()`
- `getSignalsDir()`
- `readSignal(repoPath)`
- `deleteSignal(repoPath)`
- `updateSignalCount(repoPath, count)`
- `cleanupStaleSignals()`

### 3.4 Register New Tool

**Modify**: `mcp-server/index.ts`

Add `check_for_pending_reviews` to tool registration.

---

## Phase 4: Build Script Split

**Modify**: `package.json`

```json
{
	"scripts": {
		"build": "pnpm build:app && pnpm build:mcp",
		"build:app": "react-router build",
		"build:mcp": "tsup mcp-server/index.ts --format esm --dts"
	}
}
```

---

## Phase 5: Agent Instructions & Skills

### 5.1 Main Instructions File

**New file**: `AGENT_INSTRUCTIONS.md` (repo root)

````markdown
# Local PR Reviewer - Agent Instructions

## Overview

Local PR Reviewer enables code review workflows via a local webapp + MCP integration.
Agents can automatically detect pending review comments and address them.

## Quick Check

- Config: `~/.config/local-pr-reviewer/config.json`
- If missing → not set up, offer to set up
- If exists → verify setup, check signals on review-related keywords

## First-Time Setup Flow

Gather all information first, then execute:

### Questions Phase

1. Ask: "Where should I clone local-pr-reviewer? (e.g., ~/tools)"
2. Ask: "Clone via HTTPS or SSH?"
3. Ask: "Which coding agents do you use?" (Claude Code, OpenCode, etc.)
4. Ask: "Set up AI for smart comment processing? (y/n)"
    - If yes: "Which provider? (google/openai/anthropic)"
    - If yes: "API key for {provider}?"
5. Ask: "Paths to scan for git repos? (comma-separated, default: ~/code)"

### Execution Phase

6. Clone repo to `{install-path}/local-pr-reviewer`
7. Write `.env` file with collected config
8. Run: `pnpm install`
9. Run: `pnpm build`
10. Configure MCP for selected agents (see MCP Config section)
11. Register skills for selected agents (see Skill Registration section)
12. Write `~/.config/local-pr-reviewer/config.json`
13. Start webapp in background

## Subsequent Setup (Idempotent)

1. Check `config.json` exists? → if no, run first-time setup
2. Check `installPath` exists? → if no, re-clone
3. Check `node_modules` exists? → if no, run `pnpm install`
4. Check build output exists? → if no, run `pnpm build`
5. Health check `GET http://localhost:{port}/api/health` (read port from `runtime.json`)
    - If fail (3 retries) → start webapp
6. Ready

## Runtime Behavior

### Trigger Keywords

When user mentions: review, PR, pull request, comment, feedback, suggestion, address, fix

### Action

1. Call `check_for_pending_reviews` MCP tool
2. If `hasPending: true`:
    - Say: "You have {count} pending review comments for {repoName}. Want me to address them?"
3. If user confirms:
    - Call `check_pr_comments` for that repo
    - Address each comment
    - Call `mark_comment_resolved` after addressing

## Starting the Webapp

### Check if Running

Read `~/.config/local-pr-reviewer/runtime.json`:

- If exists and PID is alive → webapp running at `http://localhost:{port}`
- If not → start webapp

### Start Command (Platform-Specific)

**macOS/Linux:**

```bash
cd {installPath}
nohup pnpm start > ~/.config/local-pr-reviewer/webapp.log 2>&1 &
```
````

**Windows:**

```cmd
cd {installPath}
start /b pnpm start > %USERPROFILE%\.config\local-pr-reviewer\webapp.log 2>&1
```

### Health Check

After starting, retry `GET /api/health` up to 3 times with 2-second delays.

## Error Handling

### pnpm install failure

Show error output, then suggest:

1. "Check Node.js version (requires Node 18+)"
2. "Try clearing pnpm cache: `pnpm store prune`"
3. "Check network connectivity"

Ask: "Want me to retry pnpm install?"

### pnpm build failure

Show error output, then suggest:

1. "Check for TypeScript errors in the output"
2. "Try removing node_modules and reinstalling: `rm -rf node_modules && pnpm install`"
3. "Check if all dependencies are installed"

Ask: "Want me to retry the build?"

### Webapp start failure

Show error output, then suggest:

1. "Check if another process is using the port"
2. "Check webapp.log for details: `~/.config/local-pr-reviewer/webapp.log`"
3. "Try rebuilding: `pnpm build`"

Ask: "Want me to retry starting the webapp?"

## MCP Configuration

### Config Detection

Before modifying, detect existing config file:

**Claude Code:**

1. Check `~/.claude/settings.json` exists? → use it
2. Else check `~/.claude.json` exists? → use it
3. Else create `~/.claude.json`

**OpenCode:**

1. Check `$XDG_CONFIG_HOME/opencode/.opencode.json` → use it
2. Else check `~/.opencode.json` → use it
3. Else create `~/.opencode.json`

### MCP Server Entry

Add to the detected config file under `mcpServers`:

```json
{
	"mcpServers": {
		"local-pr-reviewer": {
			"command": "node",
			"args": [
				"{installPath}/local-pr-reviewer/dist/mcp-server/index.js"
			],
			"env": {}
		}
	}
}
```

## Skill Registration

### Claude Code

**Skill files shipped in repo**: `{installPath}/local-pr-reviewer/skills/claude/`

```
{installPath}/local-pr-reviewer/skills/claude/
├── local-pr-review.md          # Slash command content
└── CLAUDE.md.snippet           # Content to append to ~/.claude/CLAUDE.md
```

**Global instructions** - Append `skills/claude/CLAUDE.md.snippet` to `~/.claude/CLAUDE.md`:

```markdown
## Local PR Review

When user mentions: review, PR, pull request, comment, feedback
→ Call `check_for_pending_reviews` MCP tool
→ If pending: ask user before addressing

For setup: `/local-pr-review setup`
```

**Slash command** - Copy or symlink `skills/claude/local-pr-review.md` to `~/.claude/commands/local-pr-review.md`:

```markdown
# /local-pr-review

Usage:

- `/local-pr-review setup` - First-time setup or verify installation
- `/local-pr-review start` - Start webapp if not running
- `/local-pr-review check` - Check for pending reviews
- `/local-pr-review status` - Show current state (webapp running, port, pending counts)
- `/local-pr-review open` - Open webapp in browser

[Include full setup flow from this document]
```

### OpenCode

OpenCode uses a directory-based skill format with symlinks.

**Skill directory shipped in repo**: `{installPath}/local-pr-reviewer/skills/opencode/`

```
{installPath}/local-pr-reviewer/skills/opencode/
├── SKILL.md
└── rules/
    ├── setup.md
    ├── runtime.md
    └── tools.md
```

**SKILL.md**:

```markdown
---
name: local-pr-review
description: Local PR review workflow with automatic comment detection
metadata:
    tags: pr, review, code-review, mcp, comments
---

## When to use

Use this skill when user mentions: review, PR, pull request, comment, feedback, suggestion

## How to use

Read individual rule files for detailed instructions:

- [rules/setup.md](rules/setup.md) - First-time and idempotent setup
- [rules/runtime.md](rules/runtime.md) - Checking for pending reviews, starting webapp
- [rules/tools.md](rules/tools.md) - MCP tool reference
```

**Symlink**: Create symlink during setup:

```bash
ln -s {installPath}/local-pr-reviewer/skills/opencode ~/.config/opencode/skills/local-pr-review
```

## MCP Tools Reference

| Tool                         | Purpose                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `check_for_pending_reviews`  | Lightweight signal scan - returns pending reviews across all repos |
| `check_pr_comments`          | Get full comment details for current repo, marks as delivered      |
| `mark_comment_resolved`      | Mark a comment as resolved after addressing                        |
| `list_pending_comments`      | List pending comments across all repos (legacy)                    |
| `list_repo_pending_comments` | List pending for current repo only (legacy)                        |
| `get_comment_details`        | Get details of a specific comment by ID                            |

## .env File Template

```env
# AI Provider (optional - skip for manual-only comments)
AI_PROVIDER=google
GOOGLE_API_KEY=your-key-here

# Repository scanning
REPO_SCAN_ROOT=/Users/you/code,/Users/you/projects
REPO_SCAN_MAX_DEPTH=3
```

````

### 5.2 README Update

**Modify**: `README.md`

Add after intro section:
```markdown
## For AI Agents

If you're an AI coding agent helping a user, see [AGENT_INSTRUCTIONS.md](./AGENT_INSTRUCTIONS.md) for automated setup and usage instructions.
````

---

## Phase 6: Signal Lifecycle

| Event               | Signal Action                                      |
| ------------------- | -------------------------------------------------- |
| Comments sent       | Create/update signal (`pendingCount = sent count`) |
| Comments delivered  | No change (delivery tracked in DB per-agent)       |
| Comment resolved    | Decrement `pendingCount`, delete if 0              |
| Session ended (UI)  | Delete signal                                      |
| Repo deleted (UI)   | Delete signal                                      |
| Signal age > 7 days | Delete (stale cleanup during scan)                 |

---

## Files Summary

### New Files

| File                                        | Purpose                                  |
| ------------------------------------------- | ---------------------------------------- |
| `app/lib/global-config.ts`                  | Config & signal utilities (webapp)       |
| `app/routes/api.health.ts`                  | Health check endpoint                    |
| `mcp-server/tools/check-pending-reviews.ts` | New MCP tool                             |
| `mcp-server/shared/global-config.ts`        | Config & signal utilities (MCP)          |
| `AGENT_INSTRUCTIONS.md`                     | LLM-readable setup/usage docs            |
| `skills/opencode/SKILL.md`                  | OpenCode skill manifest                  |
| `skills/opencode/rules/setup.md`            | OpenCode skill: setup instructions       |
| `skills/opencode/rules/runtime.md`          | OpenCode skill: runtime behavior         |
| `skills/opencode/rules/tools.md`            | OpenCode skill: MCP tools reference      |
| `skills/claude/local-pr-review.md`          | Claude Code slash command                |
| `skills/claude/CLAUDE.md.snippet`           | Snippet to append to ~/.claude/CLAUDE.md |

### Modified Files

| File                                 | Changes                                  |
| ------------------------------------ | ---------------------------------------- |
| `server.js`                          | Port auto-assignment, write runtime.json |
| `app/routes/api.send.ts`             | Write signal on send                     |
| `app/routes/api.comments.ts`         | Update signal on resolve                 |
| `app/services/repo-service.ts`       | End session method                       |
| `app/routes/review.tsx`              | End Session button                       |
| `app/routes/_index.tsx`              | Delete Repo action                       |
| `mcp-server/tools/check-comments.ts` | Update/delete signal after delivery      |
| `mcp-server/index.ts`                | Register new tool                        |
| `package.json`                       | Build script split                       |
| `README.md`                          | Link to agent instructions               |

---

## Resolved Questions

- [x] Should `runtime.json` cleanup happen on graceful shutdown? → **Yes**, added SIGTERM/SIGINT handlers
- [x] OpenCode skill format → **Directory-based**: `SKILL.md` with frontmatter + `rules/` subdirectory, symlinked to `~/.config/opencode/skills/`
- [x] `/local-pr-review status` command → **Yes**, added to slash command options
- [x] Skill files shipped in repo? → **Yes**, ship in `skills/` directory, symlink during setup
- [x] Error handling for pnpm install/build failures → **Show error, suggest common fixes, ask to retry**
