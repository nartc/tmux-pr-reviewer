import { IconButton, Text, TextArea } from '@radix-ui/themes';
import { useState } from 'react';
import {
	VscCheck,
	VscClose,
	VscEdit,
	VscSend,
	VscTrash,
} from 'react-icons/vsc';
import { useAsyncAction } from '../lib/use-async-action';
import type { Comment } from '../services/comment.service';

interface CommentCardProps {
	comment: Comment;
	onSendNow?: (comment: Comment) => void;
	showSendButton?: boolean;
	showSentAt?: boolean;
}

export function CommentCard({
	comment,
	onSendNow,
	showSendButton = false,
	showSentAt = false,
}: CommentCardProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState(comment.content);

	const { submit: submitUpdate, isPending: isUpdating } = useAsyncAction({
		successMessage: 'Comment updated',
		onSuccess: () => setIsEditing(false),
	});

	const { submit: submitDelete, isPending: isDeleting } = useAsyncAction({
		successMessage: 'Comment deleted',
	});

	const handleSave = () => {
		submitUpdate(
			{ intent: 'update', id: comment.id, content: editContent },
			{ method: 'POST', action: '/api/comments' },
		);
	};

	const handleDelete = () => {
		submitDelete(
			{ intent: 'delete', id: comment.id },
			{ method: 'POST', action: '/api/comments' },
		);
	};

	const handleCancel = () => {
		setEditContent(comment.content);
		setIsEditing(false);
	};

	const fileName = comment.file_path.split('/').pop();
	const lineInfo = comment.line_start
		? comment.line_end && comment.line_end !== comment.line_start
			? `L${comment.line_start}-${comment.line_end}`
			: `L${comment.line_start}`
		: null;

	return (
		<div
			className={`border border-gray-200 dark:border-gray-700 rounded-lg p-3 ${
				isDeleting ? 'opacity-50' : ''
			}`}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-2">
				<div className="text-xs text-gray-500 truncate flex-1">
					<Text size="1" weight="medium">
						{fileName}
					</Text>
					{lineInfo && (
						<Text size="1" color="blue" className="ml-1">
							{lineInfo}
						</Text>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					{showSendButton && onSendNow && (
						<IconButton
							size="1"
							variant="ghost"
							onClick={() => onSendNow(comment)}
							aria-label="Send now"
						>
							<VscSend aria-hidden="true" />
						</IconButton>
					)}
					{!isEditing && (
						<>
							<IconButton
								size="1"
								variant="ghost"
								onClick={() => setIsEditing(true)}
								aria-label="Edit comment"
							>
								<VscEdit aria-hidden="true" />
							</IconButton>
							<IconButton
								size="1"
								variant="ghost"
								color="red"
								onClick={handleDelete}
								aria-label="Delete comment"
								disabled={isDeleting}
							>
								<VscTrash aria-hidden="true" />
							</IconButton>
						</>
					)}
				</div>
			</div>

			{/* Content */}
			{isEditing ? (
				<div className="space-y-2">
					<TextArea
						value={editContent}
						onChange={(e) => setEditContent(e.target.value)}
						size="1"
						rows={3}
						autoFocus
						aria-label="Edit comment text"
					/>
					<div className="flex justify-end gap-1">
						<IconButton
							size="1"
							variant="ghost"
							onClick={handleCancel}
							aria-label="Cancel editing"
						>
							<VscClose aria-hidden="true" />
						</IconButton>
						<IconButton
							size="1"
							variant="ghost"
							color="green"
							onClick={handleSave}
							aria-label="Save changes"
							disabled={isUpdating}
						>
							<VscCheck aria-hidden="true" />
						</IconButton>
					</div>
				</div>
			) : (
				<>
					<Text size="2" className="whitespace-pre-wrap">
						{comment.content}
					</Text>
					{showSentAt && comment.sent_at && (
						<Text size="1" color="gray" className="mt-2 block">
							Sent {new Date(comment.sent_at).toLocaleString()}
						</Text>
					)}
				</>
			)}
		</div>
	);
}
