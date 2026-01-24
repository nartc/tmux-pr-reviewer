// Tool: mark_comment_resolved
// Marks a PR review comment as resolved

import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import {
	CommentNotFoundError,
	DatabaseError,
	DbService,
} from '../shared/db.js';
import type { Comment } from '../shared/types.js';

const SIGNAL_FILE_NAME = '.local-pr-reviewer-pending';

interface SignalFileData {
	sessionId: string;
	repoPath: string;
	pendingCount: number;
	updatedAt: string;
}

interface MarkResolvedArgs {
	comment_id: string;
}

// Schema now defined in index.ts with Zod

export const markResolved = (
	args: MarkResolvedArgs,
): Effect.Effect<
	string,
	CommentNotFoundError | DatabaseError,
	DbService | FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const db = yield* DbService;
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
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

		// Update signal file with new pending count
		// Get repo path from comment -> session -> repo_paths
		const repoInfo = yield* db.queryOne<{ repo_path: string }>(
			`SELECT rp.path as repo_path
			 FROM comments c
			 JOIN review_sessions rs ON c.session_id = rs.id
			 JOIN repo_paths rp ON rs.repo_id = rp.repo_id
			 WHERE c.id = ?
			 LIMIT 1`,
			[comment_id],
		);

		if (repoInfo) {
			// Count remaining pending comments (sent but not resolved)
			const pendingResult = yield* db.queryOne<{ count: number }>(
				`SELECT COUNT(*) as count
				 FROM comments c
				 JOIN review_sessions rs ON c.session_id = rs.id
				 JOIN repo_paths rp ON rs.repo_id = rp.repo_id
				 WHERE rp.path = ?
				   AND c.status = 'sent'
				   AND c.resolved_at IS NULL`,
				[repoInfo.repo_path],
			);

			const pendingCount = pendingResult?.count ?? 0;
			const signalPath = path.join(repoInfo.repo_path, SIGNAL_FILE_NAME);

			// Update signal file (wrapped to catch all platform errors)
			yield* Effect.gen(function* () {
				const signalExists = yield* fs.exists(signalPath);
				if (!signalExists) return;

				const data: SignalFileData = {
					sessionId: comment.session_id,
					repoPath: repoInfo.repo_path,
					pendingCount,
					updatedAt: new Date().toISOString(),
				};

				yield* fs.writeFileString(
					signalPath,
					JSON.stringify(data, null, 2),
				);

				yield* Effect.logInfo('Signal file updated', {
					signalPath,
					pendingCount,
				});
			}).pipe(
				Effect.catchAll((err) =>
					Effect.logWarning('Failed to update signal file').pipe(
						Effect.annotateLogs({ error: String(err) }),
					),
				),
			);
		}

		return `Comment ${comment_id} marked as resolved.`;
	}).pipe(Effect.withSpan('tool.markResolved'));
