import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

interface AsyncState {
	pendingCount: number;
	isPending: boolean;
	startOperation: (id: string) => void;
	endOperation: (id: string) => void;
}

const AsyncStateContext = createContext<AsyncState | null>(null);

export function AsyncStateProvider({ children }: { children: ReactNode }) {
	const [pendingOperations, setPendingOperations] = useState<Set<string>>(
		new Set(),
	);

	const startOperation = useCallback((id: string) => {
		setPendingOperations((prev) => new Set(prev).add(id));
	}, []);

	const endOperation = useCallback((id: string) => {
		setPendingOperations((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const value = useMemo(
		() => ({
			pendingCount: pendingOperations.size,
			isPending: pendingOperations.size > 0,
			startOperation,
			endOperation,
		}),
		[pendingOperations.size, startOperation, endOperation],
	);

	return (
		<AsyncStateContext.Provider value={value}>
			{children}
		</AsyncStateContext.Provider>
	);
}

export function useAsyncState() {
	const context = useContext(AsyncStateContext);
	if (!context) {
		throw new Error('useAsyncState must be used within AsyncStateProvider');
	}
	return context;
}
