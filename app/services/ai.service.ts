import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { Context, Effect, Layer } from 'effect';
import { type AppConfig, ConfigService } from '../lib/config';
import {
	AIError,
	AIProviderUnavailableError,
	DatabaseError,
} from '../lib/errors';
import type { Comment } from './comment.service';
import { DbService, execute, queryOne } from './db.service';

// Provider configuration
export type AIProvider = 'google' | 'openai' | 'anthropic';

interface ProviderConfig {
	name: AIProvider;
	models: string[];
	createClient: (
		config: AppConfig,
	) =>
		| ReturnType<typeof createGoogleGenerativeAI>
		| ReturnType<typeof createOpenAI>
		| ReturnType<typeof createAnthropic>;
	getApiKey: (config: AppConfig) => string | undefined;
}

const providers: ProviderConfig[] = [
	{
		name: 'google',
		models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
		createClient: (config) =>
			createGoogleGenerativeAI({ apiKey: config.googleApiKey }),
		getApiKey: (config) => config.googleApiKey,
	},
	{
		name: 'openai',
		models: ['gpt-4o-mini', 'gpt-4o'],
		createClient: (config) => createOpenAI({ apiKey: config.openaiApiKey }),
		getApiKey: (config) => config.openaiApiKey,
	},
	{
		name: 'anthropic',
		models: ['claude-3-5-sonnet-latest'],
		createClient: (config) =>
			createAnthropic({ apiKey: config.anthropicApiKey }),
		getApiKey: (config) => config.anthropicApiKey,
	},
];

// Fallback chain order (cheapest/fastest first)
const fallbackChain = [
	{ provider: 'google', model: 'gemini-1.5-flash' },
	{ provider: 'openai', model: 'gpt-4o-mini' },
	{ provider: 'google', model: 'gemini-1.5-pro' },
	{ provider: 'openai', model: 'gpt-4o' },
	{ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
] as const;

// Processing prompt
const PROCESSING_PROMPT = `You are a code review assistant. Your task is to process and improve code review comments.

Given a list of comments about code changes, please:
1. Remove any duplicate or redundant comments
2. Combine related comments that address the same issue
3. Prioritize comments by importance (critical issues first, then improvements, then style)
4. Improve clarity and actionability of each comment
5. Keep the file path and line number context

Format your response as a list of improved comments, each with:
- File path and line number (if applicable)
- The improved comment text

Be concise but thorough. Focus on actionable feedback.`;

// AIService interface
export interface AIService {
	readonly getAvailableProviders: Effect.Effect<
		AIProvider[],
		never,
		ConfigService
	>;

	readonly getSettings: Effect.Effect<
		{ provider: AIProvider | null; model: string | null },
		DatabaseError,
		DbService
	>;

	readonly saveSettings: (
		provider: AIProvider,
		model: string,
	) => Effect.Effect<void, DatabaseError, DbService>;

	readonly processComments: (
		comments: Comment[],
	) => Effect.Effect<
		string,
		AIError | AIProviderUnavailableError | DatabaseError,
		DbService | ConfigService
	>;

	readonly generateWithProvider: (
		providerName: AIProvider,
		modelName: string,
		prompt: string,
	) => Effect.Effect<
		string,
		AIError | AIProviderUnavailableError,
		ConfigService
	>;

	readonly getModelsForProvider: (provider: AIProvider) => string[];
}

export const AIService = Context.GenericTag<AIService>('AIService');

// Implementation
const makeAIService = (): AIService => {
	const getAvailableProviders = Effect.gen(function* () {
		const { config } = yield* ConfigService;
		return providers.filter((p) => p.getApiKey(config)).map((p) => p.name);
	}).pipe(Effect.withSpan('ai.getAvailableProviders'));

	const getSettings = Effect.gen(function* () {
		const providerRow = yield* queryOne<{ value: string }>(
			"SELECT value FROM app_config WHERE key = 'ai_provider'",
		);
		const modelRow = yield* queryOne<{ value: string }>(
			"SELECT value FROM app_config WHERE key = 'ai_model'",
		);

		return {
			provider: (providerRow?.value as AIProvider) || null,
			model: modelRow?.value || null,
		};
	}).pipe(Effect.withSpan('ai.getSettings'));

	const saveSettings = (provider: AIProvider, model: string) =>
		Effect.gen(function* () {
			yield* execute(
				"INSERT OR REPLACE INTO app_config (key, value) VALUES ('ai_provider', ?)",
				[provider],
			);
			yield* execute(
				"INSERT OR REPLACE INTO app_config (key, value) VALUES ('ai_model', ?)",
				[model],
			);
			yield* Effect.logInfo('AI settings saved', { provider, model });
		}).pipe(Effect.withSpan('ai.saveSettings'));

	const generateWithProvider = (
		providerName: AIProvider,
		modelName: string,
		prompt: string,
	) =>
		Effect.gen(function* () {
			const { config } = yield* ConfigService;

			const providerConfig = providers.find(
				(p) => p.name === providerName,
			);
			if (!providerConfig) {
				return yield* Effect.fail(
					new AIProviderUnavailableError({ provider: providerName }),
				);
			}

			if (!providerConfig.getApiKey(config)) {
				return yield* Effect.fail(
					new AIProviderUnavailableError({ provider: providerName }),
				);
			}

			yield* Effect.logDebug('Generating with provider', {
				provider: providerName,
				model: modelName,
			});

			const client = providerConfig.createClient(config);
			const model = client(modelName);

			const result = yield* Effect.tryPromise({
				try: async () => {
					const { text } = await generateText({
						model,
						prompt,
					});
					return text;
				},
				catch: (error) =>
					new AIError({
						message:
							error instanceof Error
								? error.message
								: 'AI generation failed',
						provider: providerName,
						cause: error,
					}),
			});

			yield* Effect.logInfo('AI generation completed', {
				provider: providerName,
				model: modelName,
				responseLength: result.length,
			});

			return result;
		}).pipe(Effect.withSpan('ai.generateWithProvider'));

	const processComments = (comments: Comment[]) =>
		Effect.gen(function* () {
			if (comments.length === 0) {
				return '';
			}

			const { config } = yield* ConfigService;

			// Format comments for the prompt
			const commentsText = comments
				.map((c) => {
					const lineInfo = c.line_start ? `:${c.line_start}` : '';
					return `**${c.file_path}${lineInfo}**\n${c.content}`;
				})
				.join('\n\n---\n\n');

			const prompt = `${PROCESSING_PROMPT}\n\n## Comments to process:\n\n${commentsText}`;

			// Try user-configured provider first
			const settings = yield* getSettings;
			if (settings.provider && settings.model) {
				const result = yield* generateWithProvider(
					settings.provider,
					settings.model,
					prompt,
				).pipe(
					Effect.catchAll((error) => {
						return Effect.gen(function* () {
							yield* Effect.logWarning(
								`Configured provider ${settings.provider} failed, trying fallback chain`,
								{ error: String(error) },
							);
							return null;
						});
					}),
				);
				if (result) return result;
			}

			// Try fallback chain
			for (const { provider, model } of fallbackChain) {
				const providerConfig = providers.find(
					(p) => p.name === provider,
				);
				if (!providerConfig || !providerConfig.getApiKey(config)) {
					continue;
				}

				const result = yield* generateWithProvider(
					provider,
					model,
					prompt,
				).pipe(
					Effect.catchAll((error) => {
						return Effect.gen(function* () {
							yield* Effect.logWarning(
								`Provider ${provider}/${model} failed`,
								{
									error: String(error),
								},
							);
							return null;
						});
					}),
				);
				if (result) return result;
			}

			return yield* Effect.fail(
				new AIError({
					message:
						'All AI providers failed. Please check your API keys.',
				}),
			);
		}).pipe(Effect.withSpan('ai.processComments'));

	const getModelsForProvider = (provider: AIProvider): string[] => {
		const config = providers.find((p) => p.name === provider);
		return config?.models || [];
	};

	return {
		getAvailableProviders,
		getSettings,
		saveSettings,
		processComments,
		generateWithProvider,
		getModelsForProvider,
	};
};

// Live layer
export const AIServiceLive = Layer.succeed(AIService, makeAIService());
