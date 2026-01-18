import { exec, execSync } from 'child_process';
import { Context, Effect, Layer } from 'effect';
import { promisify } from 'util';
import {
	TmuxError,
	TmuxSendError,
	TmuxSessionNotFoundError,
} from '../lib/errors';

const execAsync = promisify(exec);

// Types
export interface TmuxWindow {
	sessionName: string;
	windowIndex: number;
	windowName: string;
	paneCurrentPath: string;
	paneCurrentCommand: string;
	detectedAgent: string | null;
}

export interface TmuxSession {
	name: string;
	windowCount: number;
	attached: boolean;
	workingDir: string;
	windows: TmuxWindow[];
	detectedProcess: string | null;
	multipleAgents: boolean;
}

// Known coding agent processes (ordered by priority - claude first)
const CODING_AGENTS = [
	'claude',
	'opencode',
	'aider',
	'cursor',
	'copilot',
	'gemini',
	'codex',
];

// TmuxService interface
export interface TmuxService {
	readonly isAvailable: Effect.Effect<boolean, never>;
	readonly listSessions: Effect.Effect<TmuxSession[], TmuxError>;
	readonly getSessionWindows: (
		sessionName: string,
	) => Effect.Effect<TmuxWindow[], TmuxError>;
	readonly detectCodingAgent: (
		sessionName: string,
	) => Effect.Effect<string | null, TmuxError>;
	readonly sendToSession: (
		sessionName: string,
		text: string,
	) => Effect.Effect<void, TmuxSendError | TmuxSessionNotFoundError>;
	readonly sendComment: (
		sessionName: string,
		filePath: string,
		lineStart: number | null,
		content: string,
	) => Effect.Effect<void, TmuxSendError | TmuxSessionNotFoundError>;
	readonly sendComments: (
		sessionName: string,
		comments: Array<{
			file_path: string;
			line_start: number | null;
			content: string;
		}>,
	) => Effect.Effect<void, TmuxSendError | TmuxSessionNotFoundError>;
	readonly formatComment: (
		filePath: string,
		lineStart: number | null,
		content: string,
	) => string;
	readonly formatComments: (
		comments: Array<{
			file_path: string;
			line_start: number | null;
			content: string;
		}>,
	) => string;
	readonly getWindowsForRepoPath: (
		windows: TmuxWindow[],
		repoPath: string,
	) => TmuxWindow[];
}

export const TmuxService = Context.GenericTag<TmuxService>('TmuxService');

// Helper to run a command and get stdout
const runCommand = (cmd: string) =>
	Effect.tryPromise({
		try: async () => {
			const { stdout } = await execAsync(cmd);
			return stdout;
		},
		catch: (error) => error,
	});

// Detect agent by checking process tree under a PID
const detectAgentInProcessTree = (pid: string) =>
	Effect.gen(function* () {
		// Get all child processes and their commands
		const childProcesses = yield* runCommand(
			`pgrep -P ${pid} 2>/dev/null | xargs -I{} ps -p {} -o comm= 2>/dev/null || true`,
		).pipe(Effect.catchAll(() => Effect.succeed('')));

		const processes = (childProcesses as string).trim().toLowerCase();
		for (const agent of CODING_AGENTS) {
			if (processes.includes(agent)) {
				return agent;
			}
		}

		// Also check grandchildren (for deeply nested processes)
		const childPids = yield* runCommand(
			`pgrep -P ${pid} 2>/dev/null || true`,
		).pipe(Effect.catchAll(() => Effect.succeed('')));

		for (const childPid of (childPids as string).trim().split('\n')) {
			if (!childPid) continue;
			const grandchildOutput = yield* runCommand(
				`pgrep -P ${childPid} 2>/dev/null | xargs -I{} ps -p {} -o comm= 2>/dev/null || true`,
			).pipe(Effect.catchAll(() => Effect.succeed('')));

			const grandchildProcesses = (grandchildOutput as string)
				.trim()
				.toLowerCase();
			for (const agent of CODING_AGENTS) {
				if (grandchildProcesses.includes(agent)) {
					return agent;
				}
			}
		}

		return null;
	}).pipe(Effect.withSpan('tmux.detectAgentInProcessTree'));

// Implementation
const makeTmuxService = (): TmuxService => {
	const formatComment = (
		filePath: string,
		lineStart: number | null,
		content: string,
	): string => {
		const lineInfo = lineStart ? ` Line ${lineStart}` : '';
		return `[${filePath}${lineInfo}]\n${content}`;
	};

	const formatComments = (
		comments: Array<{
			file_path: string;
			line_start: number | null;
			content: string;
		}>,
	): string => {
		return comments
			.map((c) => formatComment(c.file_path, c.line_start, c.content))
			.join('\n\n---\n\n');
	};

	const getWindowsForRepoPath = (
		windows: TmuxWindow[],
		repoPath: string,
	): TmuxWindow[] => {
		const normalizedPath = repoPath.replace(/\/$/, '');
		return windows.filter(
			(w) =>
				w.paneCurrentPath.replace(/\/$/, '') === normalizedPath ||
				w.paneCurrentPath
					.replace(/\/$/, '')
					.startsWith(normalizedPath + '/'),
		);
	};

	const getSessionWindows = (
		sessionName: string,
	): Effect.Effect<TmuxWindow[], TmuxError> =>
		Effect.gen(function* () {
			const stdout = yield* runCommand(
				`tmux list-panes -t "${sessionName}" -s -F "#{window_index}|#{window_name}|#{pane_current_path}|#{pane_current_command}|#{pane_pid}" 2>/dev/null`,
			).pipe(
				Effect.mapError(
					(error) =>
						new TmuxError({
							message: `Failed to get windows for session ${sessionName}`,
							cause: error,
						}),
				),
			);

			const windowMap = new Map<number, TmuxWindow>();

			for (const line of (stdout as string).trim().split('\n')) {
				if (!line) continue;
				const [
					windowIndexStr,
					windowName,
					paneCurrentPath,
					paneCurrentCommand,
					panePid,
				] = line.split('|');
				const windowIndex = parseInt(windowIndexStr, 10);

				const existing = windowMap.get(windowIndex);

				// First try to detect agent from command name
				const lowerCmd = paneCurrentCommand.toLowerCase();
				let detectedAgent: string | null = null;
				for (const agent of CODING_AGENTS) {
					if (lowerCmd.includes(agent)) {
						detectedAgent = agent;
						break;
					}
				}

				// If no agent found in command name, check process tree
				if (!detectedAgent && panePid) {
					detectedAgent = yield* detectAgentInProcessTree(
						panePid,
					).pipe(Effect.catchAll(() => Effect.succeed(null)));
				}

				if (existing) {
					if (detectedAgent && !existing.detectedAgent) {
						existing.detectedAgent = detectedAgent;
						existing.paneCurrentPath =
							paneCurrentPath || existing.paneCurrentPath;
						existing.paneCurrentCommand =
							paneCurrentCommand || existing.paneCurrentCommand;
					}
				} else {
					windowMap.set(windowIndex, {
						sessionName,
						windowIndex,
						windowName,
						paneCurrentPath: paneCurrentPath || '',
						paneCurrentCommand: paneCurrentCommand || '',
						detectedAgent,
					});
				}
			}

			return Array.from(windowMap.values());
		}).pipe(Effect.withSpan('tmux.getSessionWindows'));

	const listSessions: Effect.Effect<TmuxSession[], TmuxError> = Effect.gen(
		function* () {
			const stdout = yield* runCommand(
				'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{pane_current_path}" 2>/dev/null',
			).pipe(
				Effect.mapError(
					(error) =>
						new TmuxError({
							message: 'Failed to list tmux sessions',
							cause: error,
						}),
				),
			);

			const sessions: TmuxSession[] = [];

			for (const line of (stdout as string).trim().split('\n')) {
				if (!line) continue;
				const [name, windowCount, attached, workingDir] =
					line.split('|');

				const windows = yield* getSessionWindows(name).pipe(
					Effect.catchAll(() => Effect.succeed([] as TmuxWindow[])),
				);

				const agentWindows = windows.filter(
					(w) => w.detectedAgent !== null,
				);
				const multipleAgents = agentWindows.length > 1;

				let detectedProcess: string | null = null;
				if (agentWindows.length > 0) {
					agentWindows.sort((a, b) => {
						const aIdx = CODING_AGENTS.indexOf(a.detectedAgent!);
						const bIdx = CODING_AGENTS.indexOf(b.detectedAgent!);
						return aIdx - bIdx;
					});
					detectedProcess = agentWindows[0].detectedAgent;
				}

				sessions.push({
					name,
					windowCount: parseInt(windowCount, 10),
					attached: attached === '1',
					workingDir: workingDir || '',
					windows,
					detectedProcess,
					multipleAgents,
				});
			}

			return sessions;
		},
	).pipe(Effect.withSpan('tmux.listSessions'));

	const sendToSession = (
		sessionName: string,
		text: string,
	): Effect.Effect<void, TmuxSendError | TmuxSessionNotFoundError> =>
		Effect.gen(function* () {
			yield* Effect.logDebug(`Sending to session: ${sessionName}`);

			// Use load-buffer and paste-buffer for reliable text sending
			yield* runCommand(
				`tmux load-buffer -b pr-reviewer - <<'EOF'\n${text}\nEOF`,
			).pipe(
				Effect.mapError(
					(error) =>
						new TmuxSendError({
							session: sessionName,
							cause: error,
						}),
				),
			);

			yield* runCommand(
				`tmux paste-buffer -b pr-reviewer -t "${sessionName}"`,
			).pipe(
				Effect.mapError(
					(error) =>
						new TmuxSendError({
							session: sessionName,
							cause: error,
						}),
				),
			);

			// Clean up buffer
			yield* runCommand('tmux delete-buffer -b pr-reviewer').pipe(
				Effect.catchAll(() => Effect.succeed('')),
			);

			// Press Enter to submit
			yield* runCommand(`tmux send-keys -t "${sessionName}" Enter`).pipe(
				Effect.mapError(
					(error) =>
						new TmuxSendError({
							session: sessionName,
							cause: error,
						}),
				),
			);

			yield* Effect.logInfo(`Sent message to session: ${sessionName}`);
		}).pipe(Effect.withSpan('tmux.sendToSession'));

	return {
		isAvailable: Effect.sync(() => {
			try {
				execSync('which tmux', { stdio: 'ignore' });
				return true;
			} catch {
				return false;
			}
		}).pipe(Effect.withSpan('tmux.isAvailable')),

		listSessions,
		getSessionWindows,

		detectCodingAgent: (sessionName: string) =>
			Effect.gen(function* () {
				const windows = yield* getSessionWindows(sessionName);
				const agentWindow = windows.find(
					(w) => w.detectedAgent !== null,
				);
				return agentWindow?.detectedAgent ?? null;
			}).pipe(Effect.withSpan('tmux.detectCodingAgent')),

		sendToSession,

		formatComment,
		formatComments,

		sendComment: (
			sessionName: string,
			filePath: string,
			lineStart: number | null,
			content: string,
		) =>
			Effect.gen(function* () {
				const formatted = formatComment(filePath, lineStart, content);
				yield* sendToSession(sessionName, formatted);
			}).pipe(Effect.withSpan('tmux.sendComment')),

		sendComments: (
			sessionName: string,
			comments: Array<{
				file_path: string;
				line_start: number | null;
				content: string;
			}>,
		) =>
			Effect.gen(function* () {
				const formatted = formatComments(comments);
				yield* sendToSession(sessionName, formatted);
			}).pipe(Effect.withSpan('tmux.sendComments')),

		getWindowsForRepoPath,
	};
};

// Live layer
export const TmuxServiceLive = Layer.succeed(TmuxService, makeTmuxService());
