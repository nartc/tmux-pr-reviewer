import { Effect } from 'effect';
import type { ActionFunctionArgs } from 'react-router';
import { runtime } from '../lib/effect-runtime';
import { GlobalConfigService } from '../lib/global-config';
import { RepoService } from '../services/repo.service';

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const intent = formData.get('intent') as string;

	return runtime.runPromise(
		Effect.gen(function* () {
			const repos = yield* RepoService;
			const globalConfig = yield* GlobalConfigService;

			switch (intent) {
				case 'endSession': {
					const sessionId = formData.get('sessionId') as string;

					if (!sessionId) {
						return Response.json(
							{ error: 'Session ID required' },
							{ status: 400 },
						);
					}

					// Get session and repo info
					const { session, repo } =
						yield* repos.getSessionWithRepo(sessionId);

					// Get repo path for signal deletion
					const repoPath = repo.paths[0]?.path;
					if (repoPath) {
						// Delete the signal file
						yield* globalConfig.deleteSignal(
							repoPath,
							repo.remote_url,
						);
					}

					yield* Effect.logInfo('Session ended', {
						sessionId,
						repoName: repo.name,
					});

					return Response.json({
						success: true,
						message: `Session ended for ${repo.name}`,
					});
				}

				case 'deleteRepoSignal': {
					const repoId = formData.get('repoId') as string;

					if (!repoId) {
						return Response.json(
							{ error: 'Repo ID required' },
							{ status: 400 },
						);
					}

					// Get repo info
					const repo = yield* repos.getRepoById(repoId);
					const paths = yield* repos.getRepoPaths(repoId);

					// Delete signal files for all paths
					for (const path of paths) {
						yield* globalConfig.deleteSignal(
							path.path,
							repo.remote_url,
						);
					}

					yield* Effect.logInfo('Repo signals deleted', {
						repoId,
						repoName: repo.name,
						pathCount: paths.length,
					});

					return Response.json({
						success: true,
						message: `Signals deleted for ${repo.name}`,
					});
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
