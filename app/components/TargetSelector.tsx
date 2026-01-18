import {
	Badge,
	DropdownMenu,
	IconButton,
	Text,
	Tooltip,
} from '@radix-ui/themes';
import { useCallback, useEffect, useId, useState } from 'react';
import {
	VscCircleFilled,
	VscCopy,
	VscDebugDisconnect,
	VscRefresh,
	VscServer,
} from 'react-icons/vsc';
import { useAsyncState } from '../lib/async-state';
import type { CommentTarget } from '../services/transport.service';

interface TargetSelectorProps {
	selectedTarget: string | null;
	onSelectTarget: (targetId: string) => void;
	repoPath?: string;
}

// Format time ago
const formatTimeAgo = (dateString: string | undefined): string => {
	if (!dateString) return '';

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);

	if (diffSeconds < 60) {
		return `${diffSeconds}s ago`;
	}

	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	}

	const diffHours = Math.floor(diffMinutes / 60);
	return `${diffHours}h ago`;
};

export function TargetSelector({
	selectedTarget,
	onSelectTarget,
	repoPath,
}: TargetSelectorProps) {
	const [targets, setTargets] = useState<CommentTarget[]>([]);
	const [loading, setLoading] = useState(true);
	const [mcpClientCount, setMcpClientCount] = useState(0);
	const { startOperation, endOperation } = useAsyncState();
	const operationId = useId();

	const fetchTargets = useCallback(async () => {
		setLoading(true);
		startOperation(operationId);
		try {
			const res = await fetch('/api/targets');
			const data = await res.json();

			const allTargets: CommentTarget[] = data.targets || [];
			setTargets(allTargets);

			// Count MCP clients
			const mcpClients = allTargets.filter(
				(t) => t.type === 'mcp_client',
			);
			setMcpClientCount(mcpClients.length);

			// Auto-select first MCP client if available, otherwise clipboard
			if (!selectedTarget) {
				if (mcpClients.length > 0) {
					onSelectTarget(mcpClients[0].id);
				} else {
					const clipboard = allTargets.find(
						(t) => t.type === 'clipboard',
					);
					if (clipboard) {
						onSelectTarget(clipboard.id);
					}
				}
			}
		} catch (error) {
			console.error('Failed to fetch targets:', error);
			// Fallback to clipboard
			setTargets([
				{
					id: 'clipboard',
					type: 'clipboard',
					name: 'Copy to Clipboard',
					connected: true,
				},
			]);
			if (!selectedTarget) {
				onSelectTarget('clipboard');
			}
		}
		setLoading(false);
		endOperation(operationId);
	}, [
		selectedTarget,
		onSelectTarget,
		operationId,
		startOperation,
		endOperation,
	]);

	useEffect(() => {
		fetchTargets();
		// Poll every 10 seconds for MCP client updates
		const interval = setInterval(fetchTargets, 10000);
		return () => clearInterval(interval);
	}, [fetchTargets]);

	const selectedTargetData = targets.find((t) => t.id === selectedTarget);
	const mcpClients = targets.filter((t) => t.type === 'mcp_client');
	const clipboardTarget = targets.find((t) => t.type === 'clipboard');

	return (
		<div className="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<button
						className="flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors min-w-[200px]"
						style={{
							backgroundColor: 'var(--color-surface)',
							border: '1px solid var(--color-border)',
						}}
						disabled={loading}
						aria-label={
							loading
								? 'Loading targets'
								: selectedTargetData
									? `Selected target: ${selectedTargetData.name}`
									: 'Select a delivery target'
						}
					>
						{/* Status indicator */}
						<VscCircleFilled
							className={`w-2 h-2 shrink-0 ${loading ? 'animate-pulse-dot' : ''}`}
							style={{
								color:
									selectedTargetData?.type === 'mcp_client'
										? 'var(--color-success-green)'
										: 'var(--color-text-muted)',
							}}
						/>

						{/* Icon based on type */}
						{selectedTargetData?.type === 'mcp_client' ? (
							<VscServer
								className="w-4 h-4 shrink-0"
								style={{ color: 'var(--color-accent-blue)' }}
								aria-hidden="true"
							/>
						) : (
							<VscCopy
								className="w-4 h-4 shrink-0"
								style={{ color: 'var(--color-text-muted)' }}
								aria-hidden="true"
							/>
						)}

						<span
							className="flex-1 text-left truncate"
							style={{ color: 'var(--color-text-primary)' }}
						>
							{loading
								? 'Loading...'
								: selectedTargetData
									? selectedTargetData.name
									: 'Select target'}
						</span>

						{selectedTargetData?.type === 'mcp_client' &&
							selectedTargetData.lastSeen && (
								<Text
									size="1"
									style={{ color: 'var(--color-text-muted)' }}
								>
									{formatTimeAgo(
										selectedTargetData.lastSeen?.toISOString(),
									)}
								</Text>
							)}

						{selectedTargetData?.type === 'mcp_client' && (
							<Badge color="blue" size="1">
								MCP
							</Badge>
						)}
					</button>
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="start" sideOffset={5}>
					{/* MCP Clients Section */}
					{mcpClients.length > 0 && (
						<>
							<DropdownMenu.Label>
								<div className="flex items-center gap-2">
									<VscServer
										className="w-3 h-3"
										style={{
											color: 'var(--color-accent-blue)',
										}}
									/>
									MCP Agents ({mcpClients.length})
								</div>
							</DropdownMenu.Label>
							{mcpClients.map((target) => (
								<DropdownMenu.Item
									key={target.id}
									onSelect={() => onSelectTarget(target.id)}
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
													{target.name}
												</Text>
												{target.workingDir && (
													<Text
														size="1"
														className="truncate block"
														style={{
															color: 'var(--color-text-muted)',
														}}
													>
														{target.workingDir}
													</Text>
												)}
											</div>
										</div>
										{target.lastSeen && (
											<Text
												size="1"
												style={{
													color: 'var(--color-text-muted)',
												}}
											>
												{formatTimeAgo(
													target.lastSeen?.toISOString(),
												)}
											</Text>
										)}
									</div>
								</DropdownMenu.Item>
							))}
							<DropdownMenu.Separator />
						</>
					)}

					{/* No MCP clients message */}
					{mcpClients.length === 0 && (
						<>
							<div className="px-3 py-2">
								<div className="flex items-center gap-2 text-amber-500">
									<VscDebugDisconnect className="w-4 h-4" />
									<Text size="2">
										No MCP agents connected
									</Text>
								</div>
								<Text
									size="1"
									className="mt-1 block"
									style={{ color: 'var(--color-text-muted)' }}
								>
									Run <code>pnpm setup:mcp</code> to configure
								</Text>
							</div>
							<DropdownMenu.Separator />
						</>
					)}

					{/* Clipboard fallback */}
					{clipboardTarget && (
						<>
							<DropdownMenu.Label>Fallback</DropdownMenu.Label>
							<DropdownMenu.Item
								onSelect={() =>
									onSelectTarget(clipboardTarget.id)
								}
							>
								<div className="flex items-center gap-2">
									<VscCopy
										className="w-4 h-4"
										style={{
											color: 'var(--color-text-muted)',
										}}
									/>
									<Text size="2">Copy to Clipboard</Text>
								</div>
							</DropdownMenu.Item>
						</>
					)}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Tooltip content="Refresh targets">
				<IconButton
					variant="ghost"
					size="1"
					onClick={fetchTargets}
					disabled={loading}
					aria-label="Refresh targets"
					className="btn-press"
				>
					<VscRefresh
						className={loading ? 'animate-spin' : ''}
						aria-hidden="true"
					/>
				</IconButton>
			</Tooltip>
		</div>
	);
}
