import React from 'react';
import {Box, Text} from 'ink';
import {Alert, ConfirmInput} from '@inkjs/ui';

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
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
			gap={1}
		>
			<Alert variant="warning" title={title}>
				This will run in {cwd}
			</Alert>
			<Text>
				Command: <Text color="cyan">{command}</Text>
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
