import { Effect } from 'effect';
import { runtime } from '../lib/effect-runtime';
import { CommentService, type Comment } from '../services/comment.service';
import { TmuxService } from '../services/tmux.service';
import type { Route } from './+types/api.send';

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const intent = formData.get('intent') as string;

	return runtime.runPromise(
		Effect.gen(function* () {
			const comments = yield* CommentService;
			const tmux = yield* TmuxService;

			switch (intent) {
				case 'sendOne': {
					const sessionName = formData.get('sessionName') as string;
					const commentId = formData.get('commentId') as string;

					if (!sessionName || !commentId) {
						return Response.json(
							{ error: 'Missing required fields' },
							{ status: 400 },
						);
					}

					const comment = yield* comments.getComment(commentId);
					if (!comment) {
						return Response.json(
							{ error: 'Comment not found' },
							{ status: 404 },
						);
					}

					yield* tmux.sendComment(
						sessionName,
						comment.file_path,
						comment.line_start,
						comment.content,
					);

					// Mark as sent (use markAsSent to set sent_at timestamp)
					yield* comments.markAsSent([commentId]);

					return Response.json({ success: true });
				}

				case 'sendMany': {
					const sessionName = formData.get('sessionName') as string;
					const commentIds = formData.getAll(
						'commentIds',
					) as string[];

					if (!sessionName || commentIds.length === 0) {
						return Response.json(
							{ error: 'Missing required fields' },
							{ status: 400 },
						);
					}

					const commentResults = yield* Effect.all(
						commentIds.map((id) => comments.getComment(id)),
					);
					const validComments = commentResults.filter(
						(c): c is Comment => c !== undefined,
					);

					if (validComments.length === 0) {
						return Response.json(
							{ error: 'No valid comments found' },
							{ status: 404 },
						);
					}

					yield* tmux.sendComments(
						sessionName,
						validComments.map((c) => ({
							file_path: c.file_path,
							line_start: c.line_start,
							content: c.content,
						})),
					);

					// Mark all as sent
					yield* comments.markAsSent(commentIds);

					return Response.json({
						success: true,
						count: validComments.length,
					});
				}

				case 'sendRaw': {
					const sessionName = formData.get('sessionName') as string;
					const content = formData.get('content') as string;
					const reviewSessionId = formData.get('sessionId') as string;
					const filePath = formData.get('filePath') as string;
					const lineStart = formData.get('lineStart') as string;
					const lineEnd = formData.get('lineEnd') as string;

					if (!sessionName || !content) {
						return Response.json(
							{ error: 'Missing required fields' },
							{ status: 400 },
						);
					}

					yield* tmux.sendToSession(sessionName, content);

					// If session info provided, create a comment record marked as sent
					if (reviewSessionId && filePath) {
						const comment = yield* comments.createComment({
							sessionId: reviewSessionId,
							filePath,
							lineStart: lineStart
								? parseInt(lineStart, 10)
								: undefined,
							lineEnd: lineEnd
								? parseInt(lineEnd, 10)
								: undefined,
							content,
						});
						yield* comments.markAsSent([comment.id]);
					}

					return Response.json({ success: true });
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
									: 'Failed to send',
						},
						{ status: 500 },
					),
				),
			),
		),
	);
}
