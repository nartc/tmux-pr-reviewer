import { Effect } from 'effect';
import { readdirSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '../lib/config';
import { runtime } from '../lib/effect-runtime';
import {
	type GitService as GitServiceType,
	GitService,
} from '../services/git.service';

const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'.next',
	'.cache',
	'coverage',
	'vendor',
	'__pycache__',
	'.venv',
	'venv',
]);

interface GitRepo {
	path: string;
	name: string;
}

const scanForRepos = (
	git: GitServiceType,
	dir: string,
	maxDepth: number,
	depth: number = 0,
): Effect.Effect<GitRepo[]> =>
	Effect.gen(function* () {
		if (depth > maxDepth) return [];

		const repos: GitRepo[] = [];

		try {
			const entries = readdirSync(dir, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (IGNORED_DIRS.has(entry.name)) continue;
				if (entry.name.startsWith('.') && entry.name !== '.git')
					continue;

				const fullPath = join(dir, entry.name);

				// Check if this is a git repo
				const isRepo = yield* git.isGitRepo(fullPath);
				if (isRepo) {
					repos.push({
						path: fullPath,
						name: entry.name,
					});
					// Don't recurse into git repos
					continue;
				}

				// Recurse into subdirectories
				const subRepos = yield* scanForRepos(
					git,
					fullPath,
					maxDepth,
					depth + 1,
				);
				repos.push(...subRepos);
			}
		} catch {
			// Ignore permission errors, etc.
		}

		return repos;
	});

export async function loader() {
	return runtime.runPromise(
		Effect.gen(function* () {
			const git = yield* GitService;
			const { config } = yield* ConfigService;
			const repos = yield* scanForRepos(
				git,
				config.repoScanRoot,
				config.repoScanMaxDepth,
			);
			// Sort by name
			repos.sort((a, b) => a.name.localeCompare(b.name));
			return Response.json({ repos });
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(
					Response.json(
						{
							error:
								String(error) || 'Failed to scan repositories',
						},
						{ status: 500 },
					),
				),
			),
		),
	);
}
