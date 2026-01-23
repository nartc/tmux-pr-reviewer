// Tool: mark_comment_resolved
// Marks a PR review comment as resolved

import { Effect } from 'effect';
import {
	CommentNotFoundError,
	DatabaseError,
	DbService,
} from '../shared/db.js';
import {
	deleteSignal,
	GlobalConfigError,
	updateSignalCount,
} from '../shared/global-config.js';
import type {
	Comment,
	Repo,
	RepoPath,
	ReviewSession,
} from '../shared/types.js';

interface MarkResolvedArgs {
	comment_id: string;
}

// Schema now defined in index.ts with Zod

export const markResolved = (
	args: MarkResolvedArgs,
): Effect.Effect<
	string,
	CommentNotFoundError | DatabaseError | GlobalConfigError,
	DbService
> =>
	Effect.gen(function* () {
		const db = yield* DbService;
		const { comment_id } = args;

		yield* Effect.logInfo('mark_comment_resolved called', { comment_id });

		// Verify comment exists
		const comment = yield* db.queryOne<Comment>(
			'SELECT * FROM comments WHERE id = ?',
			[comment_id],
		);

		if (!comment) {
			return yield* Effect.fail(
				new CommentNotFoundError({ id: comment_id }),
			);
		}

		// Check if already resolved
		if (comment.resolved_at) {
			yield* Effect.logInfo('Comment already resolved', {
				comment_id,
				resolved_at: comment.resolved_at,
			});
			return `Comment ${comment_id} is already resolved (resolved at ${comment.resolved_at})`;
		}

		// Mark as resolved - update both status and resolved_at
		yield* db.execute(
			`UPDATE comments 
			 SET status = 'resolved', resolved_at = datetime('now'), resolved_by = 'agent'
			 WHERE id = ?`,
			[comment_id],
		);

		yield* Effect.logInfo('Comment marked as resolved', { comment_id });

		// Update signal file based on remaining unresolved comments
		const session = yield* db.queryOne<ReviewSession>(
			'SELECT * FROM review_sessions WHERE id = ?',
			[comment.session_id],
		);

		if (session) {
			const remainingCount = yield* db.queryOne<{ count: number }>(
				`SELECT COUNT(*) as count FROM comments 
				 WHERE session_id = ? AND status IN ('sent', 'staged', 'queued')`,
				[session.id],
			);

			// Get repo path and remote URL for signal file
			const repoPath = yield* db.queryOne<RepoPath>(
				'SELECT * FROM repo_paths WHERE repo_id = ? ORDER BY last_accessed_at DESC LIMIT 1',
				[session.repo_id],
			);

			const repo = yield* db.queryOne<Repo>(
				'SELECT * FROM repos WHERE id = ?',
				[session.repo_id],
			);

			if (repoPath) {
				const pendingCount = remainingCount?.count ?? 0;
				if (pendingCount === 0) {
					yield* deleteSignal(
						repoPath.path,
						repo?.remote_url ?? null,
					);
				} else {
					yield* updateSignalCount(
						repoPath.path,
						repo?.remote_url ?? null,
						pendingCount,
					);
				}
			}
		}

		return `Comment ${comment_id} marked as resolved.`;
	}).pipe(Effect.withSpan('tool.markResolved'));
