import { Effect } from 'effect';
import { DatabaseError, DbService } from '../shared/db.js';
export declare const listPending: () => Effect.Effect<string, DatabaseError, DbService>;
