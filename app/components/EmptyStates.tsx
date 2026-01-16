import { Button, Heading, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import {
	VscComment,
	VscDiff,
	VscRepo,
	VscSearch,
	VscTerminal,
} from 'react-icons/vsc';

interface EmptyStateProps {
	icon: ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<div className="text-gray-300 dark:text-gray-600 mb-4">{icon}</div>
			<Heading size="4" className="mb-1">
				{title}
			</Heading>
			{description && (
				<Text size="2" color="gray" className="max-w-sm mb-4">
					{description}
				</Text>
			)}
			{action}
		</div>
	);
}

export function EmptyRepos({ onAddRepo }: { onAddRepo?: () => void }) {
	return (
		<EmptyState
			icon={<VscRepo className="w-16 h-16" />}
			title="No repositories"
			description="Add a repository to start reviewing code changes."
			action={
				onAddRepo && <Button onClick={onAddRepo}>Add Repository</Button>
			}
		/>
	);
}

export function EmptyComments() {
	return (
		<EmptyState
			icon={<VscComment className="w-12 h-12" />}
			title="No comments yet"
			description="Click on a line in the diff to add a comment."
		/>
	);
}

export function EmptyQueuedComments() {
	return (
		<div className="text-center py-6">
			<VscComment className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
			<Text size="2" color="gray">
				No queued comments
			</Text>
		</div>
	);
}

export function EmptyStagedComments() {
	return (
		<div className="text-center py-6">
			<VscComment className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
			<Text size="2" color="gray">
				No staged comments
			</Text>
		</div>
	);
}

export function EmptyDiff({
	currentBranch,
	baseBranch,
}: {
	currentBranch: string;
	baseBranch: string;
}) {
	return (
		<EmptyState
			icon={<VscDiff className="w-16 h-16" />}
			title="No changes detected"
			description={`The branch "${currentBranch}" has no differences from "${baseBranch}".`}
		/>
	);
}

export function EmptyTmuxSessions() {
	return (
		<EmptyState
			icon={<VscTerminal className="w-12 h-12" />}
			title="No tmux sessions"
			description="Start a tmux session to send comments to your coding agent."
		/>
	);
}

export function EmptySearchResults({ query }: { query: string }) {
	return (
		<EmptyState
			icon={<VscSearch className="w-12 h-12" />}
			title="No results found"
			description={`No repositories match "${query}".`}
		/>
	);
}

export function NoChangesInFile({ fileName }: { fileName: string }) {
	return (
		<EmptyState
			icon={<VscDiff className="w-12 h-12" />}
			title="No changes in this file"
			description={`"${fileName}" has no modifications.`}
		/>
	);
}
