import { Effect, Layer, Logger, LogLevel, ManagedRuntime } from 'effect';
import { AIServiceLive } from '../services/ai.service.js';
import { CommentServiceLive } from '../services/comment.service.js';
import { DbServiceLive } from '../services/db.service.js';
import { GitServiceLive } from '../services/git.service.js';
import { RepoServiceLive } from '../services/repo.service.js';
import { TmuxServiceLive } from '../services/tmux.service.js';
import { ConfigServiceLive } from './config.js';

// Logging layer - JSON for production, pretty for development
const LoggingLive = Layer.mergeAll(
	process.env.NODE_ENV === 'production' ? Logger.json : Logger.pretty,
	Logger.minimumLogLevel(
		process.env.NODE_ENV === 'production' ? LogLevel.Info : LogLevel.Debug,
	),
);

// Compose all service layers
export const AppLayer = Layer.mergeAll(
	ConfigServiceLive,
	DbServiceLive,
	GitServiceLive,
	TmuxServiceLive,
	RepoServiceLive,
	CommentServiceLive,
	AIServiceLive,
).pipe(Layer.provide(LoggingLive));

// Type for services provided by AppLayer
export type AppServices = Layer.Layer.Success<typeof AppLayer>;

// Runtime instance - initialized with all services
export const runtime = ManagedRuntime.make(AppLayer);

// Helper to run effects in loaders/actions
export const runEffect = <A, E>(
	effect: Effect.Effect<A, E, AppServices>,
): Promise<A> => {
	return runtime.runPromise(effect);
};

// Helper to run effects that may fail, returning Result type
export const runEffectEither = <A, E>(
	effect: Effect.Effect<A, E, AppServices>,
): Promise<{ success: true; data: A } | { success: false; error: E }> => {
	return runtime.runPromise(
		effect.pipe(
			Effect.map((data) => ({ success: true as const, data })),
			Effect.catchAll((error) =>
				Effect.succeed({ success: false as const, error }),
			),
		),
	);
};

// Helper to run effects without services (for simple operations)
export const runEffectSync = <A, E>(
	effect: Effect.Effect<A, E, never>,
): Promise<A> => {
	return Effect.runPromise(effect);
};

// Generate unique IDs
export const generateId = (): string => {
	return crypto.randomUUID();
};

// Logging helpers for use in services
export const logDebug = (message: string, data?: Record<string, unknown>) =>
	data ? Effect.logDebug(message, data) : Effect.logDebug(message);

export const logInfo = (message: string, data?: Record<string, unknown>) =>
	data ? Effect.logInfo(message, data) : Effect.logInfo(message);

export const logWarning = (message: string, data?: Record<string, unknown>) =>
	data ? Effect.logWarning(message, data) : Effect.logWarning(message);

export const logError = (message: string, data?: Record<string, unknown>) =>
	data ? Effect.logError(message, data) : Effect.logError(message);

// Span helper for tracing
export const withSpan = <A, E, R>(
	name: string,
	effect: Effect.Effect<A, E, R>,
) => Effect.withSpan(name)(effect);
