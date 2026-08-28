import React from 'react';
import {Box, Text} from 'ink';
import {type PromptMode} from '../types.js';
import {promptPlaceholder} from '../prompt.js';

type Props = {
	mode: PromptMode;
	commandHint: string;
	insertMode: boolean;
	value: string;
};

export default function PromptBar({
	mode,
	commandHint,
	insertMode,
	value,
}: Props) {
	const placeholder = promptPlaceholder(mode);
	const empty = value.length === 0;

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			borderStyle="round"
			borderColor="cyan"
		>
			<Box gap={1}>
				<Text color="cyan" bold>
					{mode}
				</Text>
				<Text dimColor>{commandHint}</Text>
			</Box>
			<Box gap={1}>
				<Text color="cyan">{insertMode ? '>' : '·'}</Text>
				{empty ? (
					<Text dimColor>
						{placeholder}
						{insertMode ? '█' : ''}
					</Text>
				) : (
					<Text>
						{value}
						{insertMode ? '█' : ''}
					</Text>
				)}
			</Box>
		</Box>
	);
}
