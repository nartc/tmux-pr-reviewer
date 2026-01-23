# Runtime Behavior

## Trigger Keywords

When user mentions: review, PR, pull request, comment, feedback, suggestion, address, fix

## Action Flow

1. Call `check_for_pending_reviews` MCP tool
2. If `hasPending: true`:
    - Ask: "You have {count} pending review comments for {repoName}. Want me to address them?"
3. If user confirms:
    - Call `check_pr_comments` for that repo
    - Address each comment
    - Call `mark_comment_resolved` after addressing

## Starting the Webapp

### Check if Running

Read `~/.config/local-pr-reviewer/runtime.json`:

- If exists and PID is alive: webapp running at `http://localhost:{port}`
- If not: start webapp

### Start Command

```bash
cd {installPath}
nohup pnpm start > ~/.config/local-pr-reviewer/webapp.log 2>&1 &
```

### Health Check

After starting, retry `GET /api/health` up to 3 times with 2-second delays.

## Webapp URL

Tell user to open: `http://localhost:{port}` (from runtime.json)
