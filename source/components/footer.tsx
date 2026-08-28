import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	insertMode: boolean;
	diffOpen?: boolean;
	activeList?: 'branches' | 'files';
};

export default function Footer({
	insertMode,
	diffOpen = false,
	activeList = 'branches',
}: Props) {
	let hints =
		'↑↓ move  tab files/branches  enter checkout  n new  c commit  f/u/p fetch/pull/push';

	if (activeList === 'files') {
		hints =
			'↑↓ files  enter/d diff  e editor  space mark  tab branches  c commit  ctrl+c quit';
	}

	if (insertMode) {
		hints = 'enter submit  ↑↓ history  tab mode  esc leave prompt';
	} else if (diffOpen) {
		hints = '↑↓ scroll  ←→ file  e editor  esc back';
	}

	return (
		<Box paddingX={1}>
			<Text dimColor>{hints}</Text>
		</Box>
	);
}
