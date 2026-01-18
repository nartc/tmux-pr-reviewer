import Database from 'better-sqlite3';
import { Context, Effect, Layer } from 'effect';
import { McpConfig } from './config.js';
declare const DatabaseError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "DatabaseError";
} & Readonly<A>;
export declare class DatabaseError extends DatabaseError_base<{
    message: string;
    cause?: unknown;
}> {
}
declare const RepoNotFoundError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "RepoNotFoundError";
} & Readonly<A>;
export declare class RepoNotFoundError extends RepoNotFoundError_base<{
    path: string;
}> {
}
declare const SessionNotFoundError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "SessionNotFoundError";
} & Readonly<A>;
export declare class SessionNotFoundError extends SessionNotFoundError_base<{
    repoName: string;
}> {
}
declare const CommentNotFoundError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "CommentNotFoundError";
} & Readonly<A>;
export declare class CommentNotFoundError extends CommentNotFoundError_base<{
    id: string;
}> {
}
export interface DbService {
    readonly query: <T>(sql: string, params?: unknown[]) => Effect.Effect<T[], DatabaseError>;
    readonly queryOne: <T>(sql: string, params?: unknown[]) => Effect.Effect<T | undefined, DatabaseError>;
    readonly execute: (sql: string, params?: unknown[]) => Effect.Effect<Database.RunResult, DatabaseError>;
}
export declare const DbService: Context.Tag<DbService, DbService>;
export declare const DbServiceLive: Layer.Layer<DbService, never, McpConfig>;
export declare const generateId: () => string;
export {};
