import { FileSystem, Path } from '@effect/platform';
import { NodeContext } from '@effect/platform-node';
import { Context, Effect, Layer } from 'effect';
import { accessSync, writeFileSync } from 'node:fs';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { ConfigService, ConfigServiceLive } from '../lib/config';
import { DatabaseError } from '../lib/errors';

// RunResult type for compatibility with better-sqlite3 interface
export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

// Database service interface
export interface DbService {
	readonly db: SqlJsDatabase;
	readonly run: <T>(
		fn: (db: SqlJsDatabase) => T,
	) => Effect.Effect<T, DatabaseError>;
	readonly save: () => Effect.Effect<void, DatabaseError>;
}

export const DbService = Context.GenericTag<DbService>('DbService');

// Singleton database instance and path
let dbInstance: SqlJsDatabase | null = null;
let dbFilePath: string | null = null;
let fsInstance: FileSystem.FileSystem | null = null;

// Live implementation - effectful layer that runs migrations on init
export const DbServiceLive = Layer.effect(
	DbService,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const { config } = yield* ConfigService;

		fsInstance = fs;
		const dbDir = path.join(config.cwd, 'db');
		const dbPath = path.join(dbDir, 'pr-reviewer.db');
		dbFilePath = dbPath;

		if (!dbInstance) {
			// Initialize sql.js
			const SQL = yield* Effect.tryPromise({
				try: () =>
					initSqlJs({
						// Look for WASM file in db directory or node_modules
						locateFile: (file: string) => {
							// Try config db directory first (for deployed version)
							const configWasmPath = path.join(dbDir, file);
							// Fall back to node_modules (for development)
							const nodeModulesPath = path.join(
								config.cwd,
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
			const dbExists = yield* fs.exists(dbPath);
			if (dbExists) {
				const buffer = yield* fs.readFile(dbPath);
				dbInstance = new SQL.Database(new Uint8Array(buffer));
			} else {
				dbInstance = new SQL.Database();
			}

			// Enable foreign keys
			dbInstance.run('PRAGMA foreign_keys = ON');

			// Run base schema
			const schemaPath = path.join(dbDir, 'schema.sql');
			const schema = yield* fs.readFileString(schemaPath);
			dbInstance.run(schema);

			// Run migrations
			const migrationsDir = path.join(dbDir, 'migrations');
			const exists = yield* fs.exists(migrationsDir);

			if (exists) {
				const entries = yield* fs.readDirectory(migrationsDir);
				const migrations = entries
					.filter((f) => f.endsWith('.sql'))
					.sort();

				for (const migration of migrations) {
					const migrationPath = path.join(migrationsDir, migration);
					const sql = yield* fs.readFileString(migrationPath);
					try {
						dbInstance.run(sql);
					} catch (error) {
						// Ignore "duplicate column" or "already exists" errors
						const message =
							error instanceof Error
								? error.message
								: String(error);
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
			yield* saveDatabase(dbPath, dbInstance);

			yield* Effect.logDebug('Database initialized with migrations');
		}

		// Create save function
		const saveDb = (): Effect.Effect<void, DatabaseError> =>
			Effect.gen(function* () {
				if (dbInstance && dbFilePath) {
					yield* saveDatabase(dbFilePath, dbInstance);
				}
			});

		return DbService.of({
			db: dbInstance,
			run: <T>(fn: (db: SqlJsDatabase) => T) =>
				Effect.try({
					try: () => fn(dbInstance!),
					catch: (error) =>
						new DatabaseError({
							message:
								error instanceof Error
									? error.message
									: 'Database error',
							cause: error,
						}),
				}),
			save: () => saveDb(),
		});
	}),
).pipe(
	Layer.provideMerge(NodeContext.layer),
	Layer.provideMerge(ConfigServiceLive),
);

// Helper to save database to file
const saveDatabase = (
	dbPath: string,
	db: SqlJsDatabase,
): Effect.Effect<void, DatabaseError> =>
	Effect.try({
		try: () => {
			const data = db.export();
			writeFileSync(dbPath, Buffer.from(data));
		},
		catch: (error) =>
			new DatabaseError({
				message: `Failed to save database: ${error instanceof Error ? error.message : String(error)}`,
				cause: error,
			}),
	});

// Helper functions for common operations
export const query = <T>(
	sql: string,
	params: unknown[] = [],
): Effect.Effect<T[], DatabaseError, DbService> =>
	Effect.gen(function* () {
		const { run } = yield* DbService;
		return yield* run((db) => {
			const stmt = db.prepare(sql);
			stmt.bind(params as initSqlJs.BindParams);
			const results: T[] = [];
			while (stmt.step()) {
				const row = stmt.getAsObject() as T;
				results.push(row);
			}
			stmt.free();
			return results;
		});
	});

export const queryOne = <T>(
	sql: string,
	params: unknown[] = [],
): Effect.Effect<T | undefined, DatabaseError, DbService> =>
	Effect.gen(function* () {
		const { run } = yield* DbService;
		return yield* run((db) => {
			const stmt = db.prepare(sql);
			stmt.bind(params as initSqlJs.BindParams);
			let result: T | undefined;
			if (stmt.step()) {
				result = stmt.getAsObject() as T;
			}
			stmt.free();
			return result;
		});
	});

export const execute = (
	sql: string,
	params: unknown[] = [],
): Effect.Effect<RunResult, DatabaseError, DbService> =>
	Effect.gen(function* () {
		const { run, save } = yield* DbService;
		const result = yield* run((db) => {
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
			return { changes, lastInsertRowid };
		});
		// Save after write operation
		yield* save();
		return result;
	});

// Direct access for use outside Effect context
export const getDatabase = (): SqlJsDatabase => {
	if (!dbInstance) {
		throw new Error(
			'Database not initialized. Ensure DbServiceLive layer is provided.',
		);
	}
	return dbInstance;
};

// Save database synchronously (for use outside Effect context)
export const saveDatabaseSync = (): void => {
	if (dbInstance && dbFilePath) {
		const data = dbInstance.export();
		writeFileSync(dbFilePath, Buffer.from(data));
	}
};
