import { Effect, Stream } from 'effect';
import { ConfigService } from '../lib/config';
import { runtime } from '../lib/effect-runtime';
import { GitService, type ScannedRepo } from '../services/git.service';

export { type ScannedRepo as GitRepo };

export async function loader() {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			try {
				await runtime.runPromise(
					Effect.gen(function* () {
						const { config } = yield* ConfigService;
						const git = yield* GitService;

						const repoStream = git.scanForRepos(
							config.repoScanRoots,
							config.repoScanMaxDepth,
						);

						// Track seen paths to deduplicate repos
						const seenPaths = new Set<string>();
						const repos: ScannedRepo[] = [];

						yield* repoStream.pipe(
							Stream.runForEach((repo) =>
								Effect.sync(() => {
									// Deduplicate by path
									if (seenPaths.has(repo.path)) return;
									seenPaths.add(repo.path);

									repos.push(repo);
									// Sort incrementally
									repos.sort((a, b) =>
										a.name.localeCompare(b.name),
									);
									// Stream as NDJSON
									controller.enqueue(
										encoder.encode(
											JSON.stringify({
												type: 'repo',
												data: repo,
											}) + '\n',
										),
									);
								}),
							),
						);

						// Signal completion
						controller.enqueue(
							encoder.encode(
								JSON.stringify({
									type: 'done',
									total: repos.length,
								}) + '\n',
							),
						);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.sync(() => {
								controller.enqueue(
									encoder.encode(
										JSON.stringify({
											type: 'error',
											message:
												String(error) ||
												'Failed to scan repositories',
										}) + '\n',
									),
								);
							}),
						),
					),
				);
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Transfer-Encoding': 'chunked',
			'Cache-Control': 'no-cache',
		},
	});
}
