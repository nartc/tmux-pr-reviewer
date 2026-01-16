import { Button, Dialog, Text, TextArea } from '@radix-ui/themes';
import { useState } from 'react';
import {
	VscCheck,
	VscChevronDown,
	VscChevronRight,
	VscClose,
} from 'react-icons/vsc';
import type { Comment } from '../services/comment.service';

interface ProcessPreviewProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	processedText: string;
	originalComments: Comment[];
	onConfirm: (processedText: string) => void;
	onCancel: () => void;
}

export function ProcessPreview({
	open,
	onOpenChange,
	processedText,
	originalComments,
	onConfirm,
	onCancel,
}: ProcessPreviewProps) {
	const [editedText, setEditedText] = useState(processedText);
	const [showOriginal, setShowOriginal] = useState(false);

	const handleConfirm = () => {
		onConfirm(editedText);
		onOpenChange(false);
	};

	const handleCancel = () => {
		onCancel();
		onOpenChange(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Content
				maxWidth="650px"
				className="max-h-[80vh] flex flex-col"
			>
				<Dialog.Title>Review Processed Comments</Dialog.Title>

				<div className="flex-1 overflow-y-auto space-y-4 mt-4">
					{/* Processed output */}
					<div>
						<Text size="2" weight="medium" className="mb-2 block">
							Processed Output (editable)
						</Text>
						<TextArea
							value={editedText}
							onChange={(e) => setEditedText(e.target.value)}
							size="2"
							rows={10}
							className="font-mono"
						/>
					</div>

					{/* Original comments (collapsible) */}
					<div className="border border-gray-200 dark:border-gray-700 rounded">
						<button
							onClick={() => setShowOriginal(!showOriginal)}
							className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
							aria-expanded={showOriginal}
							aria-controls="original-comments-section"
						>
							{showOriginal ? (
								<VscChevronDown aria-hidden="true" />
							) : (
								<VscChevronRight aria-hidden="true" />
							)}
							<Text size="2" color="gray">
								Original Comments ({originalComments.length})
							</Text>
						</button>
						{showOriginal && (
							<div
								id="original-comments-section"
								className="px-3 pb-3 space-y-2"
							>
								{originalComments.map((comment) => (
									<div
										key={comment.id}
										className="p-2 bg-gray-50 dark:bg-gray-800 rounded"
									>
										<Text
											size="1"
											color="gray"
											className="mb-1 block"
										>
											{comment.file_path}
											{comment.line_start &&
												`:${comment.line_start}`}
										</Text>
										<Text
											size="2"
											className="whitespace-pre-wrap"
										>
											{comment.content}
										</Text>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
					<Button variant="soft" color="gray" onClick={handleCancel}>
						<VscClose aria-hidden="true" />
						Cancel
					</Button>
					<Button onClick={handleConfirm}>
						<VscCheck aria-hidden="true" />
						Stage Processed
					</Button>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	);
}
