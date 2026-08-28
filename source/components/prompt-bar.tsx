import React from 'react';
import {Box, Text} from 'ink';
import {TextInput} from '@inkjs/ui';
import {type PromptMode} from '../types.js';
import {promptPlaceholder} from '../prompt.js';

type Props = {
	mode: PromptMode;
	commandHint: string;
	insertMode: boolean;
	inputKey: number;
	defaultValue: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
};

export default function PromptBar({
	mode,
	commandHint,
	insertMode,
	inputKey,
	defaultValue,
	onChange,
	onSubmit,
}: Props) {
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
				<TextInput
					key={inputKey}
					isDisabled={!insertMode}
					placeholder={promptPlaceholder(mode)}
					defaultValue={defaultValue}
					onChange={onChange}
					onSubmit={onSubmit}
				/>
			</Box>
		</Box>
	);
}
