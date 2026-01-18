// Tool: list_repo_pending_comments
// Lists pending PR review comments for the current repository only
import { Effect } from 'effect';
import { McpConfig } from '../shared/config.js';
import { DbService, RepoNotFoundError, SessionNotFoundError, } from '../shared/db.js';
// Schema now defined in index.ts with Zod
export const listRepoPending = (args) => Effect.gen(function* () {
    const db = yield* DbService;
    const config = yield* McpConfig;
    const repoPath = args.repo_path || config.workingDir;
    yield* Effect.logDebug('Listing pending comments for repo', {
        repoPath,
    });
    // Find repo by matching path
    const repoPathRecord = yield* db.queryOne(`SELECT rp.*, r.name as repo_name 
			 FROM repo_paths rp 
			 JOIN repos r ON rp.repo_id = r.id 
			 WHERE rp.path = ?`, [repoPath]);
    if (!repoPathRecord) {
        return yield* Effect.fail(new RepoNotFoundError({ path: repoPath }));
    }
    // Get the active review session for this repo
    const session = yield* db.queryOne(`SELECT rs.* FROM review_sessions rs
			 WHERE rs.repo_id = ?
			 ORDER BY rs.created_at DESC
			 LIMIT 1`, [repoPathRecord.repo_id]);
    if (!session) {
        return yield* Effect.fail(new SessionNotFoundError({
            repoName: repoPathRecord.repo_name,
        }));
    }
    // Get all pending (sent but not delivered) comments for this repo
    const comments = yield* db.query(`SELECT c.*
			 FROM comments c
			 WHERE c.session_id = ?
			   AND c.status = 'sent'
			   AND c.delivered_at IS NULL
			 ORDER BY c.file_path, c.line_start`, [session.id]);
    if (comments.length === 0) {
        return `No pending comments for ${repoPathRecord.repo_name} (${session.branch}).`;
    }
    yield* Effect.logInfo('Found pending comments for repo', {
        repo: repoPathRecord.repo_name,
        count: comments.length,
    });
    // Group by file
    const byFile = new Map();
    for (const comment of comments) {
        const existing = byFile.get(comment.file_path) || [];
        existing.push(comment);
        byFile.set(comment.file_path, existing);
    }
    // Format output
    const lines = [
        `Pending comments for ${repoPathRecord.repo_name} (${session.branch}):`,
        '',
    ];
    for (const [filePath, fileComments] of byFile) {
        lines.push(`📄 ${filePath} (${fileComments.length} comment${fileComments.length === 1 ? '' : 's'})`);
        for (const comment of fileComments) {
            const lineInfo = comment.line_start
                ? `:${comment.line_start}${comment.line_end && comment.line_end !== comment.line_start ? `-${comment.line_end}` : ''}`
                : '';
            const preview = comment.content.length > 60
                ? comment.content.substring(0, 60) + '...'
                : comment.content;
            lines.push(`   • Line${lineInfo || ' (file)'}: ${preview}`);
        }
        lines.push('');
    }
    lines.push(`Total: ${comments.length} pending comment${comments.length === 1 ? '' : 's'}`);
    lines.push('');
    lines.push('Use check_pr_comments to retrieve full comment details.');
    return lines.join('\n');
}).pipe(Effect.withSpan('tool.listRepoPending'));
