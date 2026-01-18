import { Effect } from 'effect';
import { CommentNotFoundError, DatabaseError, DbService } from '../shared/db.js';
interface GetDetailsArgs {
    comment_id: string;
}
export declare const getDetails: (args: GetDetailsArgs) => Effect.Effect<string, CommentNotFoundError | DatabaseError, DbService>;
export {};
