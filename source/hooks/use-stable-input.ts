import {useCallback, useRef} from 'react';
import {useInput, useStdin, type Key} from 'ink';

export function useStableInput(
	handler: (input: string, key: Key) => void,
	isActive = true,
): void {
	const {isRawModeSupported} = useStdin();
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	const stable = useCallback((input: string, key: Key) => {
		handlerRef.current(input, key);
	}, []);

	// Without a TTY (pipes, CI) there are no keys to read; `-y` runs without them.
	useInput(stable, {isActive: isActive && Boolean(isRawModeSupported)});
}
