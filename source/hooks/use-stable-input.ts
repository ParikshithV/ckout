import {useCallback, useRef} from 'react';
import {useInput, type Key} from 'ink';

export function useStableInput(
	handler: (input: string, key: Key) => void,
	isActive = true,
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	const stable = useCallback((input: string, key: Key) => {
		handlerRef.current(input, key);
	}, []);

	useInput(stable, {isActive});
}
