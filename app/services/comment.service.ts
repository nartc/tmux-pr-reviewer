import { Context, Effect, Layer } from 'effect';
import { generateId } from '../lib/effect-runtime';
import {
	CommentNotFoundError,
	CommentValidationError,
	DatabaseError,
} from '../lib/errors.js';
import { DbService, execute, query, queryOne } from './db.service';

// Types
export type CommentStatus = 'queued' | 'staged' | 'sent' | 'cancelled';
export type CommentSide = 'old' | 'new' | 'both';

export interface Comment {
	id: string;
	session_id: string;
	file_path: string;
	line_start: number | null;
	line_end: number | null;
	side: CommentSide | null;
	content: string;
	status: CommentStatus;
	created_at: string;
	sent_at: string | null;
}

export interface CreateCommentInput {
	sessionId: string;
	filePath: string;
	lineStart?: number;
	lineEnd?: number;
	side?: CommentSide;
	content: string;
}

export interface UpdateCommentInput {
	content?: string;
	status?: CommentStatus;
}

// CommentService interface
export interface CommentService {
	readonly getSessionComments: (
		sessionId: string,
	) => Effect.Effect<Comment[], DatabaseError, DbService>;

	readonly getCommentsByStatus: (
		sessionId: string,
		status: CommentStatus,
	) => Effect.Effect<Comment[], DatabaseError, DbService>;

	readonly getQueuedComments: (
		sessionId: string,
	) => Effect.Effect<Comment[], DatabaseError, DbService>;

	readonly getStagedComments: (
		sessionId: string,
	) => Effect.Effect<Comment[], DatabaseError, DbService>;

	readonly getSentComments: (
		sessionId: string,
	) => Effect.Effect<Comment[], DatabaseError, DbService>;

	readonly getComment: (
		id: string,
	) => Effect.Effect<Comment | undefined, DatabaseError, DbService>;

	readonly createComment: (
		input: CreateCommentInput,
	) => Effect.Effect<
		Comment,
		DatabaseError | CommentValidationError,
		DbService
	>;

	readonly updateComment: (
		id: string,
		input: UpdateCommentInput,
	) => Effect.Effect<
		Comment,
		DatabaseError | CommentNotFoundError,
		DbService
	>;

	readonly deleteComment: (
		id: string,
	) => Effect.Effect<boolean, DatabaseError, DbService>;

	readonly updateCommentsStatus: (
		ids: string[],
		status: CommentStatus,
	) => Effect.Effect<number, DatabaseError, DbService>;

	readonly stageComments: (
		ids: string[],
	) => Effect.Effect<number, DatabaseError, DbService>;

	readonly markAsSent: (
		ids: string[],
	) => Effect.Effect<number, DatabaseError, DbService>;

	readonly cancelComments: (
		ids: string[],
	) => Effect.Effect<number, DatabaseError, DbService>;

	readonly getCommentCounts: (
		sessionId: string,
	) => Effect.Effect<Record<CommentStatus, number>, DatabaseError, DbService>;
}

export const CommentService =
	Context.GenericTag<CommentService>('CommentService');

// Implementation
const makeCommentService = (): CommentService => {
	const getSessionComments = (sessionId: string) =>
		query<Comment>(
			'SELECT * FROM comments WHERE session_id = ? ORDER BY file_path, line_start',
			[sessionId],
		).pipe(Effect.withSpan('comment.getSessionComments'));

	const getCommentsByStatus = (sessionId: string, status: CommentStatus) =>
		query<Comment>(
			'SELECT * FROM comments WHERE session_id = ? AND status = ? ORDER BY file_path, line_start',
			[sessionId, status],
		).pipe(Effect.withSpan('comment.getCommentsByStatus'));

	const getQueuedComments = (sessionId: string) =>
		getCommentsByStatus(sessionId, 'queued');

	const getStagedComments = (sessionId: string) =>
		getCommentsByStatus(sessionId, 'staged');

	const getSentComments = (sessionId: string) =>
		query<Comment>(
			"SELECT * FROM comments WHERE session_id = ? AND status = 'sent' ORDER BY sent_at DESC",
			[sessionId],
		).pipe(Effect.withSpan('comment.getSentComments'));

	const getComment = (id: string) =>
		queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [id]).pipe(
			Effect.withSpan('comment.getComment'),
		);

	const createComment = (input: CreateCommentInput) =>
		Effect.gen(function* () {
			// Validate input
			if (!input.content.trim()) {
				return yield* Effect.fail(
					new CommentValidationError({
						field: 'content',
						message: 'Comment content cannot be empty',
					}),
				);
			}

			const id = generateId();

			yield* execute(
				`INSERT INTO comments (id, session_id, file_path, line_start, line_end, side, content, status)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
				[
					id,
					input.sessionId,
					input.filePath,
					input.lineStart ?? null,
					input.lineEnd ?? null,
					input.side ?? null,
					input.content,
				],
			);

			const comment = yield* queryOne<Comment>(
				'SELECT * FROM comments WHERE id = ?',
				[id],
			);

			// This should never happen, but TypeScript needs it
			if (!comment) {
				return yield* Effect.fail(
					new CommentValidationError({
						field: 'id',
						message: 'Failed to create comment',
					}),
				);
			}

			yield* Effect.logInfo('Comment created', {
				id,
				sessionId: input.sessionId,
			});
			return comment;
		}).pipe(Effect.withSpan('comment.createComment'));

	const updateComment = (id: string, input: UpdateCommentInput) =>
		Effect.gen(function* () {
			const existing = yield* getComment(id);
			if (!existing) {
				return yield* Effect.fail(new CommentNotFoundError({ id }));
			}

			const updates: string[] = [];
			const values: unknown[] = [];

			if (input.content !== undefined) {
				updates.push('content = ?');
				values.push(input.content);
			}
			if (input.status !== undefined) {
				updates.push('status = ?');
				values.push(input.status);
			}

			if (updates.length === 0) {
				return existing;
			}

			values.push(id);
			yield* execute(
				`UPDATE comments SET ${updates.join(', ')} WHERE id = ?`,
				values,
			);

			const updated = yield* queryOne<Comment>(
				'SELECT * FROM comments WHERE id = ?',
				[id],
			);

			yield* Effect.logDebug('Comment updated', { id });
			return updated as Comment;
		}).pipe(Effect.withSpan('comment.updateComment'));

	const deleteComment = (id: string) =>
		Effect.gen(function* () {
			const result = yield* execute('DELETE FROM comments WHERE id = ?', [
				id,
			]);
			yield* Effect.logDebug('Comment deleted', {
				id,
				deleted: result.changes > 0,
			});
			return result.changes > 0;
		}).pipe(Effect.withSpan('comment.deleteComment'));

	const updateCommentsStatus = (ids: string[], status: CommentStatus) =>
		Effect.gen(function* () {
			if (ids.length === 0) return 0;

			const placeholders = ids.map(() => '?').join(', ');
			const result = yield* execute(
				`UPDATE comments SET status = ? WHERE id IN (${placeholders})`,
				[status, ...ids],
			);
			yield* Effect.logDebug('Comments status updated', {
				count: result.changes,
				status,
			});
			return result.changes;
		}).pipe(Effect.withSpan('comment.updateCommentsStatus'));

	const stageComments = (ids: string[]) =>
		updateCommentsStatus(ids, 'staged');

	const markAsSent = (ids: string[]) =>
		Effect.gen(function* () {
			if (ids.length === 0) return 0;

			const placeholders = ids.map(() => '?').join(', ');
			const result = yield* execute(
				`UPDATE comments SET status = 'sent', sent_at = datetime('now') WHERE id IN (${placeholders})`,
				ids,
			);
			yield* Effect.logInfo('Comments marked as sent', {
				count: result.changes,
			});
			return result.changes;
		}).pipe(Effect.withSpan('comment.markAsSent'));

	const cancelComments = (ids: string[]) =>
		updateCommentsStatus(ids, 'cancelled');

	const getCommentCounts = (sessionId: string) =>
		Effect.gen(function* () {
			const results = yield* query<{
				status: CommentStatus;
				count: number;
			}>(
				`SELECT status, COUNT(*) as count 
				 FROM comments 
				 WHERE session_id = ? 
				 GROUP BY status`,
				[sessionId],
			);

			const counts: Record<CommentStatus, number> = {
				queued: 0,
				staged: 0,
				sent: 0,
				cancelled: 0,
			};

			for (const row of results) {
				counts[row.status] = row.count;
			}

			return counts;
		}).pipe(Effect.withSpan('comment.getCommentCounts'));

	return {
		getSessionComments,
		getCommentsByStatus,
		getQueuedComments,
		getStagedComments,
		getSentComments,
		getComment,
		createComment,
		updateComment,
		deleteComment,
		updateCommentsStatus,
		stageComments,
		markAsSent,
		cancelComments,
		getCommentCounts,
	};
};

// Live layer
export const CommentServiceLive = Layer.succeed(
	CommentService,
	makeCommentService(),
);

// Legacy compatibility - direct service for use outside Effect context
import { getDatabase } from './db.service';

export const commentService = {
	getSessionComments: (sessionId: string): Comment[] => {
		const db = getDatabase();
		return db
			.prepare(
				'SELECT * FROM comments WHERE session_id = ? ORDER BY file_path, line_start',
			)
			.all(sessionId) as Comment[];
	},

	getCommentsByStatus: (
		sessionId: string,
		status: CommentStatus,
	): Comment[] => {
		const db = getDatabase();
		return db
			.prepare(
				'SELECT * FROM comments WHERE session_id = ? AND status = ? ORDER BY file_path, line_start',
			)
			.all(sessionId, status) as Comment[];
	},

	getQueuedComments: (sessionId: string): Comment[] => {
		return commentService.getCommentsByStatus(sessionId, 'queued');
	},

	getStagedComments: (sessionId: string): Comment[] => {
		return commentService.getCommentsByStatus(sessionId, 'staged');
	},

	getSentComments: (sessionId: string): Comment[] => {
		const db = getDatabase();
		return db
			.prepare(
				"SELECT * FROM comments WHERE session_id = ? AND status = 'sent' ORDER BY sent_at DESC",
			)
			.all(sessionId) as Comment[];
	},

	getComment: (id: string): Comment | undefined => {
		const db = getDatabase();
		return db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as
			| Comment
			| undefined;
	},

	createComment: (input: CreateCommentInput): Comment => {
		const db = getDatabase();
		const id = generateId();

		db.prepare(
			`INSERT INTO comments (id, session_id, file_path, line_start, line_end, side, content, status)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
		).run(
			id,
			input.sessionId,
			input.filePath,
			input.lineStart ?? null,
			input.lineEnd ?? null,
			input.side ?? null,
			input.content,
		);

		return db
			.prepare('SELECT * FROM comments WHERE id = ?')
			.get(id) as Comment;
	},

	updateComment: (
		id: string,
		input: UpdateCommentInput,
	): Comment | undefined => {
		const db = getDatabase();
		const existing = commentService.getComment(id);
		if (!existing) return undefined;

		const updates: string[] = [];
		const values: unknown[] = [];

		if (input.content !== undefined) {
			updates.push('content = ?');
			values.push(input.content);
		}
		if (input.status !== undefined) {
			updates.push('status = ?');
			values.push(input.status);
		}

		if (updates.length === 0) return existing;

		values.push(id);
		db.prepare(
			`UPDATE comments SET ${updates.join(', ')} WHERE id = ?`,
		).run(...values);

		return db
			.prepare('SELECT * FROM comments WHERE id = ?')
			.get(id) as Comment;
	},

	deleteComment: (id: string): boolean => {
		const db = getDatabase();
		const result = db.prepare('DELETE FROM comments WHERE id = ?').run(id);
		return result.changes > 0;
	},

	updateCommentsStatus: (ids: string[], status: CommentStatus): number => {
		const db = getDatabase();
		if (ids.length === 0) return 0;
		const placeholders = ids.map(() => '?').join(', ');
		const result = db
			.prepare(
				`UPDATE comments SET status = ? WHERE id IN (${placeholders})`,
			)
			.run(status, ...ids);
		return result.changes;
	},

	stageComments: (ids: string[]): number => {
		return commentService.updateCommentsStatus(ids, 'staged');
	},

	markAsSent: (ids: string[]): number => {
		const db = getDatabase();
		if (ids.length === 0) return 0;
		const placeholders = ids.map(() => '?').join(', ');
		const result = db
			.prepare(
				`UPDATE comments SET status = 'sent', sent_at = datetime('now') WHERE id IN (${placeholders})`,
			)
			.run(...ids);
		return result.changes;
	},

	cancelComments: (ids: string[]): number => {
		return commentService.updateCommentsStatus(ids, 'cancelled');
	},

	getCommentCounts: (sessionId: string): Record<CommentStatus, number> => {
		const db = getDatabase();
		const results = db
			.prepare(
				`SELECT status, COUNT(*) as count 
				 FROM comments 
				 WHERE session_id = ? 
				 GROUP BY status`,
			)
			.all(sessionId) as { status: CommentStatus; count: number }[];

		const counts: Record<CommentStatus, number> = {
			queued: 0,
			staged: 0,
			sent: 0,
			cancelled: 0,
		};

		for (const row of results) {
			counts[row.status] = row.count;
		}

		return counts;
	},
};
