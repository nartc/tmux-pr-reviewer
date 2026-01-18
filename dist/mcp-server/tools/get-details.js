// Tool: get_comment_details
// Gets detailed information about a specific comment
import { Effect } from 'effect';
import { CommentNotFoundError, DbService, } from '../shared/db.js';
export const getDetails = (args) => Effect.gen(function* () {
    const db = yield* DbService;
    const { comment_id } = args;
    yield* Effect.logDebug('Getting comment details', { comment_id });
    const comment = yield* db.queryOne(`SELECT c.*, r.name as repo_name, rs.branch
			 FROM comments c
			 JOIN review_sessions rs ON c.session_id = rs.id
			 JOIN repos r ON rs.repo_id = r.id
			 WHERE c.id = ?`, [comment_id]);
    if (!comment) {
        return yield* Effect.fail(new CommentNotFoundError({ id: comment_id }));
    }
    yield* Effect.logInfo('Retrieved comment details', {
        comment_id,
        repo: comment.repo_name,
    });
    const details = {
        id: comment.id,
        repo: comment.repo_name,
        branch: comment.branch,
        file_path: comment.file_path,
        line_start: comment.line_start,
        line_end: comment.line_end,
        side: comment.side,
        content: comment.content,
        status: comment.status,
        created_at: comment.created_at,
        sent_at: comment.sent_at,
        delivered_at: comment.delivered_at,
        resolved_at: comment.resolved_at,
        resolved_by: comment.resolved_by,
    };
    return JSON.stringify(details, null, 2);
}).pipe(Effect.withSpan('tool.getDetails'));
