import type {
	AnnotationSide,
	ChangeTypes,
	FileDiffMetadata,
	Hunk,
	ParsedPatch,
} from '@pierre/diffs';
import { Badge, Button, DropdownMenu, Spinner, Text } from '@radix-ui/themes';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
	VscAdd,
	VscComment,
	VscDiffAdded,
	VscDiffModified,
	VscDiffRemoved,
	VscFile,
} from 'react-icons/vsc';
import { useTheme } from '../lib/theme.js';
import { InlineCommentForm } from './InlineCommentForm.js';

type DiffStyle = 'split' | 'unified';

interface SelectedLineRange {
	start: number;
	end: number;
	side?: AnnotationSide;
	endSide?: AnnotationSide;
}

interface CommentFormData {
	filePath: string;
	lineStart: number;
	lineEnd?: number;
	side: AnnotationSide;
}

interface DiffViewerProps {
	rawDiff: string;
	className?: string;
	diffStyle?: DiffStyle;
	selectedFile?: string | null;
	sessionId: string;
	onFileVisible?: (filePath: string) => void;
	onSendNow?: (
		content: string,
		filePath: string,
		lineStart: number,
		lineEnd?: number,
	) => void;
}

interface CommentAnnotation {
	type: 'comment-form';
	lineStart: number;
	lineEnd?: number;
}

function DiffViewerClient({
	rawDiff,
	className,
	diffStyle = 'split',
	selectedFile,
	sessionId,
	onSendNow,
}: Omit<DiffViewerProps, 'onFileVisible'>) {
	const { resolvedTheme } = useTheme();
	const containerRef = useRef<HTMLDivElement>(null);
	const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const [commentForm, setCommentForm] = useState<CommentFormData | null>(
		null,
	);
	const [selectedLines, setSelectedLines] = useState<
		Map<string, SelectedLineRange | null>
	>(new Map());
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const [DiffComponents, setDiffComponents] = useState<{
		FileDiff: React.ComponentType<any>;
		WorkerPoolContextProvider: React.ComponentType<any>;
		parsePatchFiles: (patch: string) => ParsedPatch[];
		poolOptions: any;
		highlighterOptions: any;
		defaultDiffOptions: Record<string, unknown>;
	} | null>(null);

	interface HoveredLineResult {
		lineNumber: number;
		lineElement: HTMLElement;
		side: AnnotationSide;
	}

	useEffect(() => {
		Promise.all([
			import('@pierre/diffs/react'),
			import('@pierre/diffs'),
			import('../lib/worker-pool.js'),
		]).then(([diffsReact, diffs, workerPool]) => {
			setDiffComponents({
				FileDiff: diffsReact.FileDiff,
				WorkerPoolContextProvider: diffsReact.WorkerPoolContextProvider,
				parsePatchFiles: diffs.parsePatchFiles,
				poolOptions: workerPool.poolOptions,
				highlighterOptions: workerPool.highlighterOptions,
				defaultDiffOptions: workerPool.defaultDiffOptions,
			});
		});
	}, []);

	useEffect(() => {
		if (selectedFile && fileRefs.current.has(selectedFile)) {
			const element = fileRefs.current.get(selectedFile);
			element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [selectedFile]);

	const setFileRef = useCallback(
		(filePath: string, element: HTMLDivElement | null) => {
			if (element) {
				fileRefs.current.set(filePath, element);
			} else {
				fileRefs.current.delete(filePath);
			}
		},
		[],
	);

	const handleAddComment = useCallback(
		(
			filePath: string,
			getHoveredLine: () => HoveredLineResult | undefined,
		) => {
			const hoveredLine = getHoveredLine();
			if (hoveredLine) {
				setCommentForm({
					filePath,
					lineStart: hoveredLine.lineNumber,
					side: hoveredLine.side,
				});
			}
		},
		[],
	);

	const handleLineSelectionEnd = useCallback(
		(filePath: string, range: SelectedLineRange | null) => {
			if (range) {
				setSelectedLines((prev) => new Map(prev).set(filePath, range));
				setCommentForm({
					filePath,
					lineStart: Math.min(range.start, range.end),
					lineEnd: Math.max(range.start, range.end),
					side: range.side || 'additions',
				});
			}
		},
		[],
	);

	const handleFileComment = useCallback((filePath: string) => {
		setCommentForm({ filePath, lineStart: 1, side: 'additions' });
	}, []);

	const handleHunkComment = useCallback(
		(filePath: string, hunk: Hunk, _hunkIndex: number) => {
			setCommentForm({
				filePath,
				lineStart: hunk.additionStart,
				lineEnd: hunk.additionStart + hunk.additionLines - 1,
				side: 'additions',
			});
			setTimeout(() => {
				const commentFormEl = document.querySelector(
					'[data-comment-form]',
				);
				commentFormEl?.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				});
			}, 100);
		},
		[],
	);

	const handleCloseComment = useCallback(() => {
		setCommentForm(null);
		setSelectedLines(new Map());
	}, []);

	if (!DiffComponents) {
		return (
			<div className="flex items-center justify-center h-full gap-2">
				<Spinner size="2" />
				<Text size="2" color="gray">
					Loading diff viewer...
				</Text>
			</div>
		);
	}

	const {
		FileDiff,
		WorkerPoolContextProvider,
		parsePatchFiles,
		poolOptions,
		highlighterOptions,
		defaultDiffOptions,
	} = DiffComponents;

	const parsedPatches = parsePatchFiles(rawDiff);
	const allFiles = parsedPatches.flatMap((p) => p.files || []);

	return (
		<WorkerPoolContextProvider
			poolOptions={poolOptions}
			highlighterOptions={highlighterOptions}
		>
			<div ref={containerRef} className={className}>
				{allFiles.map((fileDiff, index) => {
					const filePath =
						fileDiff.name || fileDiff.prevName || `file-${index}`;
					const fileSelectedLines =
						selectedLines.get(filePath) || null;
					const isCommentingOnThisFile =
						commentForm?.filePath === filePath;

					const lineAnnotations = isCommentingOnThisFile
						? [
								{
									side: commentForm.side,
									lineNumber:
										commentForm.lineEnd ||
										commentForm.lineStart,
									metadata: {
										type: 'comment-form' as const,
										lineStart: commentForm.lineStart,
										lineEnd: commentForm.lineEnd,
									},
								},
							]
						: [];

					return (
						<div
							key={filePath}
							ref={(el) => setFileRef(filePath, el)}
							className="file-diff-container border-b border-gray-200 dark:border-gray-800 relative"
							data-file-path={filePath}
						>
							<StickyFileHeader
								fileDiff={fileDiff}
								onAddComment={() => handleFileComment(filePath)}
								onAddHunkComment={(hunk, hunkIndex) =>
									handleHunkComment(filePath, hunk, hunkIndex)
								}
							/>
							<FileDiff
								fileDiff={fileDiff}
								selectedLines={fileSelectedLines}
								lineAnnotations={lineAnnotations}
								options={{
									...defaultDiffOptions,
									diffStyle,
									themeType: resolvedTheme,
									disableFileHeader: true,
									enableHoverUtility: true,
									enableLineSelection: true,
									onLineSelectionEnd: (
										range: SelectedLineRange | null,
									) =>
										handleLineSelectionEnd(filePath, range),
								}}
								renderHoverUtility={(
									getHoveredLine: () =>
										| HoveredLineResult
										| undefined,
								) => (
									<button
										onClick={() =>
											handleAddComment(
												filePath,
												getHoveredLine,
											)
										}
										className="flex items-center justify-center w-5 h-5 rounded bg-blue-500 hover:bg-blue-600 text-white shadow-sm"
										title="Add comment"
									>
										<VscAdd className="w-3 h-3" />
									</button>
								)}
								renderAnnotation={(annotation: {
									side: AnnotationSide;
									lineNumber: number;
									metadata: CommentAnnotation;
								}) => (
									<InlineCommentForm
										sessionId={sessionId}
										filePath={filePath}
										lineStart={
											annotation.metadata.lineStart
										}
										lineEnd={annotation.metadata.lineEnd}
										side={
											annotation.side === 'additions'
												? 'new'
												: 'old'
										}
										onClose={handleCloseComment}
										onSendNow={
											onSendNow
												? (content) => {
														onSendNow(
															content,
															filePath,
															annotation.metadata
																.lineStart,
															annotation.metadata
																.lineEnd,
														);
														handleCloseComment();
													}
												: undefined
										}
									/>
								)}
							/>
						</div>
					);
				})}
			</div>
		</WorkerPoolContextProvider>
	);
}

interface StickyFileHeaderProps {
	fileDiff: FileDiffMetadata;
	onAddComment: () => void;
	onAddHunkComment: (hunk: Hunk, hunkIndex: number) => void;
}

function StickyFileHeader({
	fileDiff,
	onAddComment,
	onAddHunkComment,
}: StickyFileHeaderProps) {
	const fileName = fileDiff.name || fileDiff.prevName || 'unknown';
	const changeType = fileDiff.type;
	const hunks = fileDiff.hunks || [];

	const getIcon = (type: ChangeTypes) => {
		switch (type) {
			case 'new':
				return <VscDiffAdded className="w-4 h-4 text-green-500" />;
			case 'deleted':
				return <VscDiffRemoved className="w-4 h-4 text-red-500" />;
			case 'rename-pure':
			case 'rename-changed':
				return <VscFile className="w-4 h-4 text-yellow-500" />;
			default:
				return <VscDiffModified className="w-4 h-4 text-blue-500" />;
		}
	};

	const getLabel = (type: ChangeTypes) => {
		switch (type) {
			case 'new':
				return (
					<Badge color="green" size="1">
						Added
					</Badge>
				);
			case 'deleted':
				return (
					<Badge color="red" size="1">
						Deleted
					</Badge>
				);
			case 'rename-pure':
				return (
					<Badge color="amber" size="1">
						Renamed
					</Badge>
				);
			case 'rename-changed':
				return (
					<Badge color="amber" size="1">
						Renamed & Modified
					</Badge>
				);
			default:
				return null;
		}
	};

	const getHunkLabel = (hunk: Hunk, index: number) => {
		const context = hunk.hunkContext ? ` - ${hunk.hunkContext}` : '';
		return `Hunk ${index + 1}: Lines ${hunk.additionStart}-${hunk.additionStart + hunk.additionLines}${context}`;
	};

	return (
		<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
			<div className="flex items-center gap-2 min-w-0">
				{getIcon(changeType)}
				<Text size="2" className="font-mono truncate">
					{fileName}
				</Text>
				{fileDiff.prevName && fileDiff.prevName !== fileName && (
					<Text size="1" color="gray">
						← {fileDiff.prevName}
					</Text>
				)}
				{getLabel(changeType)}
			</div>
			<div className="relative flex items-center gap-1">
				{hunks.length > 0 && (
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							<Button variant="ghost" size="1">
								<VscComment aria-hidden="true" />
								Hunk ({hunks.length})
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{hunks.map((hunk, index) => (
								<DropdownMenu.Item
									key={index}
									onSelect={() =>
										onAddHunkComment(hunk, index)
									}
								>
									{getHunkLabel(hunk, index)}
								</DropdownMenu.Item>
							))}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				)}
				<Button variant="ghost" size="1" onClick={onAddComment}>
					<VscComment aria-hidden="true" />
					File
				</Button>
			</div>
		</div>
	);
}

export function DiffViewer({
	rawDiff,
	className,
	diffStyle = 'split',
	selectedFile,
	sessionId,
	onSendNow,
}: DiffViewerProps) {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	if (!rawDiff) {
		return (
			<div className="flex items-center justify-center h-full">
				<Text size="2" color="gray">
					No changes to display
				</Text>
			</div>
		);
	}

	if (!isClient) {
		return (
			<div className="flex items-center justify-center h-full gap-2">
				<Spinner size="2" />
				<Text size="2" color="gray">
					Loading diff...
				</Text>
			</div>
		);
	}

	return (
		<DiffViewerClient
			rawDiff={rawDiff}
			className={className}
			diffStyle={diffStyle}
			selectedFile={selectedFile}
			sessionId={sessionId}
			onSendNow={onSendNow}
		/>
	);
}
