// Transport Service - Abstraction for comment delivery mechanisms
// Replaces TmuxService with a generic transport layer supporting MCP and clipboard

import { Context, Effect, Layer } from 'effect';
import { TransportError } from '../lib/errors';
import { DbService, query } from './db.service';

// Types (must be before usage)
export type TargetType = 'mcp_client' | 'clipboard';

export interface CommentTarget {
	id: string;
	type: TargetType;
	name: string;
	workingDir?: string;
	connected: boolean;
	lastSeen?: Date;
}

// Inline transport helpers to avoid circular import issues
const ClipboardTransport = {
	getTarget: (): CommentTarget => ({
		id: 'clipboard',
		type: 'clipboard' as const,
		name: 'Copy to Clipboard',
		connected: true,
	}),
};

export interface CommentPayload {
	id: string;
	file_path: string;
	line_start: number | null;
	line_end?: number | null;
	content: string;
}

// MCP Client from database
export interface McpClientRecord {
	id: string;
	client_name: string | null;
	client_version: string | null;
	connected_at: string;
	last_seen_at: string;
	working_dir: string | null;
}

// Service interface
export interface TransportService {
	readonly isAvailable: Effect.Effect<boolean, never>;

	readonly listTargets: Effect.Effect<
		CommentTarget[],
		TransportError,
		DbService
	>;

	readonly sendComments: (
		targetId: string,
		comments: CommentPayload[],
	) => Effect.Effect<{ formatted: string }, TransportError, DbService>;

	readonly formatComments: (comments: CommentPayload[]) => string;

	readonly getMcpClients: Effect.Effect<
		McpClientRecord[],
		TransportError,
		DbService
	>;

	readonly getMcpStatus: Effect.Effect<
		{
			clientCount: number;
			clients: Array<{ name: string; lastSeen: string }>;
		},
		TransportError,
		DbService
	>;
}

export const TransportService =
	Context.GenericTag<TransportService>('TransportService');

// Implementation
const makeTransportService = (): TransportService => {
	const clipboardTransport = ClipboardTransport;

	// Format a single comment
	const formatComment = (comment: CommentPayload): string => {
		const lineInfo = comment.line_start ? `:${comment.line_start}` : '';
		const lineEnd =
			comment.line_end && comment.line_end !== comment.line_start
				? `-${comment.line_end}`
				: '';
		return `[${comment.file_path}${lineInfo}${lineEnd}]\n${comment.content}`;
	};

	// Format multiple comments
	const formatComments = (comments: CommentPayload[]): string => {
		return comments.map(formatComment).join('\n\n---\n\n');
	};

	// Get MCP clients from database
	const getMcpClients: Effect.Effect<
		McpClientRecord[],
		TransportError,
		DbService
	> = Effect.gen(function* () {
		// Get clients seen in the last 5 minutes
		const clients = yield* query<McpClientRecord>(
			`SELECT * FROM mcp_clients 
			 WHERE datetime(last_seen_at) > datetime('now', '-5 minutes')
			 ORDER BY last_seen_at DESC`,
			[],
		).pipe(
			Effect.mapError(
				(e) =>
					new TransportError({
						message: 'Failed to query MCP clients',
						cause: e,
					}),
			),
		);
		return clients;
	}).pipe(Effect.withSpan('transport.getMcpClients'));

	// Get MCP status summary
	const getMcpStatus = Effect.gen(function* () {
		const clients = yield* getMcpClients;
		return {
			clientCount: clients.length,
			clients: clients.map((c) => ({
				name: c.client_name || 'Unknown Agent',
				lastSeen: c.last_seen_at,
			})),
		};
	}).pipe(Effect.withSpan('transport.getMcpStatus'));

	// List all available targets
	const listTargets: Effect.Effect<
		CommentTarget[],
		TransportError,
		DbService
	> = Effect.gen(function* () {
		const targets: CommentTarget[] = [];

		// Get MCP clients
		const mcpClients = yield* getMcpClients;
		for (const client of mcpClients) {
			const lastSeen = client.last_seen_at
				? new Date(client.last_seen_at + 'Z')
				: undefined;

			targets.push({
				id: client.id,
				type: 'mcp_client',
				name: client.client_name || 'Unknown Agent',
				workingDir: client.working_dir || undefined,
				connected: true,
				lastSeen,
			});
		}

		// Always add clipboard as fallback
		targets.push(clipboardTransport.getTarget());

		return targets;
	}).pipe(Effect.withSpan('transport.listTargets'));

	// Send comments to a target
	const sendComments = (
		targetId: string,
		comments: CommentPayload[],
	): Effect.Effect<{ formatted: string }, TransportError, DbService> =>
		Effect.gen(function* () {
			const formatted = formatComments(comments);

			if (targetId === 'clipboard') {
				// Clipboard just returns the formatted text for UI to copy
				return { formatted };
			}

			// For MCP clients, just mark comments as ready
			// The MCP server will pick them up when agent calls check_pr_comments
			// We don't need to do anything special here since comments
			// are already marked as 'sent' before this is called

			return { formatted };
		}).pipe(Effect.withSpan('transport.sendComments'));

	return {
		isAvailable: Effect.succeed(true),
		listTargets,
		sendComments,
		formatComments,
		getMcpClients,
		getMcpStatus,
	};
};

// Live layer
export const TransportServiceLive = Layer.succeed(
	TransportService,
	makeTransportService(),
);
