import { Button, Checkbox, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { VscChevronDown, VscChevronRight, VscSend } from 'react-icons/vsc';
import { useAsyncAction } from '../lib/use-async-action';
import type { Comment } from '../services/comment.service';
import { CommentCard } from './CommentCard';
import { SessionSelector } from './SessionSelector';

interface CommentQueueProps {
	sessionId: string;
	queuedComments: Comment[];
	stagedComments: Comment[];
	sentComments: Comment[];
	selectedTmuxSession: string | null;
	onSelectTmuxSession: (sessionName: string) => void;
	onSendNow?: (comment: Comment) => void;
	onSendAllStaged?: () => void;
	repoPath?: string;
}

export function CommentQueue({
	sessionId,
	queuedComments,
	stagedComments,
	sentComments,
	selectedTmuxSession,
	onSelectTmuxSession,
	onSendNow,
	onSendAllStaged,
	repoPath,
}: CommentQueueProps) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [queueExpanded, setQueueExpanded] = useState(true);
	const [stagedExpanded, setStagedExpanded] = useState(true);
	const [sentExpanded, setSentExpanded] = useState(true);

	const { submit, isPending: isStaging } = useAsyncAction({
		successMessage: 'Comments staged',
		onSuccess: () => setSelectedIds(new Set()),
	});

	const toggleSelect = (id: string) => {
		const newSelected = new Set(selectedIds);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		setSelectedIds(newSelected);
	};

	const selectAll = () => {
		if (selectedIds.size === queuedComments.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(queuedComments.map((c) => c.id)));
		}
	};

	const handleStageSelected = () => {
		if (selectedIds.size === 0) return;

		const formData = new FormData();
		formData.append('intent', 'stage');
		selectedIds.forEach((id) => formData.append('ids', id));

		submit(formData, { method: 'POST', action: '/api/comments' });
	};

	return (
		<div className="h-full flex flex-col">
			{/* Session Selector */}
			<div className="p-4 border-b border-gray-200 dark:border-gray-700">
				<Text
					size="1"
					weight="bold"
					color="gray"
					className="mb-2 block"
				>
					Target Session
				</Text>
				<SessionSelector
					selectedSession={selectedTmuxSession}
					onSelectSession={onSelectTmuxSession}
					repoPath={repoPath}
				/>
			</div>

			{/* Queued Section */}
			<div className="border-b border-gray-200 dark:border-gray-700">
				<button
					onClick={() => setQueueExpanded(!queueExpanded)}
					className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
					aria-expanded={queueExpanded}
					aria-controls="queued-comments-section"
				>
					<div className="flex items-center gap-2">
						{queueExpanded ? (
							<VscChevronDown aria-hidden="true" />
						) : (
							<VscChevronRight aria-hidden="true" />
						)}
						<Text size="2" weight="bold">
							Queued
						</Text>
						<Text size="1" color="gray">
							({queuedComments.length})
						</Text>
					</div>
				</button>

				{queueExpanded && (
					<div id="queued-comments-section" className="px-4 pb-4">
						{queuedComments.length === 0 ? (
							<Text size="2" color="gray" className="py-2">
								No queued comments
							</Text>
						) : (
							<>
								{/* Selection controls */}
								<div className="flex items-center justify-between mb-3">
									<Button
										variant="ghost"
										size="1"
										onClick={selectAll}
									>
										{selectedIds.size ===
										queuedComments.length
											? 'Deselect all'
											: 'Select all'}
									</Button>
									{selectedIds.size > 0 && (
										<div className="flex items-center gap-2">
											<Button
												variant="soft"
												size="1"
												onClick={handleStageSelected}
												disabled={isStaging}
											>
												Stage Raw
											</Button>
											<Button
												size="1"
												onClick={handleStageSelected}
												disabled={isStaging}
											>
												Process & Stage
											</Button>
										</div>
									)}
								</div>

								{/* Comment list */}
								<div className="space-y-2">
									{queuedComments.map((comment) => (
										<div
											key={comment.id}
											className="flex items-start gap-2"
										>
											<Checkbox
												checked={selectedIds.has(
													comment.id,
												)}
												onCheckedChange={() =>
													toggleSelect(comment.id)
												}
												aria-label={`Select comment for ${comment.file_path}`}
												className="mt-3"
											/>
											<div className="flex-1 min-w-0">
												<CommentCard
													comment={comment}
													onSendNow={onSendNow}
													showSendButton={
														!!selectedTmuxSession
													}
												/>
											</div>
										</div>
									))}
								</div>
							</>
						)}
					</div>
				)}
			</div>

			{/* Staged Section */}
			<div className="border-b border-gray-200 dark:border-gray-700">
				<button
					onClick={() => setStagedExpanded(!stagedExpanded)}
					className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
					aria-expanded={stagedExpanded}
					aria-controls="staged-comments-section"
				>
					<div className="flex items-center gap-2">
						{stagedExpanded ? (
							<VscChevronDown aria-hidden="true" />
						) : (
							<VscChevronRight aria-hidden="true" />
						)}
						<Text size="2" weight="bold">
							Staged
						</Text>
						<Text size="1" color="gray">
							({stagedComments.length})
						</Text>
					</div>
				</button>

				{stagedExpanded && (
					<div id="staged-comments-section" className="px-4 pb-4">
						{stagedComments.length === 0 ? (
							<Text size="2" color="gray" className="py-2">
								No staged comments
							</Text>
						) : (
							<>
								{/* Send all button */}
								<div className="mb-3">
									<Button
										size="2"
										color="green"
										className="w-full"
										onClick={onSendAllStaged}
										disabled={!selectedTmuxSession}
									>
										<VscSend aria-hidden="true" />
										Send All Staged ({stagedComments.length}
										)
									</Button>
									{!selectedTmuxSession && (
										<Text
											size="1"
											color="gray"
											className="mt-1 text-center block"
										>
											Select a tmux session first
										</Text>
									)}
								</div>

								{/* Staged comment list */}
								<div className="space-y-2">
									{stagedComments.map((comment) => (
										<CommentCard
											key={comment.id}
											comment={comment}
										/>
									))}
								</div>
							</>
						)}
					</div>
				)}
			</div>

			{/* Sent Section */}
			<div className="flex-1 overflow-y-auto">
				<button
					onClick={() => setSentExpanded(!sentExpanded)}
					className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
					aria-expanded={sentExpanded}
					aria-controls="sent-comments-section"
				>
					<div className="flex items-center gap-2">
						{sentExpanded ? (
							<VscChevronDown aria-hidden="true" />
						) : (
							<VscChevronRight aria-hidden="true" />
						)}
						<Text size="2" weight="bold">
							Sent
						</Text>
						<Text size="1" color="gray">
							({sentComments.length})
						</Text>
					</div>
				</button>

				{sentExpanded && (
					<div id="sent-comments-section" className="px-4 pb-4">
						{sentComments.length === 0 ? (
							<Text size="2" color="gray" className="py-2">
								No sent comments
							</Text>
						) : (
							<div className="space-y-2">
								{sentComments.map((comment) => (
									<CommentCard
										key={comment.id}
										comment={comment}
										showSentAt
									/>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
