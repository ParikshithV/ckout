import React from 'react';
import {Box, Text} from 'ink';
import {type PromptMode} from '../types.js';
import {promptPlaceholder} from '../prompt.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';

type Props = {
	mode: PromptMode;
	commandHint: string;
	insertMode: boolean;
	value: string;
	cursorPos?: number;
	error?: string;
};

export default function PromptBar({
	mode,
	commandHint,
	insertMode,
	value,
	cursorPos,
	error,
}: Props) {
	const placeholder = promptPlaceholder(mode);
	const sanitizedValue = sanitizeSingleLine(value);
	const characters = [...sanitizedValue];
	const pos = Math.max(
		0,
		Math.min(characters.length, cursorPos ?? characters.length),
	);
	const empty = sanitizedValue.length === 0;

	let inputDisplay: React.ReactNode;
	if (!insertMode) {
		inputDisplay = empty ? (
			<Text dimColor>{placeholder}</Text>
		) : (
			<Text>{sanitizedValue}</Text>
		);
	} else if (empty) {
		inputDisplay = (
			<Text>
				<Text color="cyan">█</Text>
				<Text dimColor>{placeholder}</Text>
			</Text>
		);
	} else {
		const before = characters.slice(0, pos).join('');
		const atCursor = characters[pos] ?? ' ';
		const after = characters.slice(pos + 1).join('');
		inputDisplay = (
			<Text>
				{before}
				<Text inverse color="cyan">
					{atCursor}
				</Text>
				{after}
			</Text>
		);
	}

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			borderStyle="round"
			borderColor={error ? 'red' : 'cyan'}
		>
			<Box gap={1}>
				<Text color={error ? 'red' : 'cyan'} bold>
					{mode}
				</Text>
				<Text dimColor>{sanitizeSingleLine(commandHint)}</Text>
				{error ? (
					<Text color="red">⚠ {sanitizeSingleLine(error)}</Text>
				) : undefined}
			</Box>
			<Box gap={1}>
				<Text color="cyan">{insertMode ? '>' : '·'}</Text>
				{inputDisplay}
			</Box>
		</Box>
	);
}
