import { useAsyncState } from '~/lib/async-state.js';

export function GlobalLoadingBar() {
	const { isPending } = useAsyncState();

	if (!isPending) return null;

	return (
		<div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-blue-200 dark:bg-blue-900 overflow-hidden">
			<div className="h-full w-1/3 bg-blue-500 animate-loading" />
		</div>
	);
}
