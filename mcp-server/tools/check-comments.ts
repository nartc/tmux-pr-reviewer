// Tool: check_pr_comments
// Returns pending PR review comments for the current repository

import { Effect } from 'effect';
import { McpConfig } from '../shared/config.js';
import {
	DatabaseError,
	DbService,
	generateId,
	RepoNotFoundError,
	SessionNotFoundError,
} from '../shared/db.js';
import { deleteSignal, updateSignalCount } from '../shared/global-config.js';
import type {
	Comment,
	Repo,
	RepoPath,
	ReviewSession,
} from '../shared/types.js';

interface CheckCommentsArgs {
	repo_path?: string;
}

interface CommentWithDetails extends Comment {
	repo_name: string;
	branch: string;
}

// Schema now defined in index.ts with Zod

import { GlobalConfigError } from '../shared/global-config.js';

export const checkComments = (
	args: CheckCommentsArgs,
	clientId: string,
): Effect.Effect<
	string,
	| RepoNotFoundError
	| SessionNotFoundError
	| DatabaseError
	| GlobalConfigError,
	DbService | McpConfig
> =>
	Effect.gen(function* () {
		const db = yield* DbService;
		const config = yield* McpConfig;
		const repoPath = args.repo_path || config.workingDir;

		yield* Effect.logDebug('Checking comments for repo', {
			repoPath,
			clientId,
		});

		// Find repo by matching path
		const repoPathRecord = yield* db.queryOne<
			RepoPath & { repo_name: string }
		>(
			`SELECT rp.*, r.name as repo_name 
			 FROM repo_paths rp 
			 JOIN repos r ON rp.repo_id = r.id 
			 WHERE rp.path = ?`,
			[repoPath],
		);

		if (!repoPathRecord) {
			return yield* Effect.fail(
				new RepoNotFoundError({ path: repoPath }),
			);
		}

		// Get the active review session for this repo
		const session = yield* db.queryOne<ReviewSession>(
			`SELECT rs.* FROM review_sessions rs
			 WHERE rs.repo_id = ?
			 ORDER BY rs.created_at DESC
			 LIMIT 1`,
			[repoPathRecord.repo_id],
		);

		if (!session) {
			return yield* Effect.fail(
				new SessionNotFoundError({
					repoName: repoPathRecord.repo_name,
				}),
			);
		}

		// Get comments that are 'sent' but not yet delivered to this client
		const comments = yield* db.query<CommentWithDetails>(
			`SELECT c.*, r.name as repo_name, rs.branch
			 FROM comments c
			 JOIN review_sessions rs ON c.session_id = rs.id
			 JOIN repos r ON rs.repo_id = r.id
			 WHERE c.session_id = ?
			   AND c.status = 'sent'
			   AND c.id NOT IN (
			     SELECT comment_id FROM comment_deliveries WHERE client_id = ?
			   )
			 ORDER BY c.file_path, c.line_start`,
			[session.id, clientId],
		);

		if (comments.length === 0) {
			yield* Effect.logInfo('No pending comments', {
				repo: repoPathRecord.repo_name,
			});
			return 'No pending PR review comments for this repository.';
		}

		// Record delivery for each comment
		for (const comment of comments) {
			yield* db
				.execute(
					`INSERT INTO comment_deliveries (id, comment_id, client_id, delivered_at)
					 VALUES (?, ?, ?, datetime('now'))`,
					[generateId(), comment.id, clientId],
				)
				.pipe(Effect.catchAll(() => Effect.succeed({ changes: 0 })));

			// Update comment's delivered_at if this is first delivery
			if (!comment.delivered_at) {
				yield* db.execute(
					`UPDATE comments SET delivered_at = datetime('now') WHERE id = ?`,
					[comment.id],
				);
			}
		}

		yield* Effect.logInfo('Delivered comments', {
			repo: repoPathRecord.repo_name,
			count: comments.length,
			clientId,
		});

		// Update signal file based on remaining unresolved comments
		const remainingCount = yield* db.queryOne<{ count: number }>(
			`SELECT COUNT(*) as count FROM comments 
			 WHERE session_id = ? AND status IN ('sent', 'staged', 'queued')`,
			[session.id],
		);

		// Get repo's remote URL for signal file path
		const repo = yield* db.queryOne<Repo>(
			'SELECT * FROM repos WHERE id = ?',
			[repoPathRecord.repo_id],
		);

		const pendingCount = remainingCount?.count ?? 0;
		if (pendingCount === 0) {
			// No more pending comments, delete the signal
			yield* deleteSignal(repoPath, repo?.remote_url ?? null);
		} else {
			// Update the signal with new count
			yield* updateSignalCount(
				repoPath,
				repo?.remote_url ?? null,
				pendingCount,
			);
		}

		// Format output
		const lines: string[] = [
			`Found ${comments.length} PR review comment${comments.length === 1 ? '' : 's'} for ${repoPathRecord.repo_name} (${session.branch}):`,
			'',
		];

		comments.forEach((comment, index) => {
			const location = formatLocation(comment);
			lines.push(`${index + 1}. [${location}]`);
			lines.push(comment.content);
			lines.push(`   (id: ${comment.id})`);
			lines.push('');
		});

		return lines.join('\n');
	}).pipe(Effect.withSpan('tool.checkComments'));

const formatLocation = (comment: Comment): string => {
	if (comment.line_start === null) {
		return comment.file_path;
	}
	if (comment.line_end !== null && comment.line_end !== comment.line_start) {
		return `${comment.file_path}:${comment.line_start}-${comment.line_end}`;
	}
	return `${comment.file_path}:${comment.line_start}`;
};
