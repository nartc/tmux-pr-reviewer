import { Effect } from 'effect';
import { runtime } from '../lib/effect-runtime';
import { AIService, type AIProvider } from '../services/ai.service';
import { CommentService, type Comment } from '../services/comment.service';
import type { Route } from './+types/api.process';

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const intent = formData.get('intent') as string;

	return runtime.runPromise(
		Effect.gen(function* () {
			const ai = yield* AIService;
			const comments = yield* CommentService;

			switch (intent) {
				case 'process': {
					const commentIds = formData.getAll(
						'commentIds',
					) as string[];

					if (commentIds.length === 0) {
						return Response.json(
							{ error: 'No comments provided' },
							{ status: 400 },
						);
					}

					// Get comments
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

					// Process with AI
					const processedText =
						yield* ai.processComments(validComments);

					return Response.json({
						success: true,
						processedText,
						originalComments: validComments,
					});
				}

				case 'saveSettings': {
					const provider = formData.get('provider') as AIProvider;
					const model = formData.get('model') as string;

					if (!provider || !model) {
						return Response.json(
							{ error: 'Provider and model required' },
							{ status: 400 },
						);
					}

					yield* ai.saveSettings(provider, model);
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
									: 'AI processing failed',
						},
						{ status: 500 },
					),
				),
			),
		),
	);
}

export async function loader() {
	return runtime.runPromise(
		Effect.gen(function* () {
			const ai = yield* AIService;

			const availableProviders = yield* ai.getAvailableProviders;
			const settings = yield* ai.getSettings;

			const providerModels: Record<string, string[]> = {};
			for (const provider of availableProviders) {
				providerModels[provider] = ai.getModelsForProvider(provider);
			}

			return Response.json({
				availableProviders,
				providerModels,
				currentSettings: settings,
			});
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(
					Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Failed to load AI settings',
						},
						{ status: 500 },
					),
				),
			),
		),
	);
}
