import {
	Button,
	Checkbox,
	IconButton,
	Kbd,
	Text,
	TextArea,
	Tooltip,
} from '@radix-ui/themes';
import { useCallback, useReducer, useState } from 'react';
import {
	VscAdd,
	VscCheck,
	VscChevronDown,
	VscChevronRight,
	VscClose,
	VscInbox,
	VscLightbulb,
	VscSend,
} from 'react-icons/vsc';
import { useAsyncAction } from '../lib/use-async-action';
import type { Comment } from '../services/comment.service';
import { CommentCard } from './comment-card';

interface CommentQueueProps {
	sessionId: string;
	queuedComments: Comment[];
	stagedComments: Comment[];
	sentComments: Comment[];
	resolvedComments: Comment[];
	onSendNow?: (comment: Comment) => void;
	onSendAllStaged?: () => void;
	onProcessComments?: (commentIds: string[]) => Promise<string | null>;
}

interface CommentQueueState {
	selectedIds: Set<string>;
	queueExpanded: boolean;
	stagedExpanded: boolean;
	sentExpanded: boolean;
	resolvedExpanded: boolean;
	isProcessing: boolean;
	processedText: string | null;
}

type CommentQueueAction =
	| { type: 'SET_SELECTED_IDS'; payload: Set<string> }
	| { type: 'TOGGLE_QUEUE_EXPANDED' }
	| { type: 'TOGGLE_STAGED_EXPANDED' }
	| { type: 'TOGGLE_SENT_EXPANDED' }
	| { type: 'TOGGLE_RESOLVED_EXPANDED' }
	| { type: 'SET_IS_PROCESSING'; payload: boolean }
	| { type: 'SET_PROCESSED_TEXT'; payload: string | null }
	| { type: 'CLEAR_SELECTION' };

function commentQueueReducer(
	state: CommentQueueState,
	action: CommentQueueAction,
): CommentQueueState {
	switch (action.type) {
		case 'SET_SELECTED_IDS':
			return { ...state, selectedIds: action.payload };
		case 'TOGGLE_QUEUE_EXPANDED':
			return { ...state, queueExpanded: !state.queueExpanded };
		case 'TOGGLE_STAGED_EXPANDED':
			return { ...state, stagedExpanded: !state.stagedExpanded };
		case 'TOGGLE_SENT_EXPANDED':
			return { ...state, sentExpanded: !state.sentExpanded };
		case 'TOGGLE_RESOLVED_EXPANDED':
			return { ...state, resolvedExpanded: !state.resolvedExpanded };
		case 'SET_IS_PROCESSING':
			return { ...state, isProcessing: action.payload };
		case 'SET_PROCESSED_TEXT':
			return { ...state, processedText: action.payload };
		case 'CLEAR_SELECTION':
			return { ...state, selectedIds: new Set() };
		default:
			return state;
	}
}

const initialState: CommentQueueState = {
	selectedIds: new Set(),
	queueExpanded: true,
	stagedExpanded: true,
	sentExpanded: false,
	resolvedExpanded: false,
	isProcessing: false,
	processedText: null,
};

export function CommentQueue({
	sessionId,
	queuedComments,
	stagedComments,
	sentComments,
	resolvedComments,
	onSendNow,
	onSendAllStaged,
	onProcessComments,
}: CommentQueueProps) {
	const [state, dispatch] = useReducer(commentQueueReducer, initialState);
	const {
		selectedIds,
		queueExpanded,
		stagedExpanded,
		sentExpanded,
		resolvedExpanded,
		isProcessing,
		processedText,
	} = state;

	const [showGeneralForm, setShowGeneralForm] = useState(false);
	const [generalContent, setGeneralContent] = useState('');

	const { submit, isPending: isStaging } = useAsyncAction({
		successMessage: 'Comments staged',
		onSuccess: () => dispatch({ type: 'CLEAR_SELECTION' }),
	});

	const { submit: submitGeneral, isPending: isSubmittingGeneral } =
		useAsyncAction({
			successMessage: 'Comment queued',
			onSuccess: () => {
				setGeneralContent('');
				setShowGeneralForm(false);
			},
		});

	const handleAddGeneralComment = () => {
		if (!generalContent.trim()) return;

		const formData = new FormData();
		formData.append('intent', 'create');
		formData.append('sessionId', sessionId);
		formData.append('filePath', '[general]');
		formData.append('content', generalContent);

		submitGeneral(formData, { method: 'POST', action: '/api/comments' });
	};

	const handleSendGeneralNow = () => {
		if (!generalContent.trim() || !onSendNow) return;

		// Create a temporary comment object for send now
		const tempComment: Comment = {
			id: crypto.randomUUID(),
			session_id: sessionId,
			file_path: '[general]',
			content: generalContent,
			status: 'queued',
			created_at: new Date().toISOString(),
			line_start: null,
			line_end: null,
			side: null,
			sent_at: null,
			resolved_at: null,
			resolved_by: null,
			delivered_at: null,
		};

		onSendNow(tempComment);
		setGeneralContent('');
		setShowGeneralForm(false);
	};

	const handleGeneralKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			setShowGeneralForm(false);
			setGeneralContent('');
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			if (e.shiftKey && onSendNow) {
				handleSendGeneralNow();
			} else {
				handleAddGeneralComment();
			}
		}
	};

	const toggleSelect = (id: string) => {
		const newSelected = new Set(selectedIds);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		dispatch({ type: 'SET_SELECTED_IDS', payload: newSelected });
	};

	const selectAll = () => {
		if (selectedIds.size === queuedComments.length) {
			dispatch({ type: 'CLEAR_SELECTION' });
		} else {
			dispatch({
				type: 'SET_SELECTED_IDS',
				payload: new Set(queuedComments.map((c) => c.id)),
			});
		}
	};

	const handleStageSelected = () => {
		if (selectedIds.size === 0) return;

		const formData = new FormData();
		formData.append('intent', 'stage');
		selectedIds.forEach((id) => formData.append('ids', id));

		submit(formData, { method: 'POST', action: '/api/comments' });
	};

	const handleProcessStaged = useCallback(async () => {
		if (!onProcessComments || stagedComments.length === 0) return;

		dispatch({ type: 'SET_IS_PROCESSING', payload: true });
		dispatch({ type: 'SET_PROCESSED_TEXT', payload: null });

		try {
			const result = await onProcessComments(
				stagedComments.map((c) => c.id),
			);
			if (result) {
				dispatch({ type: 'SET_PROCESSED_TEXT', payload: result });
			}
		} finally {
			dispatch({ type: 'SET_IS_PROCESSING', payload: false });
		}
	}, [onProcessComments, stagedComments]);

	return (
		<div className="h-full flex flex-col">
			{/* Panel header */}
			<div className="panel-header justify-between">
				<span>Comments</span>
				<Tooltip
					content={showGeneralForm ? 'Close' : 'Add general comment'}
				>
					<IconButton
						size="1"
						variant="ghost"
						onClick={() => setShowGeneralForm(!showGeneralForm)}
						aria-label={
							showGeneralForm ? 'Close' : 'Add general comment'
						}
						className="btn-press"
					>
						{showGeneralForm ? (
							<VscClose aria-hidden="true" />
						) : (
							<VscAdd aria-hidden="true" />
						)}
					</IconButton>
				</Tooltip>
			</div>

			{/* General comment form */}
			{showGeneralForm && (
				<div className="px-4 pb-4 border-b border-theme animate-slide-in">
					<Text size="1" className="text-theme-secondary mb-2 block">
						General comment (not tied to a specific line)
					</Text>
					<TextArea
						value={generalContent}
						onChange={(e) => setGeneralContent(e.target.value)}
						onKeyDown={handleGeneralKeyDown}
						placeholder="Add a general comment..."
						size="2"
						rows={3}
						autoFocus
						aria-label="General comment text"
						className="bg-theme-bg border-theme"
					/>
					<div className="flex items-center justify-end mt-2 gap-2">
						<Button
							variant="ghost"
							size="1"
							onClick={() => {
								setShowGeneralForm(false);
								setGeneralContent('');
							}}
							className="btn-press"
						>
							Cancel <Kbd size="1">Esc</Kbd>
						</Button>
						{onSendNow && (
							<Button
								size="1"
								color="green"
								onClick={handleSendGeneralNow}
								disabled={
									!generalContent.trim() ||
									isSubmittingGeneral
								}
								className="btn-press"
							>
								Send Now <Kbd size="1">⌘⇧↵</Kbd>
							</Button>
						)}
						<Button
							size="1"
							onClick={handleAddGeneralComment}
							disabled={
								!generalContent.trim() || isSubmittingGeneral
							}
							className="btn-press"
						>
							Queue <Kbd size="1">⌘↵</Kbd>
						</Button>
					</div>
				</div>
			)}

			{/* Queued Section */}
			<div className="section-accordion section-queued">
				<button
					onClick={() => dispatch({ type: 'TOGGLE_QUEUE_EXPANDED' })}
					className="section-accordion-header"
					aria-expanded={queueExpanded}
					aria-controls="queued-comments-section"
				>
					<div className="flex items-center gap-2">
						{queueExpanded ? (
							<VscChevronDown className="w-4 h-4 text-theme-muted" />
						) : (
							<VscChevronRight className="w-4 h-4 text-theme-muted" />
						)}
						<Text size="2" weight="bold">
							Queued
						</Text>
						<span className="count-badge">
							{queuedComments.length}
						</span>
					</div>
				</button>

				{queueExpanded && (
					<div id="queued-comments-section" className="px-4 pb-4">
						{queuedComments.length === 0 ? (
							<div className="flex flex-col items-center py-6 gap-2">
								<VscInbox className="w-8 h-8 text-theme-muted" />
								<Text size="2" className="text-theme-muted">
									No queued comments
								</Text>
								<Text size="1" className="text-theme-muted">
									Add comments from the diff viewer
								</Text>
							</div>
						) : (
							<>
								{/* Selection controls */}
								<div className="flex items-center justify-between mb-3 pt-2">
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
												className="btn-press"
											>
												Stage ({selectedIds.size})
											</Button>
										</div>
									)}
								</div>

								{/* Comment list */}
								<div className="space-y-2">
									{queuedComments.map((comment) => (
										<div
											key={comment.id}
											className="flex items-start gap-2 animate-fade-in-up"
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
													showSendButton
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
			<div className="section-accordion section-staged">
				<button
					onClick={() => dispatch({ type: 'TOGGLE_STAGED_EXPANDED' })}
					className="section-accordion-header"
					aria-expanded={stagedExpanded}
					aria-controls="staged-comments-section"
				>
					<div className="flex items-center gap-2">
						{stagedExpanded ? (
							<VscChevronDown className="w-4 h-4 text-theme-muted" />
						) : (
							<VscChevronRight className="w-4 h-4 text-theme-muted" />
						)}
						<Text size="2" weight="bold">
							Staged
						</Text>
						<span className="count-badge">
							{stagedComments.length}
						</span>
					</div>
					{stagedComments.length > 0 && (
						<VscCheck className="w-4 h-4 text-zinc-500" />
					)}
				</button>

				{stagedExpanded && (
					<div id="staged-comments-section" className="px-4 pb-4">
						{stagedComments.length === 0 ? (
							<div className="flex flex-col items-center py-6 gap-2">
								<Text size="2" className="text-theme-muted">
									No staged comments
								</Text>
								<Text size="1" className="text-theme-muted">
									Select and stage comments from the queue
								</Text>
							</div>
						) : (
							<>
								{/* Action buttons */}
								<div className="mb-3 pt-2 flex items-center gap-2">
									<Button
										size="2"
										variant="soft"
										className="w-full btn-press"
										onClick={handleProcessStaged}
										disabled={isProcessing}
									>
										<VscLightbulb aria-hidden="true" />
										{isProcessing
											? 'Processing...'
											: 'Process with AI'}
									</Button>
									<Button
										size="2"
										className="w-full btn-press bg-theme-success"
										onClick={onSendAllStaged}
									>
										<VscSend aria-hidden="true" />
										Send All ({stagedComments.length})
									</Button>
								</div>

								{/* Processed text output */}
								{processedText && (
									<div className="mb-3 p-3 rounded-md text-sm whitespace-pre-wrap bg-theme-bg-secondary border border-theme">
										<Text
											size="1"
											weight="medium"
											className="mb-2 block text-theme-secondary"
										>
											AI Processed Output
										</Text>
										{processedText}
									</div>
								)}

								{/* Staged comment list */}
								<div className="space-y-2">
									{stagedComments.map((comment) => (
										<div
											key={comment.id}
											className="animate-fade-in-up"
										>
											<CommentCard comment={comment} />
										</div>
									))}
								</div>
							</>
						)}
					</div>
				)}
			</div>

			{/* Sent Section */}
			<div className="section-accordion section-sent">
				<button
					onClick={() => dispatch({ type: 'TOGGLE_SENT_EXPANDED' })}
					className="section-accordion-header"
					aria-expanded={sentExpanded}
					aria-controls="sent-comments-section"
				>
					<div className="flex items-center gap-2">
						{sentExpanded ? (
							<VscChevronDown className="w-4 h-4 text-theme-muted" />
						) : (
							<VscChevronRight className="w-4 h-4 text-theme-muted" />
						)}
						<Text size="2" weight="bold">
							Sent
						</Text>
						<span className="count-badge">
							{sentComments.length}
						</span>
					</div>
				</button>

				{sentExpanded && (
					<div id="sent-comments-section" className="px-4 pb-4">
						{sentComments.length === 0 ? (
							<div className="flex flex-col items-center py-6 gap-2">
								<Text size="2" className="text-theme-muted">
									No sent comments
								</Text>
								<Text size="1" className="text-theme-muted">
									Sent comments will appear here
								</Text>
							</div>
						) : (
							<div className="space-y-2 pt-2">
								{sentComments.map((comment) => (
									<div
										key={comment.id}
										className="opacity-75"
									>
										<CommentCard
											comment={comment}
											showSentAt
										/>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Resolved Section */}
			<div className="section-accordion section-resolved flex-1 overflow-y-auto">
				<button
					onClick={() =>
						dispatch({ type: 'TOGGLE_RESOLVED_EXPANDED' })
					}
					className="section-accordion-header sticky top-0 z-10 bg-theme-bg"
					aria-expanded={resolvedExpanded}
					aria-controls="resolved-comments-section"
				>
					<div className="flex items-center gap-2">
						{resolvedExpanded ? (
							<VscChevronDown className="w-4 h-4 text-theme-muted" />
						) : (
							<VscChevronRight className="w-4 h-4 text-theme-muted" />
						)}
						<Text size="2" weight="bold">
							Resolved
						</Text>
						<span className="count-badge">
							{resolvedComments.length}
						</span>
					</div>
				</button>

				{resolvedExpanded && (
					<div id="resolved-comments-section" className="px-4 pb-4">
						{resolvedComments.length === 0 ? (
							<div className="flex flex-col items-center py-6 gap-2">
								<Text size="2" className="text-theme-muted">
									No resolved comments
								</Text>
								<Text size="1" className="text-theme-muted">
									Comments resolved by agents appear here
								</Text>
							</div>
						) : (
							<div className="space-y-2 pt-2">
								{resolvedComments.map((comment) => (
									<div
										key={comment.id}
										className="opacity-50"
									>
										<CommentCard
											comment={comment}
											showResolvedAt
										/>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
