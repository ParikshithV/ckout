import process from 'node:process';
import React, {useCallback, useEffect, useState} from 'react';
import {Text, useApp} from 'ink';
import {type Settings} from '../ai/config.js';
import {type Flags, type View} from '../types.js';
import BranchPicker from './branch-picker.js';
import CommitCard from './commit-card.js';
import ConfigView from './config-view.js';
import PrCard from './pr-card.js';

type Props = {
	root: string;
	settings: Settings;
	flags: Flags;
	initialView: View;
	/** Config opened on its own before the commit card; finishing it continues there. */
	firstRun?: boolean;
};

export default function Root({
	root,
	settings: initialSettings,
	flags,
	initialView,
	firstRun = false,
}: Props) {
	const {exit} = useApp();
	const [view, setView] = useState<View>(initialView);
	const [settings, setSettings] = useState(initialSettings);
	const [done, setDone] = useState<{text: string} | undefined>();

	const onDone = useCallback((text: string, exitCode = 0) => {
		process.exitCode = exitCode;
		setDone({text});
	}, []);

	// Exit after the final line has rendered, so it stays in the scrollback.
	useEffect(() => {
		if (done) {
			exit();
		}
	}, [done]);

	if (done) {
		return done.text ? <Text>{done.text}</Text> : null;
	}

	const props = {root, settings, flags, onSwitch: setView, onDone};
	switch (view) {
		case 'branch': {
			return <BranchPicker {...props} />;
		}

		case 'pr': {
			return <PrCard {...props} />;
		}

		case 'config': {
			return (
				<ConfigView
					{...props}
					firstRun={firstRun}
					onDone={(text, exitCode) => {
						// Ctrl+C leaves no text: quit. Otherwise carry on to the card.
						if (firstRun && text) {
							setView('commit');
						} else {
							onDone(text, exitCode);
						}
					}}
					onSaved={(next: Settings) => {
						setSettings(next);
					}}
				/>
			);
		}

		default: {
			return <CommitCard {...props} />;
		}
	}
}
