import { Effect } from 'effect';
import { CommentNotFoundError, DatabaseError, DbService } from '../shared/db.js';
interface MarkResolvedArgs {
    comment_id: string;
}
export declare const markResolved: (args: MarkResolvedArgs) => Effect.Effect<string, CommentNotFoundError | DatabaseError, DbService>;
export {};
