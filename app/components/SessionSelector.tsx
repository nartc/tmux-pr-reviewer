import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useCallback, useEffect, useId, useState } from 'react';
import { VscRefresh, VscTerminal, VscWarning } from 'react-icons/vsc';
import { useAsyncState } from '../lib/async-state';
import type { TmuxSession, TmuxWindow } from '../services/tmux.service';

interface SessionSelectorProps {
	selectedSession: string | null;
	onSelectSession: (sessionName: string) => void;
	repoPath?: string;
}

export function SessionSelector({
	selectedSession,
	onSelectSession,
	repoPath,
}: SessionSelectorProps) {
	const [sessions, setSessions] = useState<TmuxSession[]>([]);
	const [codingAgentSessions, setCodingAgentSessions] = useState<
		TmuxSession[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [available, setAvailable] = useState(true);
	const { startOperation, endOperation } = useAsyncState();
	const operationId = useId();

	const fetchSessions = useCallback(async () => {
		setLoading(true);
		startOperation(operationId);
		try {
			const res = await fetch('/api/sessions');
			const data = await res.json();
			setAvailable(data.available);

			let allSessions: TmuxSession[] = data.sessions || [];
			let agentSessions: TmuxSession[] = data.codingAgentSessions || [];

			// Filter sessions by repo path if provided (check windows for path match)
			// Also recalculate detectedProcess based only on matching windows
			if (repoPath) {
				const normalizedRepoPath = repoPath.replace(/\/$/, '');

				const windowMatchesPath = (w: TmuxWindow) =>
					w.paneCurrentPath.replace(/\/$/, '') ===
						normalizedRepoPath ||
					w.paneCurrentPath
						.replace(/\/$/, '')
						.startsWith(normalizedRepoPath + '/');

				const filterAndRecalculate = (
					sessions: TmuxSession[],
				): TmuxSession[] =>
					sessions
						.map((s) => {
							// Get windows that match the repo path
							const matchingWindows =
								s.windows?.filter(windowMatchesPath) || [];

							// Check if session matches (via windows or working dir)
							const sessionDirMatches =
								s.workingDir.replace(/\/$/, '') ===
									normalizedRepoPath ||
								s.workingDir
									.replace(/\/$/, '')
									.startsWith(normalizedRepoPath + '/');

							if (
								matchingWindows.length === 0 &&
								!sessionDirMatches
							) {
								return null; // Filter out this session
							}

							// Recalculate detectedProcess based only on matching windows
							const agentWindowsInPath = matchingWindows.filter(
								(w) => w.detectedAgent !== null,
							);

							// Sort by agent priority (claude first based on CODING_AGENTS order)
							const CODING_AGENTS = [
								'claude',
								'opencode',
								'aider',
								'cursor',
								'copilot',
								'gemini',
								'codex',
							];
							agentWindowsInPath.sort((a, b) => {
								const aIdx = CODING_AGENTS.indexOf(
									a.detectedAgent!,
								);
								const bIdx = CODING_AGENTS.indexOf(
									b.detectedAgent!,
								);
								return aIdx - bIdx;
							});

							const detectedProcess =
								agentWindowsInPath.length > 0
									? agentWindowsInPath[0].detectedAgent
									: null;
							const multipleAgents =
								agentWindowsInPath.length > 1;

							return {
								...s,
								detectedProcess,
								multipleAgents,
							};
						})
						.filter((s): s is TmuxSession => s !== null);

				allSessions = filterAndRecalculate(allSessions);
				// Recalculate agent sessions from filtered allSessions
				agentSessions = allSessions.filter(
					(s) => s.detectedProcess !== null,
				);
			}

			setSessions(allSessions);
			setCodingAgentSessions(agentSessions);

			// Auto-select first coding agent session if none selected
			// Don't auto-select if there are multiple agents (user should choose)
			if (!selectedSession) {
				const hasMultipleAgents = agentSessions.some(
					(s) => s.multipleAgents,
				);
				if (agentSessions.length > 0 && !hasMultipleAgents) {
					onSelectSession(agentSessions[0].name);
				} else if (
					allSessions.length > 0 &&
					agentSessions.length === 0
				) {
					onSelectSession(allSessions[0].name);
				}
			}
		} catch (error) {
			console.error('Failed to fetch sessions:', error);
			setAvailable(false);
		}
		setLoading(false);
		endOperation(operationId);
	}, [
		repoPath,
		selectedSession,
		onSelectSession,
		operationId,
		startOperation,
		endOperation,
	]);

	useEffect(() => {
		fetchSessions();
		// Refresh every 30 seconds
		const interval = setInterval(fetchSessions, 30000);
		return () => clearInterval(interval);
	}, [fetchSessions]);

	const selectedSessionData = sessions.find(
		(s) => s.name === selectedSession,
	);

	if (!available) {
		return (
			<div className="flex items-center gap-2 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded">
				<VscWarning className="w-4 h-4" aria-hidden="true" />
				<span>tmux not available</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<button
						className={`flex items-center gap-2 px-3 py-2 text-sm border rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-w-[200px] ${
							selectedSessionData?.multipleAgents
								? 'border-amber-500 ring-2 ring-amber-500/50'
								: 'border-gray-300 dark:border-gray-600'
						}`}
						disabled={loading}
					>
						<VscTerminal
							className="w-4 h-4 text-gray-400"
							aria-hidden="true"
						/>
						<span className="flex-1 text-left truncate">
							{loading
								? 'Loading...'
								: selectedSessionData
									? selectedSessionData.name
									: 'Select session'}
						</span>
						{selectedSessionData?.multipleAgents && (
							<span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
								Multiple agents
							</span>
						)}
						{selectedSessionData?.detectedProcess &&
							!selectedSessionData?.multipleAgents && (
								<span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
									{selectedSessionData.detectedProcess}
								</span>
							)}
					</button>
				</DropdownMenu.Trigger>

				<DropdownMenu.Portal>
					<DropdownMenu.Content
						className="min-w-62.5 bg-white dark:bg-gray-900 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 p-1 z-50"
						sideOffset={5}
						align="start"
					>
						{codingAgentSessions.length > 0 && (
							<>
								<DropdownMenu.Label className="px-2 py-1 text-xs text-gray-500 font-semibold">
									Coding Agents
								</DropdownMenu.Label>
								{codingAgentSessions.map((session) => (
									<DropdownMenu.Item
										key={session.name}
										className={`px-2 py-2 text-sm rounded cursor-pointer outline-none flex items-center justify-between ${
											selectedSession === session.name
												? 'bg-blue-50 dark:bg-blue-900/30'
												: 'hover:bg-gray-100 dark:hover:bg-gray-800'
										}`}
										onSelect={() =>
											onSelectSession(session.name)
										}
									>
										<div className="min-w-0">
											<div className="font-medium truncate">
												{session.name}
											</div>
											<div className="text-xs text-gray-500 truncate">
												{session.workingDir}
											</div>
										</div>
										<span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded shrink-0 ml-2">
											{session.detectedProcess}
										</span>
									</DropdownMenu.Item>
								))}
								<DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
							</>
						)}

						<DropdownMenu.Label className="px-2 py-1 text-xs text-gray-500 font-semibold">
							All Sessions
						</DropdownMenu.Label>
						{sessions.length === 0 ? (
							<div className="px-2 py-2 text-sm text-gray-500">
								No sessions found
							</div>
						) : (
							sessions
								.filter((s) => !s.detectedProcess)
								.map((session) => (
									<DropdownMenu.Item
										key={session.name}
										className={`px-2 py-2 text-sm rounded cursor-pointer outline-none ${
											selectedSession === session.name
												? 'bg-blue-50 dark:bg-blue-900/30'
												: 'hover:bg-gray-100 dark:hover:bg-gray-800'
										}`}
										onSelect={() =>
											onSelectSession(session.name)
										}
									>
										<div className="font-medium truncate">
											{session.name}
										</div>
										<div className="text-xs text-gray-500 truncate">
											{session.workingDir}
										</div>
									</DropdownMenu.Item>
								))
						)}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<button
				onClick={fetchSessions}
				disabled={loading}
				className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
				aria-label="Refresh sessions"
			>
				<VscRefresh
					className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
					aria-hidden="true"
				/>
			</button>
		</div>
	);
}
