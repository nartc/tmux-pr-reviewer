/**
 * Global configuration utilities for local-pr-reviewer MCP server
 *
 * This mirrors the webapp's global-config.ts for shared access to:
 * - Config location: ~/.config/local-pr-reviewer/
 * - config.json: Installation config
 * - runtime.json: Running webapp info
 * - signals/: Pending review signals per repo
 */

import { Data, Effect, Option } from 'effect';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Types
export interface GlobalConfig {
	installPath: string;
	installedAt: string;
}

export interface RuntimeConfig {
	port: number;
	pid: number;
	startedAt: string;
}

export interface SignalFile {
	repoPath: string;
	sessionId: string;
	pendingCount: number;
	createdAt: string;
	remoteUrl: string | null;
}

export interface PendingReview {
	repoPath: string;
	repoName: string;
	pendingCount: number;
	waitingSince: string;
	sessionId: string;
}

// Error type
export class GlobalConfigError extends Data.TaggedError('GlobalConfigError')<{
	readonly operation: string;
	readonly cause?: unknown;
}> {}

// Constants
const CONFIG_DIR_NAME = 'local-pr-reviewer';
const CONFIG_FILE = 'config.json';
const RUNTIME_FILE = 'runtime.json';
const SIGNALS_DIR = 'signals';
const STALE_THRESHOLD_DAYS = 7;

// Path helpers
const getConfigDirPath = (): string =>
	path.join(os.homedir(), '.config', CONFIG_DIR_NAME);

const getSignalsDirPath = (): string =>
	path.join(getConfigDirPath(), SIGNALS_DIR);

const getConfigFilePath = (): string =>
	path.join(getConfigDirPath(), CONFIG_FILE);

const getRuntimeFilePath = (): string =>
	path.join(getConfigDirPath(), RUNTIME_FILE);

/**
 * Generate signal file name from repo path
 */
export const getSignalFileName = (
	repoPath: string,
	remoteUrl: string | null,
): string => {
	let repoName = 'unknown-repo';

	if (remoteUrl) {
		const match = remoteUrl.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
		if (match) {
			repoName = `${match[1]}-${match[2]}`;
		}
	} else {
		repoName = path.basename(repoPath);
	}

	const hash = createHash('sha256')
		.update(repoPath)
		.digest('hex')
		.substring(0, 6);

	return `${repoName}-${hash}.json`;
};

const getSignalFilePath = (
	repoPath: string,
	remoteUrl: string | null,
): string =>
	path.join(getSignalsDirPath(), getSignalFileName(repoPath, remoteUrl));

/**
 * Extract repo name from remote URL or path
 */
const extractRepoName = (
	repoPath: string,
	remoteUrl: string | null,
): string => {
	if (remoteUrl) {
		const match = remoteUrl.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
		if (match) {
			return `${match[1]}/${match[2]}`;
		}
	}
	return path.basename(repoPath);
};

// Effect-based functions

/**
 * Read the global config
 */
export const getConfig = Effect.try({
	try: (): Option.Option<GlobalConfig> => {
		const configPath = getConfigFilePath();
		if (!fs.existsSync(configPath)) {
			return Option.none();
		}
		const content = fs.readFileSync(configPath, 'utf-8');
		return Option.some(JSON.parse(content) as GlobalConfig);
	},
	catch: () => Option.none<GlobalConfig>(),
}).pipe(
	Effect.catchAll(() => Effect.succeed(Option.none<GlobalConfig>())),
	Effect.withSpan('globalConfig.getConfig'),
);

/**
 * Read the runtime config
 */
export const getRuntime = Effect.try({
	try: (): Option.Option<RuntimeConfig> => {
		const runtimePath = getRuntimeFilePath();
		if (!fs.existsSync(runtimePath)) {
			return Option.none();
		}
		const content = fs.readFileSync(runtimePath, 'utf-8');
		return Option.some(JSON.parse(content) as RuntimeConfig);
	},
	catch: () => Option.none<RuntimeConfig>(),
}).pipe(
	Effect.catchAll(() => Effect.succeed(Option.none<RuntimeConfig>())),
	Effect.withSpan('globalConfig.getRuntime'),
);

/**
 * Check if the webapp is running
 */
export const isWebappRunning = Effect.gen(function* () {
	const runtime = yield* getRuntime;
	if (Option.isNone(runtime)) return false;

	try {
		process.kill(runtime.value.pid, 0);
		return true;
	} catch {
		return false;
	}
}).pipe(Effect.withSpan('globalConfig.isWebappRunning'));

/**
 * Get the webapp URL if running
 */
export const getWebappUrl = Effect.gen(function* () {
	const runtime = yield* getRuntime;
	if (Option.isNone(runtime)) return Option.none<string>();

	const running = yield* isWebappRunning;
	if (!running) return Option.none<string>();

	return Option.some(`http://localhost:${runtime.value.port}`);
}).pipe(Effect.withSpan('globalConfig.getWebappUrl'));

/**
 * Check if local-pr-reviewer is configured
 */
export const isConfigured = Effect.gen(function* () {
	const config = yield* getConfig;
	return Option.isSome(config);
}).pipe(Effect.withSpan('globalConfig.isConfigured'));

/**
 * Read a signal file
 */
export const readSignal = (repoPath: string, remoteUrl: string | null) =>
	Effect.try({
		try: (): Option.Option<SignalFile> => {
			const signalPath = getSignalFilePath(repoPath, remoteUrl);
			if (!fs.existsSync(signalPath)) {
				return Option.none();
			}
			const content = fs.readFileSync(signalPath, 'utf-8');
			return Option.some(JSON.parse(content) as SignalFile);
		},
		catch: () => Option.none<SignalFile>(),
	}).pipe(
		Effect.catchAll(() => Effect.succeed(Option.none<SignalFile>())),
		Effect.withSpan('globalConfig.readSignal'),
	);

/**
 * Delete a signal file
 */
export const deleteSignal = (repoPath: string, remoteUrl: string | null) =>
	Effect.try({
		try: () => {
			const signalPath = getSignalFilePath(repoPath, remoteUrl);
			if (fs.existsSync(signalPath)) {
				fs.unlinkSync(signalPath);
			}
		},
		catch: (cause) =>
			new GlobalConfigError({ operation: 'deleteSignal', cause }),
	}).pipe(
		Effect.tap(() => Effect.logDebug('Signal deleted', { repoPath })),
		Effect.catchAll(() => Effect.void),
		Effect.withSpan('globalConfig.deleteSignal'),
	);

/**
 * Update signal count, delete if count reaches 0
 */
export const updateSignalCount = (
	repoPath: string,
	remoteUrl: string | null,
	newCount: number,
) =>
	Effect.gen(function* () {
		if (newCount <= 0) {
			yield* deleteSignal(repoPath, remoteUrl);
			return;
		}

		const signal = yield* readSignal(repoPath, remoteUrl);
		if (Option.isNone(signal)) return;

		const updated = { ...signal.value, pendingCount: newCount };
		const signalPath = getSignalFilePath(repoPath, remoteUrl);
		yield* Effect.try({
			try: () => {
				fs.writeFileSync(signalPath, JSON.stringify(updated, null, 2));
			},
			catch: (cause) =>
				new GlobalConfigError({
					operation: 'updateSignalCount',
					cause,
				}),
		});
		yield* Effect.logDebug('Signal count updated', { repoPath, newCount });
	}).pipe(Effect.withSpan('globalConfig.updateSignalCount'));

/**
 * Read all signals and return pending reviews
 * Also cleans up stale signals (>7 days)
 */
export const readAllPendingReviews = Effect.try({
	try: () => {
		const signalsDir = getSignalsDirPath();
		if (!fs.existsSync(signalsDir)) {
			return [] as PendingReview[];
		}

		const pending: PendingReview[] = [];
		const staleThreshold =
			Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
		const files = fs.readdirSync(signalsDir);

		for (const file of files) {
			if (!file.endsWith('.json')) continue;

			const filePath = path.join(signalsDir, file);
			try {
				const content = fs.readFileSync(filePath, 'utf-8');
				const signal = JSON.parse(content) as SignalFile;

				// Clean up stale signals
				if (new Date(signal.createdAt).getTime() < staleThreshold) {
					fs.unlinkSync(filePath);
					continue;
				}

				pending.push({
					repoPath: signal.repoPath,
					repoName: extractRepoName(
						signal.repoPath,
						signal.remoteUrl,
					),
					pendingCount: signal.pendingCount,
					waitingSince: signal.createdAt,
					sessionId: signal.sessionId,
				});
			} catch {
				// Skip invalid files
			}
		}

		return pending;
	},
	catch: () => [] as PendingReview[],
}).pipe(
	Effect.catchAll(() => Effect.succeed([] as PendingReview[])),
	Effect.withSpan('globalConfig.readAllPendingReviews'),
);

// Export path helpers for sync usage where needed
export const paths = {
	getConfigDir: getConfigDirPath,
	getSignalsDir: getSignalsDirPath,
	getSignalFile: getSignalFilePath,
};
