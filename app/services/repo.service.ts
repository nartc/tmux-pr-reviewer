import { Context, Effect, Layer } from 'effect';
import { generateId } from '../lib/effect-runtime';
import {
	DatabaseError,
	GitError,
	RepoNotFoundError,
	SessionNotFoundError,
} from '../lib/errors';
import { getDatabase } from './db.service';
import { GitService } from './git.service';

// Types
export interface Repo {
	id: string;
	remote_url: string | null;
	name: string;
	base_branch: string;
	created_at: string;
}

export interface RepoPath {
	id: string;
	repo_id: string;
	path: string;
	last_accessed_at: string | null;
	created_at: string;
}

export interface ReviewSession {
	id: string;
	repo_id: string;
	branch: string;
	base_branch: string | null;
	created_at: string;
}

export interface RepoWithPath extends Repo {
	paths: RepoPath[];
}

// RepoService interface
export interface RepoService {
	readonly getAllRepos: Effect.Effect<RepoWithPath[], DatabaseError>;
	readonly getRepoById: (
		id: string,
	) => Effect.Effect<Repo, RepoNotFoundError | DatabaseError>;
	readonly getRepoByRemoteUrl: (
		remoteUrl: string,
	) => Effect.Effect<Repo | undefined, DatabaseError>;
	readonly getRepoByPath: (
		path: string,
	) => Effect.Effect<Repo | undefined, DatabaseError>;
	readonly createOrGetRepoFromPath: (
		path: string,
	) => Effect.Effect<
		{ repo: Repo; repoPath: RepoPath; isNew: boolean },
		DatabaseError | GitError,
		GitService
	>;
	readonly deleteRepo: (id: string) => Effect.Effect<void, DatabaseError>;
	readonly deleteRepoPath: (
		pathId: string,
	) => Effect.Effect<void, DatabaseError>;
	readonly updateBaseBranch: (
		repoId: string,
		baseBranch: string,
	) => Effect.Effect<void, DatabaseError>;
	readonly getOrCreateSession: (
		repoId: string,
		path: string,
	) => Effect.Effect<ReviewSession, DatabaseError | GitError, GitService>;
	readonly getSessionById: (
		id: string,
	) => Effect.Effect<ReviewSession, SessionNotFoundError | DatabaseError>;
	readonly getSessionWithRepo: (
		sessionId: string,
	) => Effect.Effect<
		{ session: ReviewSession; repo: RepoWithPath },
		SessionNotFoundError | RepoNotFoundError | DatabaseError
	>;
	readonly getRepoPaths: (
		repoId: string,
	) => Effect.Effect<RepoPath[], DatabaseError>;
	readonly updateSessionBaseBranch: (
		sessionId: string,
		baseBranch: string | null,
	) => Effect.Effect<void, DatabaseError>;
}

export const RepoService = Context.GenericTag<RepoService>('RepoService');

// Implementation
const makeRepoService = (): RepoService => {
	const runDbOperation = <T>(
		operation: () => T,
		errorMessage: string,
	): Effect.Effect<T, DatabaseError> =>
		Effect.try({
			try: operation,
			catch: (error) =>
				new DatabaseError({
					message: errorMessage,
					cause: error,
				}),
		});

	return {
		getAllRepos: Effect.gen(function* () {
			const db = getDatabase();
			const repos = yield* runDbOperation(
				() =>
					db
						.prepare('SELECT * FROM repos ORDER BY name')
						.all() as Repo[],
				'Failed to get all repos',
			);

			return yield* Effect.all(
				repos.map((repo) =>
					runDbOperation(() => {
						const paths = db
							.prepare(
								'SELECT * FROM repo_paths WHERE repo_id = ? ORDER BY last_accessed_at DESC',
							)
							.all(repo.id) as RepoPath[];
						return { ...repo, paths };
					}, 'Failed to get repo paths'),
				),
			);
		}).pipe(Effect.withSpan('repo.getAllRepos')),

		getRepoById: (id: string) =>
			Effect.gen(function* () {
				const db = getDatabase();
				const repo = yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repos WHERE id = ?')
							.get(id) as Repo | undefined,
					'Failed to get repo by id',
				);

				if (!repo) {
					return yield* Effect.fail(new RepoNotFoundError({ id }));
				}

				return repo;
			}).pipe(Effect.withSpan('repo.getRepoById')),

		getRepoByRemoteUrl: (remoteUrl: string) =>
			runDbOperation(
				() =>
					getDatabase()
						.prepare('SELECT * FROM repos WHERE remote_url = ?')
						.get(remoteUrl) as Repo | undefined,
				'Failed to get repo by remote URL',
			).pipe(Effect.withSpan('repo.getRepoByRemoteUrl')),

		getRepoByPath: (path: string) =>
			Effect.gen(function* () {
				const db = getDatabase();
				const repoPath = yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repo_paths WHERE path = ?')
							.get(path) as RepoPath | undefined,
					'Failed to get repo path',
				);

				if (!repoPath) return undefined;

				return yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repos WHERE id = ?')
							.get(repoPath.repo_id) as Repo | undefined,
					'Failed to get repo',
				);
			}).pipe(Effect.withSpan('repo.getRepoByPath')),

		createOrGetRepoFromPath: (path: string) =>
			Effect.gen(function* () {
				const db = getDatabase();
				const git = yield* GitService;

				// Check if path already registered
				const existingPath = yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repo_paths WHERE path = ?')
							.get(path) as RepoPath | undefined,
					'Failed to check existing path',
				);

				if (existingPath) {
					const repo = yield* runDbOperation(
						() =>
							db
								.prepare('SELECT * FROM repos WHERE id = ?')
								.get(existingPath.repo_id) as Repo,
						'Failed to get existing repo',
					);

					yield* runDbOperation(
						() =>
							db
								.prepare(
									"UPDATE repo_paths SET last_accessed_at = datetime('now') WHERE id = ?",
								)
								.run(existingPath.id),
						'Failed to update last accessed',
					);

					return { repo, repoPath: existingPath, isNew: false };
				}

				// Get git info
				const remoteUrl = yield* git
					.getRemoteUrl(path)
					.pipe(Effect.catchAll(() => Effect.succeed(null)));

				const repoName = path.split('/').pop() || 'unknown';

				// Check if repo with same remote exists
				let repo: Repo | undefined;
				if (remoteUrl) {
					repo = yield* runDbOperation(
						() =>
							db
								.prepare(
									'SELECT * FROM repos WHERE remote_url = ?',
								)
								.get(remoteUrl) as Repo | undefined,
						'Failed to check existing repo by remote',
					);
				}

				// Create repo if not exists
				if (!repo) {
					const repoId = generateId();
					const baseBranch = yield* git
						.getDefaultBranch(path)
						.pipe(Effect.catchAll(() => Effect.succeed('main')));

					yield* runDbOperation(
						() =>
							db
								.prepare(
									'INSERT INTO repos (id, remote_url, name, base_branch) VALUES (?, ?, ?, ?)',
								)
								.run(repoId, remoteUrl, repoName, baseBranch),
						'Failed to create repo',
					);

					repo = yield* runDbOperation(
						() =>
							db
								.prepare('SELECT * FROM repos WHERE id = ?')
								.get(repoId) as Repo,
						'Failed to get created repo',
					);
				}

				// Create repo path
				const pathId = generateId();
				yield* runDbOperation(
					() =>
						db
							.prepare(
								"INSERT INTO repo_paths (id, repo_id, path, last_accessed_at) VALUES (?, ?, ?, datetime('now'))",
							)
							.run(pathId, repo!.id, path),
					'Failed to create repo path',
				);

				const repoPath = yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repo_paths WHERE id = ?')
							.get(pathId) as RepoPath,
					'Failed to get created repo path',
				);

				yield* Effect.logInfo(`Created repo: ${repo!.name} at ${path}`);

				return { repo: repo!, repoPath, isNew: true };
			}).pipe(Effect.withSpan('repo.createOrGetRepoFromPath')),

		deleteRepo: (id: string) =>
			runDbOperation(
				() =>
					getDatabase()
						.prepare('DELETE FROM repos WHERE id = ?')
						.run(id),
				'Failed to delete repo',
			).pipe(
				Effect.map(() => undefined),
				Effect.withSpan('repo.deleteRepo'),
			),

		deleteRepoPath: (pathId: string) =>
			Effect.gen(function* () {
				const db = getDatabase();
				const repoPath = yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repo_paths WHERE id = ?')
							.get(pathId) as RepoPath | undefined,
					'Failed to get repo path',
				);

				if (!repoPath) return;

				yield* runDbOperation(
					() =>
						db
							.prepare('DELETE FROM repo_paths WHERE id = ?')
							.run(pathId),
					'Failed to delete repo path',
				);

				// Check if repo has any other paths
				const otherPaths = yield* runDbOperation(
					() =>
						db
							.prepare(
								'SELECT COUNT(*) as count FROM repo_paths WHERE repo_id = ?',
							)
							.get(repoPath.repo_id) as { count: number },
					'Failed to check other paths',
				);

				if (otherPaths.count === 0) {
					yield* runDbOperation(
						() =>
							db
								.prepare('DELETE FROM repos WHERE id = ?')
								.run(repoPath.repo_id),
						'Failed to delete repo',
					);
				}
			}).pipe(Effect.withSpan('repo.deleteRepoPath')),

		updateBaseBranch: (repoId: string, baseBranch: string) =>
			runDbOperation(
				() =>
					getDatabase()
						.prepare(
							'UPDATE repos SET base_branch = ? WHERE id = ?',
						)
						.run(baseBranch, repoId),
				'Failed to update base branch',
			).pipe(
				Effect.map(() => undefined),
				Effect.withSpan('repo.updateBaseBranch'),
			),

		getOrCreateSession: (repoId: string, path: string) =>
			Effect.gen(function* () {
				const db = getDatabase();
				const git = yield* GitService;

				const currentBranch = yield* git.getCurrentBranch(path);

				const existing = yield* runDbOperation(
					() =>
						db
							.prepare(
								'SELECT * FROM review_sessions WHERE repo_id = ? AND branch = ?',
							)
							.get(repoId, currentBranch) as
							| ReviewSession
							| undefined,
					'Failed to check existing session',
				);

				if (existing) return existing;

				const sessionId = generateId();
				yield* runDbOperation(
					() =>
						db
							.prepare(
								'INSERT INTO review_sessions (id, repo_id, branch) VALUES (?, ?, ?)',
							)
							.run(sessionId, repoId, currentBranch),
					'Failed to create session',
				);

				return yield* runDbOperation(
					() =>
						db
							.prepare(
								'SELECT * FROM review_sessions WHERE id = ?',
							)
							.get(sessionId) as ReviewSession,
					'Failed to get created session',
				);
			}).pipe(Effect.withSpan('repo.getOrCreateSession')),

		getSessionById: (id: string) =>
			Effect.gen(function* () {
				const session = yield* runDbOperation(
					() =>
						getDatabase()
							.prepare(
								'SELECT * FROM review_sessions WHERE id = ?',
							)
							.get(id) as ReviewSession | undefined,
					'Failed to get session',
				);

				if (!session) {
					return yield* Effect.fail(new SessionNotFoundError({ id }));
				}

				return session;
			}).pipe(Effect.withSpan('repo.getSessionById')),

		getSessionWithRepo: (sessionId: string) =>
			Effect.gen(function* () {
				const db = getDatabase();

				const session = yield* runDbOperation(
					() =>
						db
							.prepare(
								'SELECT * FROM review_sessions WHERE id = ?',
							)
							.get(sessionId) as ReviewSession | undefined,
					'Failed to get session',
				);

				if (!session) {
					return yield* Effect.fail(
						new SessionNotFoundError({ id: sessionId }),
					);
				}

				const repo = yield* runDbOperation(
					() =>
						db
							.prepare('SELECT * FROM repos WHERE id = ?')
							.get(session.repo_id) as Repo | undefined,
					'Failed to get repo',
				);

				if (!repo) {
					return yield* Effect.fail(
						new RepoNotFoundError({ id: session.repo_id }),
					);
				}

				const paths = yield* runDbOperation(
					() =>
						db
							.prepare(
								'SELECT * FROM repo_paths WHERE repo_id = ? ORDER BY last_accessed_at DESC',
							)
							.all(repo.id) as RepoPath[],
					'Failed to get repo paths',
				);

				return { session, repo: { ...repo, paths } };
			}).pipe(Effect.withSpan('repo.getSessionWithRepo')),

		getRepoPaths: (repoId: string) =>
			runDbOperation(
				() =>
					getDatabase()
						.prepare(
							'SELECT * FROM repo_paths WHERE repo_id = ? ORDER BY last_accessed_at DESC',
						)
						.all(repoId) as RepoPath[],
				'Failed to get repo paths',
			).pipe(Effect.withSpan('repo.getRepoPaths')),

		updateSessionBaseBranch: (
			sessionId: string,
			baseBranch: string | null,
		) =>
			runDbOperation(
				() =>
					getDatabase()
						.prepare(
							'UPDATE review_sessions SET base_branch = ? WHERE id = ?',
						)
						.run(baseBranch, sessionId),
				'Failed to update session base branch',
			).pipe(
				Effect.map(() => undefined),
				Effect.withSpan('repo.updateSessionBaseBranch'),
			),
	};
};

// Live layer
export const RepoServiceLive = Layer.succeed(RepoService, makeRepoService());
