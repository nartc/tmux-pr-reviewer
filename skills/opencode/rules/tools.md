# MCP Tools Reference

## check_for_pending_reviews

Lightweight signal scan - returns pending reviews across all repos.

- No database access required
- Returns list of repos with pending counts
- Use at start of conversations

## check_pr_comments

Get full comment details for current repo.

- Marks comments as delivered
- Returns file paths, line numbers, content
- Use when addressing comments

Arguments:

- `repo_path` (optional): Repository path, auto-detected from cwd

## mark_comment_resolved

Mark a comment as resolved after addressing.

Arguments:

- `comment_id`: The comment ID from check_pr_comments

## list_pending_comments

List pending comments across all repos (legacy).

## list_repo_pending_comments

List pending for current repo only (legacy).

Arguments:

- `repo_path` (optional): Repository path

## get_comment_details

Get details of a specific comment by ID.

Arguments:

- `comment_id`: The comment ID
