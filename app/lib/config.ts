import { Context, Effect, Layer } from 'effect';

// Config schema
export interface AppConfig {
	readonly aiProvider: string | undefined;
	readonly googleApiKey: string | undefined;
	readonly openaiApiKey: string | undefined;
	readonly anthropicApiKey: string | undefined;
	readonly repoScanMaxDepth: number;
	readonly repoScanRoot: string;
}

// Config service interface
export interface ConfigService {
	readonly config: AppConfig;
}

export const ConfigService = Context.GenericTag<ConfigService>('ConfigService');

// Live implementation - loads config from environment
export const ConfigServiceLive = Layer.succeed(
	ConfigService,
	ConfigService.of({
		config: {
			aiProvider: process.env.AI_PROVIDER || undefined,
			googleApiKey: process.env.GOOGLE_API_KEY || undefined,
			openaiApiKey: process.env.OPENAI_API_KEY || undefined,
			anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
			repoScanMaxDepth: parseInt(
				process.env.REPO_SCAN_MAX_DEPTH || '3',
				10,
			),
			repoScanRoot: process.env.REPO_SCAN_ROOT || process.env.HOME || '/',
		},
	}),
);

// Helper to get config in Effect context
export const getConfig = Effect.gen(function* () {
	const { config } = yield* ConfigService;
	return config;
});

// Direct access for use outside Effect context
export const getConfigSync = (): AppConfig => ({
	aiProvider: process.env.AI_PROVIDER || undefined,
	googleApiKey: process.env.GOOGLE_API_KEY || undefined,
	openaiApiKey: process.env.OPENAI_API_KEY || undefined,
	anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
	repoScanMaxDepth: parseInt(process.env.REPO_SCAN_MAX_DEPTH || '3', 10),
	repoScanRoot: process.env.REPO_SCAN_ROOT || process.env.HOME || '/',
});
