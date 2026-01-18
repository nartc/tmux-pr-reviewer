import { useEffect, useId, useRef } from 'react';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';
import { useAsyncState } from './async-state';

interface UseAsyncActionOptions<T> {
	onSuccess?: (data: T) => void;
	onError?: (error: unknown) => void;
	successMessage?: string;
	errorMessage?: string;
}

export function useAsyncAction<T>(options?: UseAsyncActionOptions<T>) {
	const fetcher = useFetcher<T>();
	const { startOperation, endOperation } = useAsyncState();
	const id = useId();
	const wasSubmitting = useRef(false);

	useEffect(() => {
		if (fetcher.state === 'submitting' || fetcher.state === 'loading') {
			if (!wasSubmitting.current) {
				startOperation(id);
				wasSubmitting.current = true;
			}
		} else if (fetcher.state === 'idle' && wasSubmitting.current) {
			endOperation(id);
			wasSubmitting.current = false;

			if (fetcher.data) {
				// Check if response indicates an error
				const data = fetcher.data as { error?: string };
				if (data.error) {
					if (options?.errorMessage) {
						toast.error(options.errorMessage);
					}
					options?.onError?.(new Error(data.error));
				} else {
					if (options?.successMessage) {
						toast.success(options.successMessage);
					}
					options?.onSuccess?.(fetcher.data as T);
				}
			}
		}
	}, [
		fetcher.state,
		fetcher.data,
		id,
		startOperation,
		endOperation,
		options?.successMessage,
		options?.errorMessage,
		options?.onSuccess,
		options?.onError,
	]);

	return {
		submit: fetcher.submit,
		Form: fetcher.Form,
		isPending: fetcher.state !== 'idle',
		data: fetcher.data,
		state: fetcher.state,
	};
}
