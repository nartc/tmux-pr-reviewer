#!/usr/bin/env node
// PR Reviewer MCP Server
// Provides tools for coding agents to receive and manage PR review comments

import { FileSystem, Path } from '@effect/platform';
import { NodeContext } from '@effect/platform-node';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	Effect,
	Layer,
	Logger,
	LogLevel,
	ManagedRuntime,
	Stream,
} from 'effect';
import { watch } from 'node:fs';
import { z } from 'zod';

import { McpConfig, McpConfigLive } from './shared/config.js';
import { DbService, DbServiceLive, generateId } from './shared/db.js';
import { checkComments } from './tools/check-comments.js';
import { getDetails } from './tools/get-details.js';
import { listPending } from './tools/list-pending.js';
import { listRepoPending } from './tools/list-repo-pending.js';
import { markResolved } from './tools/mark-resolved.js';
import { getServerStatus } from './tools/server-status.js';
import { startServer } from './tools/start-server.js';

// Logging layer - stderr for MCP (stdout is reserved for protocol)
const LoggingLive = Layer.mergeAll(
	Logger.replace(
		Logger.defaultLogger,
		Logger.make(({ logLevel, message, annotations, date }) => {
			if (logLevel._tag === 'Debug' || logLevel._tag === 'Trace') return;
			const level = logLevel._tag.toUpperCase();
			const annotationStr = Object.keys(annotations).length
				? ` ${JSON.stringify(annotations)}`
				: '';
			console.error(
				`[${date.toISOString()}] ${level}: ${message}${annotationStr}`,
			);
		}),
	),
	Logger.minimumLogLevel(LogLevel.Info),
);

// App layer with all services - proper dependency chain
const AppLayer = DbServiceLive.pipe(
	Layer.provideMerge(McpConfigLive),
	Layer.provide(LoggingLive),
	Layer.provide(NodeContext.layer),
);

// Runtime instance
const runtime = ManagedRuntime.make(AppLayer);

// Track client for this session
let currentClientId: string | null = null;

const getOrCreateClient = Effect.gen(function* () {
	const db = yield* DbService;
	const config = yield* McpConfig;

	if (currentClientId) {
		// Update last seen
		yield* db
			.execute(
				`UPDATE mcp_clients SET last_seen_at = datetime('now') WHERE id = ?`,
				[currentClientId],
			)
			.pipe(Effect.catchAll(() => Effect.succeed({ changes: 0 })));
		return currentClientId;
	}

	// Create new client record
	currentClientId = generateId();

	yield* db
		.execute(
			`INSERT INTO mcp_clients (id, client_name, working_dir, connected_at, last_seen_at)
			 VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
			[currentClientId, config.clientName, config.workingDir],
		)
		.pipe(Effect.catchAll(() => Effect.succeed({ changes: 0 })));

	yield* Effect.logInfo('MCP client connected').pipe(
		Effect.annotateLogs({
			clientId: currentClientId,
			clientName: config.clientName,
			workingDir: config.workingDir,
		}),
	);

	return currentClientId;
});

// Create MCP server with new API
const server = new McpServer({
	name: 'pr-reviewer',
	version: '2.0.0',
});

// Register tools with Zod schemas
server.tool(
	'check_pr_comments',
	'Check for pending PR review comments in the current repository. Returns comments that have been sent from the PR Reviewer UI and marks them as delivered.',
	{
		repo_path: z
			.string()
			.optional()
			.describe(
				'Optional: Repository path (auto-detected from cwd if not provided)',
			),
	},
	async ({ repo_path }) => {
		const program = Effect.gen(function* () {
			const clientId = yield* getOrCreateClient;
			return yield* checkComments({ repo_path }, clientId);
		}).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const message =
						'message' in error
							? (error.message as string)
							: String(error);
					yield* Effect.logError('Tool error').pipe(
						Effect.annotateLogs({
							tool: 'check_pr_comments',
							error: message,
						}),
					);

					if (error._tag === 'RepoNotFoundError') {
						return `No repository registered at path: ${(error as { path: string }).path}\n\nTo use this tool, first open the PR Reviewer UI and select this repository.`;
					}
					if (error._tag === 'SessionNotFoundError') {
						return `No active review session found for ${(error as { repoName: string }).repoName}.\n\nOpen the PR Reviewer UI to start a review session.`;
					}

					return `Error: ${message}`;
				}),
			),
			Effect.withSpan('mcp.tool.check_pr_comments'),
		);

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

server.tool(
	'mark_comment_resolved',
	'Mark a PR review comment as resolved after addressing it. Use the comment ID from check_pr_comments.',
	{
		comment_id: z.string().describe('The comment ID to mark as resolved'),
	},
	async ({ comment_id }) => {
		const program = Effect.gen(function* () {
			yield* getOrCreateClient;
			return yield* markResolved({ comment_id });
		}).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const message =
						'message' in error
							? (error.message as string)
							: String(error);
					yield* Effect.logError('Tool error').pipe(
						Effect.annotateLogs({
							tool: 'mark_comment_resolved',
							error: message,
						}),
					);

					if (error._tag === 'CommentNotFoundError') {
						return `Comment not found: ${(error as { id: string }).id}`;
					}

					return `Error: ${message}`;
				}),
			),
			Effect.withSpan('mcp.tool.mark_comment_resolved'),
		);

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

server.tool(
	'list_pending_comments',
	'List pending PR review comments across all registered repositories. Shows a summary of undelivered comments per repository.',
	{},
	async () => {
		const program = Effect.gen(function* () {
			yield* getOrCreateClient;
			return yield* listPending();
		}).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const message =
						'message' in error
							? (error.message as string)
							: String(error);
					yield* Effect.logError('Tool error').pipe(
						Effect.annotateLogs({
							tool: 'list_pending_comments',
							error: message,
						}),
					);
					return `Error: ${message}`;
				}),
			),
			Effect.withSpan('mcp.tool.list_pending_comments'),
		);

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

server.tool(
	'list_repo_pending_comments',
	'List pending PR review comments for the current repository only. Shows a summary grouped by file.',
	{
		repo_path: z
			.string()
			.optional()
			.describe(
				'Optional: Repository path (auto-detected from cwd if not provided)',
			),
	},
	async ({ repo_path }) => {
		const program = Effect.gen(function* () {
			yield* getOrCreateClient;
			return yield* listRepoPending({ repo_path });
		}).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const message =
						'message' in error
							? (error.message as string)
							: String(error);
					yield* Effect.logError('Tool error').pipe(
						Effect.annotateLogs({
							tool: 'list_repo_pending_comments',
							error: message,
						}),
					);

					if (error._tag === 'RepoNotFoundError') {
						return `No repository registered at path: ${(error as { path: string }).path}\n\nTo use this tool, first open the PR Reviewer UI and select this repository.`;
					}
					if (error._tag === 'SessionNotFoundError') {
						return `No active review session found for ${(error as { repoName: string }).repoName}.\n\nOpen the PR Reviewer UI to start a review session.`;
					}

					return `Error: ${message}`;
				}),
			),
			Effect.withSpan('mcp.tool.list_repo_pending_comments'),
		);

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

server.tool(
	'get_comment_details',
	'Get detailed information about a specific PR review comment, including file path, line numbers, content, and status.',
	{
		comment_id: z.string().describe('The comment ID to get details for'),
	},
	async ({ comment_id }) => {
		const program = Effect.gen(function* () {
			yield* getOrCreateClient;
			return yield* getDetails({ comment_id });
		}).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const message =
						'message' in error
							? (error.message as string)
							: String(error);
					yield* Effect.logError('Tool error').pipe(
						Effect.annotateLogs({
							tool: 'get_comment_details',
							error: message,
						}),
					);

					if (error._tag === 'CommentNotFoundError') {
						return `Comment not found: ${(error as { id: string }).id}`;
					}

					return `Error: ${message}`;
				}),
			),
			Effect.withSpan('mcp.tool.get_comment_details'),
		);

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

server.tool(
	'start_review_server',
	'Start the review web server and get the URL for the current repository. Use this when you want to review code changes.',
	{
		repo_path: z
			.string()
			.optional()
			.describe(
				'Optional: Repository path (auto-detected from cwd if not provided)',
			),
	},
	async ({ repo_path }) => {
		const program = Effect.gen(function* () {
			yield* getOrCreateClient;
			return yield* startServer({ repo_path });
		}).pipe(
			Effect.catchAll((error: Error) =>
				Effect.gen(function* () {
					const message = error.message || String(error);
					yield* Effect.logError('Tool error').pipe(
						Effect.annotateLogs({
							tool: 'start_review_server',
							error: message,
						}),
					);
					return `Error: ${message}`;
				}),
			),
			Effect.withSpan('mcp.tool.start_review_server'),
		);

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

server.tool(
	'get_server_status',
	'Check if the review server is running and get its URL and status.',
	{},
	async () => {
		const program = Effect.gen(function* () {
			yield* getOrCreateClient;
			return yield* getServerStatus();
		}).pipe(Effect.withSpan('mcp.tool.get_server_status'));

		const result = await runtime.runPromise(program);
		return { content: [{ type: 'text' as const, text: result }] };
	},
);

// Signal file watching for push notifications
const SIGNAL_FILE_NAME = '.local-pr-reviewer-pending';

interface SignalFileData {
	sessionId: string;
	repoPath: string;
	pendingCount: number;
	updatedAt: string;
}

/**
 * Create a stream that watches a file for changes and emits the content
 */
const watchSignalFile = (signalPath: string) =>
	Stream.async<SignalFileData>((emit) => {
		let lastContent = '';

		const checkAndEmit = () => {
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const exists = yield* fs.exists(signalPath);

				if (!exists) return;

				const content = yield* fs.readFileString(signalPath).pipe(
					Effect.map((c) => c.trim()),
					Effect.catchAll(() => Effect.succeed('')),
				);

				if (!content || content === lastContent) return;

				lastContent = content;

				try {
					const data = JSON.parse(content) as SignalFileData;
					if (data.pendingCount > 0) {
						emit.single(data);
					}
				} catch {
					// Ignore parse errors
				}
			}).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);
		};

		// Set up Node.js file watcher
		const watcher = watch(signalPath, (eventType) => {
			if (eventType === 'change') {
				checkAndEmit();
			}
		});

		// Initial check
		checkAndEmit();

		// Cleanup on stream end
		return Effect.sync(() => {
			watcher.close();
		});
	});

/**
 * Set up signal file watching and send notifications
 */
const setupSignalFileWatcher = (workingDir: string) =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const fs = yield* FileSystem.FileSystem;

		const signalPath = path.join(workingDir, SIGNAL_FILE_NAME);
		const exists = yield* fs.exists(signalPath);

		if (!exists) {
			yield* Effect.logInfo(
				'Signal file not found - notifications disabled',
			).pipe(Effect.annotateLogs({ signalPath }));
			return;
		}

		yield* Effect.logInfo('Watching signal file for changes').pipe(
			Effect.annotateLogs({ signalPath }),
		);

		// Process signal file changes
		yield* watchSignalFile(signalPath).pipe(
			Stream.tap((data) =>
				Effect.gen(function* () {
					const message = `🔔 New PR review comments available! ${data.pendingCount} comment(s) pending for review. Use check_pr_comments to see them.`;

					yield* Effect.tryPromise(() =>
						server.server.sendLoggingMessage({
							level: 'info',
							logger: 'pr-reviewer',
							data: message,
						}),
					).pipe(
						Effect.catchAll((err) =>
							Effect.logError('Failed to send notification').pipe(
								Effect.annotateLogs({ error: String(err) }),
							),
						),
					);

					yield* Effect.logInfo(
						'Notified client of pending comments',
					).pipe(
						Effect.annotateLogs({
							pendingCount: data.pendingCount,
						}),
					);
				}),
			),
			Stream.runDrain,
			Effect.fork, // Run in background
		);
	});

// Start the server
const main = Effect.gen(function* () {
	const transport = new StdioServerTransport();
	yield* Effect.tryPromise(() => server.connect(transport));

	yield* Effect.logInfo('PR Reviewer MCP server started');

	// Get working directory and set up watcher
	const workingDir = process.env.PWD || process.cwd();
	yield* setupSignalFileWatcher(workingDir);

	// Keep the process alive
	yield* Effect.never;
}).pipe(Effect.provide(NodeContext.layer));

Effect.runPromise(main).catch((error) => {
	console.error('Failed to start MCP server:', error);
	process.exit(1);
});
