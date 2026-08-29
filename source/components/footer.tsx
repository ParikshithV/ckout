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
		'↑↓ move · enter checkout · n new · m merge · f fetch · u pull · p push · tab files · i/c message · ctrl+c quit';

	if (activeList === 'files') {
		hints =
			'↑↓ move · enter/d diff · e editor · space mark · s stage · u unstage · tab message · c commit · / filter · ctrl+c quit';
	}

	if (insertMode) {
		hints =
			'enter commit · tab branches · shift+tab files · esc lists · ctrl+c quit';
	} else if (diffOpen) {
		hints =
			'↑↓ scroll · h/l pan · w wrap · ←→ file · e editor · c commit · esc back';
	}

	return (
		<Box paddingX={1}>
			<Text dimColor>{hints}</Text>
		</Box>
	);
}
