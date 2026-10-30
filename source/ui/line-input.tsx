import React, {useCallback, useRef, useState} from 'react';
import {Text, type Key} from 'ink';
import {
	deleteAtCursor,
	deleteBeforeCursor,
	deleteToStart,
	deleteWordBeforeCursor,
	insertAtCursor,
	isBackwardDeleteKey,
	isPrintable,
	textLength,
} from '../prompt.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';

export type LineInputState = {
	value: string;
	cursor: number;
	set: (value: string) => void;
	/** Apply an editing key. Returns true when the key was consumed. */
	handle: (input: string, key: Key) => boolean;
};

export function useLineInput(initial = ''): LineInputState {
	const [state, setState] = useState({
		value: initial,
		cursor: textLength(initial),
	});
	// Ink can deliver several keys before React re-renders (fast typing, paste).
	const ref = useRef(state);
	ref.current = state;

	const apply = useCallback((next: {value: string; cursor: number}) => {
		ref.current = next;
		setState(next);
	}, []);

	const set = useCallback(
		(value: string) => {
			apply({value, cursor: textLength(value)});
		},
		[apply],
	);

	const handle = useCallback(
		(input: string, key: Key): boolean => {
			const {value, cursor} = ref.current;
			if (key.leftArrow) {
				apply({value, cursor: Math.max(0, cursor - 1)});
				return true;
			}

			if (key.rightArrow) {
				apply({value, cursor: Math.min(textLength(value), cursor + 1)});
				return true;
			}

			if (key.ctrl && input === 'a') {
				apply({value, cursor: 0});
				return true;
			}

			if (key.ctrl && input === 'e') {
				apply({value, cursor: textLength(value)});
				return true;
			}

			if (key.ctrl && input === 'u') {
				apply(deleteToStart(value, cursor));
				return true;
			}

			if (key.ctrl && input === 'w') {
				apply(deleteWordBeforeCursor(value, cursor));
				return true;
			}

			if (key.ctrl && input === 'd') {
				apply(deleteAtCursor(value, cursor));
				return true;
			}

			if (isBackwardDeleteKey(key)) {
				apply(deleteBeforeCursor(value, cursor));
				return true;
			}

			if (isPrintable(input, key)) {
				apply(insertAtCursor(value, cursor, sanitizeSingleLine(input)));
				return true;
			}

			return false;
		},
		[apply],
	);

	return {value: state.value, cursor: state.cursor, set, handle};
}

type Props = {
	value: string;
	cursor: number;
	active: boolean;
	placeholder?: string;
};

export function LineInput({value, cursor, active, placeholder = ''}: Props) {
	const characters = [...sanitizeSingleLine(value)];
	if (characters.length === 0) {
		return active ? (
			<Text>
				<Text inverse> </Text>
				<Text dimColor>{placeholder}</Text>
			</Text>
		) : (
			<Text dimColor>{placeholder}</Text>
		);
	}

	if (!active) {
		return <Text>{characters.join('')}</Text>;
	}

	const pos = Math.max(0, Math.min(characters.length, cursor));
	return (
		<Text>
			{characters.slice(0, pos).join('')}
			<Text inverse>{characters[pos] ?? ' '}</Text>
			{characters.slice(pos + 1).join('')}
		</Text>
	);
}
