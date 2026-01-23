/**
 * Global configuration utilities for local-pr-reviewer
 *
 * Config location: ~/.config/local-pr-reviewer/
 * - config.json: Installation config (installPath, installedAt)
 * - runtime.json: Running webapp info (port, pid, startedAt)
 * - signals/: Pending review signals per repo
 */

import { Context, Data, Effect, Layer, Option } from 'effect';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';

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

export interface RepoInfo {
	repoPath: string;
	remoteUrl: string | null;
	sessionId: string;
	repoName: string;
}

// Error types
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

// Path helpers (pure, no side effects)
const getConfigDirPath = (): string =>
	nodePath.join(os.homedir(), '.config', CONFIG_DIR_NAME);

const getSignalsDirPath = (): string =>
	nodePath.join(getConfigDirPath(), SIGNALS_DIR);

const getConfigFilePath = (): string =>
	nodePath.join(getConfigDirPath(), CONFIG_FILE);

const getRuntimeFilePath = (): string =>
	nodePath.join(getConfigDirPath(), RUNTIME_FILE);

/**
 * Generate a signal file name from repo info
 * Format: {owner}-{repo}-{hash6}.json
 * Hash is derived from local repo path for worktree distinction
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
		repoName = nodePath.basename(repoPath);
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
	nodePath.join(getSignalsDirPath(), getSignalFileName(repoPath, remoteUrl));

// GlobalConfigService interface
export interface GlobalConfigService {
	readonly ensureConfigDir: Effect.Effect<string, GlobalConfigError>;
	readonly ensureSignalsDir: Effect.Effect<string, GlobalConfigError>;
	readonly getConfig: Effect.Effect<
		Option.Option<GlobalConfig>,
		GlobalConfigError
	>;
	readonly saveConfig: (
		config: GlobalConfig,
	) => Effect.Effect<void, GlobalConfigError>;
	readonly getRuntime: Effect.Effect<
		Option.Option<RuntimeConfig>,
		GlobalConfigError
	>;
	readonly saveRuntime: (
		runtime: RuntimeConfig,
	) => Effect.Effect<void, GlobalConfigError>;
	readonly deleteRuntime: Effect.Effect<void, GlobalConfigError>;
	readonly writeSignal: (
		repo: RepoInfo,
		pendingCount: number,
	) => Effect.Effect<void, GlobalConfigError>;
	readonly readSignal: (
		repoPath: string,
		remoteUrl: string | null,
	) => Effect.Effect<Option.Option<SignalFile>, GlobalConfigError>;
	readonly updateSignalCount: (
		repoPath: string,
		remoteUrl: string | null,
		newCount: number,
	) => Effect.Effect<void, GlobalConfigError>;
	readonly deleteSignal: (
		repoPath: string,
		remoteUrl: string | null,
	) => Effect.Effect<void, GlobalConfigError>;
	readonly readAllSignals: Effect.Effect<SignalFile[], GlobalConfigError>;
	readonly cleanupStaleSignals: Effect.Effect<number, GlobalConfigError>;
	readonly isWebappRunning: Effect.Effect<boolean, GlobalConfigError>;
	readonly getWebappUrl: Effect.Effect<
		Option.Option<string>,
		GlobalConfigError
	>;
}

export const GlobalConfigService = Context.GenericTag<GlobalConfigService>(
	'GlobalConfigService',
);

// Implementation
const makeGlobalConfigService = (): GlobalConfigService => {
	const ensureConfigDir = Effect.try({
		try: () => {
			const dir = getConfigDirPath();
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			return dir;
		},
		catch: (cause) =>
			new GlobalConfigError({ operation: 'ensureConfigDir', cause }),
	}).pipe(Effect.withSpan('globalConfig.ensureConfigDir'));

	const ensureSignalsDir = Effect.gen(function* () {
		yield* ensureConfigDir;
		const dir = getSignalsDirPath();
		yield* Effect.try({
			try: () => {
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
				return dir;
			},
			catch: (cause) =>
				new GlobalConfigError({ operation: 'ensureSignalsDir', cause }),
		});
		return dir;
	}).pipe(Effect.withSpan('globalConfig.ensureSignalsDir'));

	const getConfig = Effect.try({
		try: () => {
			const configPath = getConfigFilePath();
			if (!fs.existsSync(configPath)) {
				return Option.none<GlobalConfig>();
			}
			const content = fs.readFileSync(configPath, 'utf-8');
			return Option.some(JSON.parse(content) as GlobalConfig);
		},
		catch: () => Option.none<GlobalConfig>(),
	}).pipe(
		Effect.catchAll(() => Effect.succeed(Option.none<GlobalConfig>())),
		Effect.withSpan('globalConfig.getConfig'),
	);

	const saveConfig = (config: GlobalConfig) =>
		Effect.gen(function* () {
			yield* ensureConfigDir;
			yield* Effect.try({
				try: () => {
					const configPath = getConfigFilePath();
					fs.writeFileSync(
						configPath,
						JSON.stringify(config, null, 2),
					);
				},
				catch: (cause) =>
					new GlobalConfigError({ operation: 'saveConfig', cause }),
			});
		}).pipe(Effect.withSpan('globalConfig.saveConfig'));

	const getRuntime = Effect.try({
		try: () => {
			const runtimePath = getRuntimeFilePath();
			if (!fs.existsSync(runtimePath)) {
				return Option.none<RuntimeConfig>();
			}
			const content = fs.readFileSync(runtimePath, 'utf-8');
			return Option.some(JSON.parse(content) as RuntimeConfig);
		},
		catch: () => Option.none<RuntimeConfig>(),
	}).pipe(
		Effect.catchAll(() => Effect.succeed(Option.none<RuntimeConfig>())),
		Effect.withSpan('globalConfig.getRuntime'),
	);

	const saveRuntime = (runtime: RuntimeConfig) =>
		Effect.gen(function* () {
			yield* ensureConfigDir;
			yield* Effect.try({
				try: () => {
					const runtimePath = getRuntimeFilePath();
					fs.writeFileSync(
						runtimePath,
						JSON.stringify(runtime, null, 2),
					);
				},
				catch: (cause) =>
					new GlobalConfigError({ operation: 'saveRuntime', cause }),
			});
		}).pipe(Effect.withSpan('globalConfig.saveRuntime'));

	const deleteRuntime = Effect.try({
		try: () => {
			const runtimePath = getRuntimeFilePath();
			if (fs.existsSync(runtimePath)) {
				fs.unlinkSync(runtimePath);
			}
		},
		catch: (cause) =>
			new GlobalConfigError({ operation: 'deleteRuntime', cause }),
	}).pipe(
		Effect.catchAll(() => Effect.void),
		Effect.withSpan('globalConfig.deleteRuntime'),
	);

	const writeSignal = (repo: RepoInfo, pendingCount: number) =>
		Effect.gen(function* () {
			yield* ensureSignalsDir;
			yield* Effect.try({
				try: () => {
					const signalPath = getSignalFilePath(
						repo.repoPath,
						repo.remoteUrl,
					);
					const signal: SignalFile = {
						repoPath: repo.repoPath,
						sessionId: repo.sessionId,
						pendingCount,
						createdAt: new Date().toISOString(),
						remoteUrl: repo.remoteUrl,
					};
					fs.writeFileSync(
						signalPath,
						JSON.stringify(signal, null, 2),
					);
				},
				catch: (cause) =>
					new GlobalConfigError({ operation: 'writeSignal', cause }),
			});
			yield* Effect.logDebug('Signal written', {
				repoPath: repo.repoPath,
				pendingCount,
			});
		}).pipe(Effect.withSpan('globalConfig.writeSignal'));

	const readSignal = (repoPath: string, remoteUrl: string | null) =>
		Effect.try({
			try: () => {
				const signalPath = getSignalFilePath(repoPath, remoteUrl);
				if (!fs.existsSync(signalPath)) {
					return Option.none<SignalFile>();
				}
				const content = fs.readFileSync(signalPath, 'utf-8');
				return Option.some(JSON.parse(content) as SignalFile);
			},
			catch: () => Option.none<SignalFile>(),
		}).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none<SignalFile>())),
			Effect.withSpan('globalConfig.readSignal'),
		);

	const deleteSignal = (repoPath: string, remoteUrl: string | null) =>
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

	const updateSignalCount = (
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
					fs.writeFileSync(
						signalPath,
						JSON.stringify(updated, null, 2),
					);
				},
				catch: (cause) =>
					new GlobalConfigError({
						operation: 'updateSignalCount',
						cause,
					}),
			});
			yield* Effect.logDebug('Signal count updated', {
				repoPath,
				newCount,
			});
		}).pipe(Effect.withSpan('globalConfig.updateSignalCount'));

	const readAllSignals = Effect.try({
		try: () => {
			const signalsDir = getSignalsDirPath();
			if (!fs.existsSync(signalsDir)) {
				return [];
			}

			const signals: SignalFile[] = [];
			const files = fs.readdirSync(signalsDir);

			for (const file of files) {
				if (!file.endsWith('.json')) continue;

				const filePath = nodePath.join(signalsDir, file);
				try {
					const content = fs.readFileSync(filePath, 'utf-8');
					signals.push(JSON.parse(content) as SignalFile);
				} catch {
					// Skip invalid files
				}
			}

			return signals;
		},
		catch: () => [] as SignalFile[],
	}).pipe(
		Effect.catchAll(() => Effect.succeed([] as SignalFile[])),
		Effect.withSpan('globalConfig.readAllSignals'),
	);

	const cleanupStaleSignals = Effect.try({
		try: () => {
			const signalsDir = getSignalsDirPath();
			if (!fs.existsSync(signalsDir)) return 0;

			const staleThreshold =
				Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
			const files = fs.readdirSync(signalsDir);
			let cleanedUp = 0;

			for (const file of files) {
				if (!file.endsWith('.json')) continue;

				const filePath = nodePath.join(signalsDir, file);
				try {
					const content = fs.readFileSync(filePath, 'utf-8');
					const signal = JSON.parse(content) as SignalFile;

					if (new Date(signal.createdAt).getTime() < staleThreshold) {
						fs.unlinkSync(filePath);
						cleanedUp++;
					}
				} catch {
					// Skip invalid files
				}
			}

			return cleanedUp;
		},
		catch: () => 0,
	}).pipe(
		Effect.tap((cleanedUp) =>
			Effect.logInfo('Stale signals cleaned up', { cleanedUp }),
		),
		Effect.catchAll(() => Effect.succeed(0)),
		Effect.withSpan('globalConfig.cleanupStaleSignals'),
	);

	const isWebappRunning = Effect.gen(function* () {
		const runtime = yield* getRuntime;
		if (Option.isNone(runtime)) return false;

		try {
			// Signal 0 doesn't kill, just checks if process exists
			process.kill(runtime.value.pid, 0);
			return true;
		} catch {
			// Process not running, clean up stale runtime file
			yield* deleteRuntime;
			return false;
		}
	}).pipe(Effect.withSpan('globalConfig.isWebappRunning'));

	const getWebappUrl = Effect.gen(function* () {
		const runtime = yield* getRuntime;
		if (Option.isNone(runtime)) return Option.none<string>();

		const running = yield* isWebappRunning;
		if (!running) return Option.none<string>();

		return Option.some(`http://localhost:${runtime.value.port}`);
	}).pipe(Effect.withSpan('globalConfig.getWebappUrl'));

	return {
		ensureConfigDir,
		ensureSignalsDir,
		getConfig,
		saveConfig,
		getRuntime,
		saveRuntime,
		deleteRuntime,
		writeSignal,
		readSignal,
		updateSignalCount,
		deleteSignal,
		readAllSignals,
		cleanupStaleSignals,
		isWebappRunning,
		getWebappUrl,
	};
};

// Live layer
export const GlobalConfigServiceLive = Layer.succeed(
	GlobalConfigService,
	makeGlobalConfigService(),
);

// Re-export path helpers for use in server.js (which can't use Effect)
export const paths = {
	getConfigDir: getConfigDirPath,
	getSignalsDir: getSignalsDirPath,
	getConfigFile: getConfigFilePath,
	getRuntimeFile: getRuntimeFilePath,
	getSignalFile: getSignalFilePath,
	getSignalFileName,
};
