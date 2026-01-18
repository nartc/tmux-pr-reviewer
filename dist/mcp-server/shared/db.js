// Database service for MCP server using Effect
import Database from 'better-sqlite3';
import { Context, Data, Effect, Layer } from 'effect';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { McpConfig } from './config.js';
// Errors
export class DatabaseError extends Data.TaggedError('DatabaseError') {
}
export class RepoNotFoundError extends Data.TaggedError('RepoNotFoundError') {
}
export class SessionNotFoundError extends Data.TaggedError('SessionNotFoundError') {
}
export class CommentNotFoundError extends Data.TaggedError('CommentNotFoundError') {
}
// Find DB path from config paths
const findDbPath = (dbPaths) => {
    for (const path of dbPaths) {
        if (existsSync(path)) {
            return path;
        }
    }
    // Return first path as default (will be created if doesn't exist)
    return dbPaths[0];
};
// Run migrations
const runMigrations = (db, dbDir) => {
    const schemaPath = join(dbDir, 'schema.sql');
    if (existsSync(schemaPath)) {
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
    }
    const migrationsDir = join(dbDir, 'migrations');
    if (existsSync(migrationsDir)) {
        const migrations = readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        for (const migration of migrations) {
            const migrationPath = join(migrationsDir, migration);
            try {
                const sql = readFileSync(migrationPath, 'utf-8');
                db.exec(sql);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!message.includes('duplicate column') &&
                    !message.includes('already exists')) {
                    console.error(`Migration ${migration} failed:`, message);
                }
            }
        }
    }
};
export const DbService = Context.GenericTag('McpDbService');
// Initialize database with given paths
const initializeDb = (dbPaths) => {
    const dbPath = findDbPath(dbPaths);
    const dbDir = join(dbPath, '..');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db, dbDir);
    return db;
};
// Create DbService implementation with a database instance
const makeDbService = (db) => ({
    query: (sql, params = []) => Effect.try({
        try: () => db.prepare(sql).all(...params),
        catch: (error) => new DatabaseError({
            message: error instanceof Error ? error.message : 'Query failed',
            cause: error,
        }),
    }).pipe(Effect.withSpan('db.query', { attributes: { sql } })),
    queryOne: (sql, params = []) => Effect.try({
        try: () => db.prepare(sql).get(...params),
        catch: (error) => new DatabaseError({
            message: error instanceof Error ? error.message : 'Query failed',
            cause: error,
        }),
    }).pipe(Effect.withSpan('db.queryOne', { attributes: { sql } })),
    execute: (sql, params = []) => Effect.try({
        try: () => db.prepare(sql).run(...params),
        catch: (error) => new DatabaseError({
            message: error instanceof Error
                ? error.message
                : 'Execute failed',
            cause: error,
        }),
    }).pipe(Effect.withSpan('db.execute', { attributes: { sql } })),
});
// Live layer - depends on McpConfig
export const DbServiceLive = Layer.effect(DbService, Effect.gen(function* () {
    const config = yield* McpConfig;
    const db = initializeDb(config.dbPaths);
    yield* Effect.logInfo('Database initialized', {
        path: findDbPath(config.dbPaths),
    });
    return makeDbService(db);
}));
// Generate unique ID
export const generateId = () => crypto.randomUUID();
