import { Spinner, Text } from '@radix-ui/themes';

interface LoadingSpinnerProps {
	size?: '1' | '2' | '3';
	className?: string;
}

export function LoadingSpinner({
	size = '2',
	className = '',
}: LoadingSpinnerProps) {
	return <Spinner size={size} className={className} />;
}

interface LoadingOverlayProps {
	message?: string;
}

export function LoadingOverlay({
	message = 'Loading...',
}: LoadingOverlayProps) {
	return (
		<div className="absolute inset-0 bg-white/80 dark:bg-gray-950/80 flex items-center justify-center z-10">
			<div className="flex flex-col items-center gap-3">
				<Spinner size="3" />
				<Text size="2" color="gray">
					{message}
				</Text>
			</div>
		</div>
	);
}

interface LoadingCardProps {
	message?: string;
}

export function LoadingCard({ message = 'Loading...' }: LoadingCardProps) {
	return (
		<div className="flex items-center justify-center p-8">
			<div className="flex flex-col items-center gap-3">
				<Spinner size="2" />
				<Text size="2" color="gray">
					{message}
				</Text>
			</div>
		</div>
	);
}

// Skeleton loaders
export function SkeletonLine({ width = '100%' }: { width?: string }) {
	return (
		<div
			className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
			style={{ width }}
		/>
	);
}

export function SkeletonCard() {
	return (
		<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
			<SkeletonLine width="60%" />
			<SkeletonLine width="100%" />
			<SkeletonLine width="80%" />
		</div>
	);
}

export function SkeletonFileList() {
	return (
		<div className="space-y-2 p-4">
			{[1, 2, 3, 4, 5].map((i) => (
				<div key={i} className="flex items-center gap-2">
					<div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
					<SkeletonLine width={`${60 + Math.random() * 30}%`} />
				</div>
			))}
		</div>
	);
}

// Processing indicator for AI
interface ProcessingIndicatorProps {
	message?: string;
}

export function ProcessingIndicator({
	message = 'Processing with AI...',
}: ProcessingIndicatorProps) {
	return (
		<div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
			<Spinner size="1" />
			<Text size="2">{message}</Text>
		</div>
	);
}

// Sending indicator
interface SendingIndicatorProps {
	message?: string;
}

export function SendingIndicator({
	message = 'Sending to tmux...',
}: SendingIndicatorProps) {
	return (
		<div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
			<Spinner size="1" />
			<Text size="2">{message}</Text>
		</div>
	);
}
