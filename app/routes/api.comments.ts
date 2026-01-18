import { Effect } from 'effect';
import { runtime } from '../lib/effect-runtime';
import {
	CommentService,
	type CommentStatus,
} from '../services/comment.service';
import type { Route } from './+types/api.comments';

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const intent = formData.get('intent') as string;

	return runtime.runPromise(
		Effect.gen(function* () {
			const comments = yield* CommentService;

			switch (intent) {
				case 'create': {
					const sessionId = formData.get('sessionId') as string;
					const filePath = formData.get('filePath') as string;
					const content = formData.get('content') as string;
					const lineStart = formData.get('lineStart');
					const lineEnd = formData.get('lineEnd');
					const side = formData.get('side') as
						| 'old'
						| 'new'
						| 'both'
						| null;

					if (!sessionId || !filePath || !content) {
						return Response.json(
							{ error: 'Missing required fields' },
							{ status: 400 },
						);
					}

					const comment = yield* comments.createComment({
						sessionId,
						filePath,
						content,
						lineStart: lineStart
							? parseInt(lineStart as string, 10)
							: undefined,
						lineEnd: lineEnd
							? parseInt(lineEnd as string, 10)
							: undefined,
						side: side || undefined,
					});

					return Response.json({ comment });
				}

				case 'update': {
					const id = formData.get('id') as string;
					const content = formData.get('content') as string | null;
					const status = formData.get(
						'status',
					) as CommentStatus | null;

					if (!id) {
						return Response.json(
							{ error: 'Comment ID required' },
							{ status: 400 },
						);
					}

					const comment = yield* comments.updateComment(id, {
						content: content || undefined,
						status: status || undefined,
					});

					return Response.json({ comment });
				}

				case 'delete': {
					const id = formData.get('id') as string;

					if (!id) {
						return Response.json(
							{ error: 'Comment ID required' },
							{ status: 400 },
						);
					}

					const deleted = yield* comments.deleteComment(id);
					if (!deleted) {
						return Response.json(
							{ error: 'Comment not found' },
							{ status: 404 },
						);
					}

					return Response.json({ success: true });
				}

				case 'stage': {
					const ids = formData.getAll('ids') as string[];

					if (ids.length === 0) {
						return Response.json(
							{ error: 'No comment IDs provided' },
							{ status: 400 },
						);
					}

					const count = yield* comments.stageComments(ids);
					return Response.json({ success: true, count });
				}

				case 'markSent': {
					const ids = formData.getAll('ids') as string[];

					if (ids.length === 0) {
						return Response.json(
							{ error: 'No comment IDs provided' },
							{ status: 400 },
						);
					}

					const count = yield* comments.markAsSent(ids);
					return Response.json({ success: true, count });
				}

				default:
					return Response.json(
						{ error: 'Unknown action' },
						{ status: 400 },
					);
			}
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(
					Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Unknown error',
						},
						{ status: 500 },
					),
				),
			),
		),
	);
}

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const sessionId = url.searchParams.get('sessionId');
	const status = url.searchParams.get('status') as CommentStatus | null;

	if (!sessionId) {
		return Response.json({ error: 'Session ID required' }, { status: 400 });
	}

	return runtime.runPromise(
		Effect.gen(function* () {
			const comments = yield* CommentService;

			const commentList = status
				? yield* comments.getCommentsByStatus(sessionId, status)
				: yield* comments.getSessionComments(sessionId);

			const counts = yield* comments.getCommentCounts(sessionId);

			return Response.json({ comments: commentList, counts });
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(
					Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Unknown error',
						},
						{ status: 500 },
					),
				),
			),
		),
	);
}
