// Database service for MCP server using Effect and sql.js
import { FileSystem, Path } from '@effect/platform';
import { Context, Data, Effect, Layer } from 'effect';
import { accessSync, writeFileSync } from 'node:fs';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { McpConfig } from './config.js';

// RunResult type for compatibility
export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

// Errors
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
	message: string;
	cause?: unknown;
}> {}

export class RepoNotFoundError extends Data.TaggedError('RepoNotFoundError')<{
	path: string;
}> {}

export class SessionNotFoundError extends Data.TaggedError(
	'SessionNotFoundError',
)<{
	repoName: string;
}> {}

export class CommentNotFoundError extends Data.TaggedError(
	'CommentNotFoundError',
)<{
	id: string;
}> {}

// Service interface
export interface DbService {
	readonly query: <T>(
		sql: string,
		params?: unknown[],
	) => Effect.Effect<T[], DatabaseError>;
	readonly queryOne: <T>(
		sql: string,
		params?: unknown[],
	) => Effect.Effect<T | undefined, DatabaseError>;
	readonly execute: (
		sql: string,
		params?: unknown[],
	) => Effect.Effect<RunResult, DatabaseError>;
}

export const DbService = Context.GenericTag<DbService>('McpDbService');

// Database instance and path for saving
let dbFilePath: string | null = null;

// Helper to save database
const saveDb = (db: SqlJsDatabase, path: string): void => {
	const data = db.export();
	writeFileSync(path, Buffer.from(data));
};

// Create DbService implementation with a database instance
const makeDbService = (db: SqlJsDatabase, dbPath: string): DbService => ({
	query: <T>(sql: string, params: unknown[] = []) =>
		Effect.try({
			try: () => {
				const stmt = db.prepare(sql);
				stmt.bind(params as initSqlJs.BindParams);
				const results: T[] = [];
				while (stmt.step()) {
					const row = stmt.getAsObject() as T;
					results.push(row);
				}
				stmt.free();
				return results;
			},
			catch: (error) =>
				new DatabaseError({
					message:
						error instanceof Error ? error.message : 'Query failed',
					cause: error,
				}),
		}).pipe(Effect.withSpan('db.query', { attributes: { sql } })),

	queryOne: <T>(sql: string, params: unknown[] = []) =>
		Effect.try({
			try: () => {
				const stmt = db.prepare(sql);
				stmt.bind(params as initSqlJs.BindParams);
				let result: T | undefined;
				if (stmt.step()) {
					result = stmt.getAsObject() as T;
				}
				stmt.free();
				return result;
			},
			catch: (error) =>
				new DatabaseError({
					message:
						error instanceof Error ? error.message : 'Query failed',
					cause: error,
				}),
		}).pipe(Effect.withSpan('db.queryOne', { attributes: { sql } })),

	execute: (sql: string, params: unknown[] = []) =>
		Effect.try({
			try: () => {
				db.run(sql, params as initSqlJs.BindParams);
				// Get changes and last insert rowid
				const changesResult = db.exec('SELECT changes() as changes');
				const lastIdResult = db.exec(
					'SELECT last_insert_rowid() as lastId',
				);
				const changes =
					changesResult.length > 0
						? (changesResult[0].values[0][0] as number)
						: 0;
				const lastInsertRowid =
					lastIdResult.length > 0
						? (lastIdResult[0].values[0][0] as number)
						: 0;
				// Save after write
				saveDb(db, dbPath);
				return { changes, lastInsertRowid };
			},
			catch: (error) =>
				new DatabaseError({
					message:
						error instanceof Error
							? error.message
							: 'Execute failed',
					cause: error,
				}),
		}).pipe(Effect.withSpan('db.execute', { attributes: { sql } })),
});

// Live layer - depends on McpConfig, FileSystem, and Path
export const DbServiceLive = Layer.effect(
	DbService,
	Effect.gen(function* () {
		const config = yield* McpConfig;
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		// Find first existing DB path or use first as default
		let dbPath = config.dbPaths[0];
		for (const candidatePath of config.dbPaths) {
			const exists = yield* fs.exists(candidatePath);
			if (exists) {
				dbPath = candidatePath;
				break;
			}
		}
		dbFilePath = dbPath;

		const dbDir = path.dirname(dbPath);

		// Initialize sql.js
		const SQL = yield* Effect.tryPromise({
			try: () =>
				initSqlJs({
					locateFile: (file: string) => {
						// Try db directory first (for deployed version)
						const configWasmPath = path.join(dbDir, file);
						// Fall back to node_modules (for development)
						const nodeModulesPath = path.join(
							path.dirname(dbDir),
							'node_modules',
							'sql.js',
							'dist',
							file,
						);
						// Check which exists - prefer config dir
						try {
							accessSync(configWasmPath);
							return configWasmPath;
						} catch {
							return nodeModulesPath;
						}
					},
				}),
			catch: (error) =>
				new DatabaseError({
					message: `Failed to initialize sql.js: ${error instanceof Error ? error.message : String(error)}`,
					cause: error,
				}),
		});

		// Load existing database or create new
		let db: SqlJsDatabase;
		const dbExists = yield* fs.exists(dbPath);
		if (dbExists) {
			const buffer = yield* fs.readFile(dbPath);
			db = new SQL.Database(new Uint8Array(buffer));
		} else {
			db = new SQL.Database();
		}

		// Enable foreign keys
		db.run('PRAGMA foreign_keys = ON');

		// Run base schema
		const schemaPath = path.join(dbDir, 'schema.sql');
		const schemaExists = yield* fs.exists(schemaPath);
		if (schemaExists) {
			const schema = yield* fs.readFileString(schemaPath);
			db.run(schema);
		}

		// Run migrations
		const migrationsDir = path.join(dbDir, 'migrations');
		const migrationsDirExists = yield* fs.exists(migrationsDir);
		if (migrationsDirExists) {
			const entries = yield* fs.readDirectory(migrationsDir);
			const migrations = entries.filter((f) => f.endsWith('.sql')).sort();

			for (const migration of migrations) {
				const migrationPath = path.join(migrationsDir, migration);
				const sql = yield* fs.readFileString(migrationPath);
				try {
					db.run(sql);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (
						!message.includes('duplicate column') &&
						!message.includes('already exists')
					) {
						yield* Effect.logWarning(
							`Migration ${migration} failed: ${message}`,
						);
					}
				}
			}
		}

		// Save initial state
		saveDb(db, dbPath);

		yield* Effect.logInfo('Database initialized', { path: dbPath });

		return makeDbService(db, dbPath);
	}),
);

// Generate unique ID
export const generateId = (): string => crypto.randomUUID();
