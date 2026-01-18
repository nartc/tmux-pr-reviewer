import { Effect } from 'effect';
import { McpConfig } from '../shared/config.js';
import { DatabaseError, DbService, RepoNotFoundError, SessionNotFoundError } from '../shared/db.js';
interface CheckCommentsArgs {
    repo_path?: string;
}
export declare const checkComments: (args: CheckCommentsArgs, clientId: string) => Effect.Effect<string, RepoNotFoundError | SessionNotFoundError | DatabaseError, DbService | McpConfig>;
export {};
