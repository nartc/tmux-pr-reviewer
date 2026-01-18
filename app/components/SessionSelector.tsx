import {
	Badge,
	DropdownMenu,
	IconButton,
	Text,
	Tooltip,
} from '@radix-ui/themes';
import { useCallback, useEffect, useId, useState } from 'react';
import {
	VscBeaker,
	VscCircleFilled,
	VscRefresh,
	VscTerminal,
	VscWarning,
} from 'react-icons/vsc';
import { useAsyncState } from '../lib/async-state';
import { useAsyncAction } from '../lib/use-async-action';
import type { TmuxSession, TmuxWindow } from '../services/tmux.service';

interface SessionSelectorProps {
	selectedSession: string | null;
	onSelectSession: (sessionName: string) => void;
	repoPath?: string;
}

// Agent icons mapping
const agentIcons: Record<string, string> = {
	claude: 'C',
	opencode: 'O',
	aider: 'A',
	cursor: 'Cu',
	copilot: 'Co',
	gemini: 'G',
	codex: 'Cx',
};

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

			// Filter sessions by repo path if provided
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
							const matchingWindows =
								s.windows?.filter(windowMatchesPath) || [];
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
								return null;
							}

							const agentWindowsInPath = matchingWindows.filter(
								(w) => w.detectedAgent !== null,
							);

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

							return { ...s, detectedProcess, multipleAgents };
						})
						.filter((s): s is TmuxSession => s !== null);

				allSessions = filterAndRecalculate(allSessions);
				agentSessions = allSessions.filter(
					(s) => s.detectedProcess !== null,
				);
			}

			setSessions(allSessions);
			setCodingAgentSessions(agentSessions);

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
		const interval = setInterval(fetchSessions, 30000);
		return () => clearInterval(interval);
	}, [fetchSessions]);

	const selectedSessionData = sessions.find(
		(s) => s.name === selectedSession,
	);

	const { submit: sendTest, isPending: testPending } = useAsyncAction({
		successMessage: 'Test message sent!',
		errorMessage: 'Failed to send test message',
	});

	const handleTestSession = () => {
		if (!selectedSession) return;

		const formData = new FormData();
		formData.append('intent', 'test');
		formData.append('sessionName', selectedSession);

		sendTest(formData, { method: 'POST', action: '/api/sessions' });
	};

	if (!available) {
		return (
			<div
				className="flex items-center gap-2 px-3 py-2 text-sm rounded-md"
				style={{
					backgroundColor: 'rgba(245, 158, 11, 0.1)',
					color: 'var(--color-warning-amber)',
				}}
			>
				<VscWarning aria-hidden="true" />
				<Text size="2">tmux not available</Text>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<button
						className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors min-w-[180px] ${
							selectedSessionData?.multipleAgents
								? 'ring-2'
								: ''
						}`}
						style={{
							backgroundColor: 'var(--color-surface)',
							borderColor: selectedSessionData?.multipleAgents
								? 'var(--color-warning-amber)'
								: 'var(--color-border)',
							border: '1px solid var(--color-border)',
							...(selectedSessionData?.multipleAgents && {
								borderColor: 'var(--color-warning-amber)',
								boxShadow: `0 0 0 2px rgba(245, 158, 11, 0.2)`,
							}),
						}}
						disabled={loading}
						aria-label={
							loading
								? 'Loading sessions'
								: selectedSessionData
									? `Selected session: ${selectedSessionData.name}`
									: 'Select a tmux session'
						}
					>
						{/* Status indicator */}
						<VscCircleFilled
							className={`w-2 h-2 shrink-0 ${loading ? 'animate-pulse-dot' : ''}`}
							style={{
								color: selectedSessionData
									? 'var(--color-success-green)'
									: 'var(--color-text-muted)',
							}}
						/>

						<VscTerminal
							className="w-4 h-4 shrink-0"
							style={{ color: 'var(--color-text-muted)' }}
							aria-hidden="true"
						/>
						<span
							className="flex-1 text-left truncate"
							style={{ color: 'var(--color-text-primary)' }}
						>
							{loading
								? 'Loading...'
								: selectedSessionData
									? selectedSessionData.name
									: 'Select session'}
						</span>
						{selectedSessionData?.multipleAgents && (
							<Badge color="amber" size="1">
								Multi
							</Badge>
						)}
						{selectedSessionData?.detectedProcess &&
							!selectedSessionData?.multipleAgents && (
								<Badge color="green" size="1">
									{agentIcons[
										selectedSessionData.detectedProcess
									] || selectedSessionData.detectedProcess}
								</Badge>
							)}
					</button>
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="start" sideOffset={5}>
					{codingAgentSessions.length > 0 && (
						<>
							<DropdownMenu.Label>
								Coding Agents
							</DropdownMenu.Label>
							{codingAgentSessions.map((session) => (
								<DropdownMenu.Item
									key={session.name}
									onSelect={() =>
										onSelectSession(session.name)
									}
								>
									<div className="flex items-center justify-between w-full gap-2">
										<div className="flex items-center gap-2 min-w-0">
											<VscCircleFilled
												className="w-2 h-2 shrink-0"
												style={{
													color: 'var(--color-success-green)',
												}}
											/>
											<div className="min-w-0">
												<Text
													size="2"
													weight="medium"
													className="truncate block"
												>
													{session.name}
												</Text>
												<Text
													size="1"
													className="truncate block"
													style={{
														color: 'var(--color-text-muted)',
													}}
												>
													{session.workingDir}
												</Text>
											</div>
										</div>
										<Badge color="green" size="1">
											{agentIcons[
												session.detectedProcess!
											] || session.detectedProcess}
										</Badge>
									</div>
								</DropdownMenu.Item>
							))}
							<DropdownMenu.Separator />
						</>
					)}

					<DropdownMenu.Label>All Sessions</DropdownMenu.Label>
					{sessions.length === 0 ? (
						<div className="px-2 py-3 text-center">
							<Text
								size="2"
								style={{ color: 'var(--color-text-muted)' }}
							>
								No sessions found
							</Text>
						</div>
					) : (
						sessions
							.filter((s) => !s.detectedProcess)
							.map((session) => (
								<DropdownMenu.Item
									key={session.name}
									onSelect={() =>
										onSelectSession(session.name)
									}
								>
									<div className="flex items-center gap-2 min-w-0">
										<VscCircleFilled
											className="w-2 h-2 shrink-0"
											style={{
												color: 'var(--color-text-muted)',
											}}
										/>
										<div className="min-w-0">
											<Text
												size="2"
												weight="medium"
												className="truncate block"
											>
												{session.name}
											</Text>
											<Text
												size="1"
												className="truncate block"
												style={{
													color: 'var(--color-text-muted)',
												}}
											>
												{session.workingDir}
											</Text>
										</div>
									</div>
								</DropdownMenu.Item>
							))
					)}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Tooltip content="Refresh sessions">
				<IconButton
					variant="ghost"
					size="1"
					onClick={fetchSessions}
					disabled={loading}
					aria-label="Refresh sessions"
					className="btn-press"
				>
					<VscRefresh
						className={loading ? 'animate-spin' : ''}
						aria-hidden="true"
					/>
				</IconButton>
			</Tooltip>

			<Tooltip content="Test session">
				<IconButton
					variant="ghost"
					size="1"
					color="amber"
					onClick={handleTestSession}
					disabled={!selectedSession || testPending}
					aria-label="Test session"
					className="btn-press"
				>
					<VscBeaker
						className={testPending ? 'animate-pulse' : ''}
						aria-hidden="true"
					/>
				</IconButton>
			</Tooltip>
		</div>
	);
}
