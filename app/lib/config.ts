import { Config, Context, Effect, Layer } from 'effect';

// Config schema
export interface AppConfig {
	readonly cwd: string;
	readonly aiProvider: string | undefined;
	readonly googleApiKey: string | undefined;
	readonly openaiApiKey: string | undefined;
	readonly anthropicApiKey: string | undefined;
	readonly repoScanMaxDepth: number;
	/**
	 * List of absolute paths to scan for git repositories.
	 * Configured via REPO_SCAN_ROOT env var (comma-separated).
	 * Example: REPO_SCAN_ROOT=/Users/me/code,/Users/me/projects
	 */
	readonly repoScanRoots: string[];
}

// Config service interface
export interface ConfigService {
	readonly config: AppConfig;
}

export const ConfigService = Context.GenericTag<ConfigService>('ConfigService');

// Parse comma-separated paths, filtering empty strings
const parseCommaSeparated = (value: string): string[] =>
	value
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

// Configuration using Effect's Config API
const appConfig = Config.all({
	// PWD env var or fallback - Config.succeed used for sync fallback
	cwd: Config.string('PWD').pipe(Config.withDefault(process.cwd())),
	aiProvider: Config.string('AI_PROVIDER').pipe(Config.option),
	googleApiKey: Config.string('GOOGLE_API_KEY').pipe(Config.option),
	openaiApiKey: Config.string('OPENAI_API_KEY').pipe(Config.option),
	anthropicApiKey: Config.string('ANTHROPIC_API_KEY').pipe(Config.option),
	repoScanMaxDepth: Config.integer('REPO_SCAN_MAX_DEPTH').pipe(
		Config.withDefault(3),
	),
	repoScanRoots: Config.string('REPO_SCAN_ROOT').pipe(
		Config.map(parseCommaSeparated),
		Config.orElse(() =>
			Config.string('HOME').pipe(
				Config.map((home): string[] => [home]),
				Config.withDefault(['/'] as string[]),
			),
		),
	),
});

// Live implementation - loads config from environment using Effect Config
export const ConfigServiceLive = Layer.effect(
	ConfigService,
	Effect.gen(function* () {
		const cfg = yield* appConfig;

		return ConfigService.of({
			config: {
				cwd: cfg.cwd,
				aiProvider:
					cfg.aiProvider._tag === 'Some'
						? cfg.aiProvider.value
						: undefined,
				googleApiKey:
					cfg.googleApiKey._tag === 'Some'
						? cfg.googleApiKey.value
						: undefined,
				openaiApiKey:
					cfg.openaiApiKey._tag === 'Some'
						? cfg.openaiApiKey.value
						: undefined,
				anthropicApiKey:
					cfg.anthropicApiKey._tag === 'Some'
						? cfg.anthropicApiKey.value
						: undefined,
				repoScanMaxDepth: cfg.repoScanMaxDepth,
				repoScanRoots: cfg.repoScanRoots,
			},
		});
	}),
);
