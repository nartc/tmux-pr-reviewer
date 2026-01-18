// Effect-based configuration for MCP server
// No process.env access in implementation code - all env access goes through here

import { Config, ConfigError, Context, Effect, Layer } from 'effect';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Client detection environment variables
const clientEnvVars = [
	{ key: 'CLAUDE_CODE', name: 'Claude Code' },
	{ key: 'CURSOR_SESSION', name: 'Cursor' },
	{ key: 'CLINE_SESSION', name: 'Cline' },
	{ key: 'CONTINUE_SESSION', name: 'Continue.dev' },
	{ key: 'ZED_SESSION', name: 'Zed' },
] as const;

// Configuration values
export interface McpConfig {
	readonly workingDir: string;
	readonly clientName: string;
	readonly dbPaths: readonly string[];
}

export const McpConfig = Context.GenericTag<McpConfig>('McpConfig');

// Detect client name from environment using Config
const detectClientName: Effect.Effect<string, ConfigError.ConfigError> =
	Effect.gen(function* () {
		for (const { key, name } of clientEnvVars) {
			const value = yield* Config.string(key).pipe(
				Config.withDefault(''),
			);
			if (value) return name;
		}
		return 'Unknown Agent';
	});

// Build possible DB paths based on working directory
const buildDbPaths = (cwd: string): readonly string[] =>
	[
		join(cwd, 'db', 'pr-reviewer.db'),
		// Fallback paths for when MCP server runs from different locations
		join(__dirname, '..', '..', '..', 'db', 'pr-reviewer.db'),
		join(__dirname, '..', '..', 'db', 'pr-reviewer.db'),
	] as const;

// Create config from environment
const makeConfig: Effect.Effect<McpConfig, ConfigError.ConfigError> =
	Effect.gen(function* () {
		// CWD config - use PWD env var or fallback to process.cwd() via sync
		const workingDir = yield* Config.string('PWD').pipe(
			Config.orElse(() => Config.succeed(process.cwd())),
		);

		const clientName = yield* detectClientName;
		const dbPaths = buildDbPaths(workingDir);

		return {
			workingDir,
			clientName,
			dbPaths,
		} satisfies McpConfig;
	});

// Live layer - reads from environment once at startup
// Config errors are converted to defects (will crash on startup if config is invalid)
export const McpConfigLive = Layer.effect(
	McpConfig,
	makeConfig.pipe(
		Effect.tap((config) =>
			Effect.logDebug('MCP Config initialized', {
				workingDir: config.workingDir,
				clientName: config.clientName,
			}),
		),
		Effect.orDie, // Convert ConfigError to defect - fail fast on bad config
	),
);

// For testing - create config with custom values
export const makeTestConfig = (overrides: Partial<McpConfig>): McpConfig => ({
	workingDir: overrides.workingDir ?? '/test/path',
	clientName: overrides.clientName ?? 'Test Agent',
	dbPaths: overrides.dbPaths ?? ['/test/db/pr-reviewer.db'],
});

export const McpConfigTest = (overrides: Partial<McpConfig> = {}) =>
	Layer.succeed(McpConfig, makeTestConfig(overrides));
