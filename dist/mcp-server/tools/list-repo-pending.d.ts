import { Effect } from 'effect';
import { McpConfig } from '../shared/config.js';
import { DatabaseError, DbService, RepoNotFoundError, SessionNotFoundError } from '../shared/db.js';
interface ListRepoPendingArgs {
    repo_path?: string;
}
export declare const listRepoPending: (args: ListRepoPendingArgs) => Effect.Effect<string, RepoNotFoundError | SessionNotFoundError | DatabaseError, DbService | McpConfig>;
export {};
