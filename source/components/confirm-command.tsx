import React from 'react';
import {Box, Text} from 'ink';
import {Alert, ConfirmInput} from '@inkjs/ui';
import {sanitizeSingleLine} from '../lib/sanitize.js';

type Props = {
	title: string;
	cwd: string;
	command: string;
	onConfirm: () => void;
	onCancel: () => void;
};

export default function ConfirmCommand({
	title,
	cwd,
	command,
	onConfirm,
	onCancel,
}: Props) {
	const sanitizedTitle = sanitizeSingleLine(title);
	const sanitizedCwd = sanitizeSingleLine(cwd);
	const sanitizedCommand = sanitizeSingleLine(command);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
			gap={1}
		>
			<Alert variant="warning" title={sanitizedTitle}>
				This will run in {sanitizedCwd}
			</Alert>
			<Text>
				Command: <Text color="cyan">{sanitizedCommand}</Text>
			</Text>
			<Box>
				<Text>Run it? </Text>
				<ConfirmInput
					defaultChoice="cancel"
					submitOnEnter={false}
					onConfirm={onConfirm}
					onCancel={onCancel}
				/>
			</Box>
		</Box>
	);
}
