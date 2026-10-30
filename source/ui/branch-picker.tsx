import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text} from 'ink';
import {Spinner} from '@inkjs/ui';
import {sanitizeBranchName} from '../ai/parse.js';
import {
	parseBranches,
	remoteTrackingShortName,
	type GitBranch,
} from '../git/parse-branches.js';
import {firstLine, runGit} from '../git/run.js';
import {useStableInput} from '../hooks/use-stable-input.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';
import {windowedSlice} from '../lib/windowed.js';
import {type ViewProps} from '../types.js';
import {LineInput, useLineInput} from './line-input.js';

type Armed = {kind: 'merge' | 'delete' | 'force-delete'; branch: GitBranch};

const visibleRows = 8;

/** Subsequence match, so `fai` finds `feat/ai-commit`. */
export function fuzzyMatch(name: string, query: string): boolean {
	const haystack = name.toLowerCase();
	let position = 0;
	for (const character of query.toLowerCase()) {
		position = haystack.indexOf(character, position);
		if (position === -1) {
			return false;
		}

		position++;
	}

	return true;
}

export function displayName(branch: GitBranch): string {
	return branch.name.replace(/^remotes\//, '');
}

export function switchArgs(branch: GitBranch): string[] {
	if (!branch.remote) {
		return ['switch', branch.name];
	}

	const ref = displayName(branch);
	return ['switch', '-c', remoteTrackingShortName(branch.name), '--track', ref];
}

export default function BranchPicker({root, onDone, onSwitch}: ViewProps) {
	const [branches, setBranches] = useState<GitBranch[] | undefined>();
	const filter = useLineInput();
	const [index, setIndex] = useState(0);
	const [armed, setArmed] = useState<Armed | undefined>();
	const [running, setRunning] = useState<string | undefined>();

	useEffect(() => {
		void runGit(root, ['branch', '-a']).then(result => {
			if (result.code !== 0) {
				onDone(`✗ ${firstLine(result.stderr) || 'git branch failed'}`, 1);
				return;
			}

			setBranches(parseBranches(result.stdout));
		});
	}, []);

	const query = filter.value.trim();
	const matches = useMemo(
		() =>
			(branches ?? []).filter(branch => fuzzyMatch(displayName(branch), query)),
		[branches, query],
	);
	const current = branches?.find(branch => branch.current);
	const selected = matches[Math.min(index, Math.max(0, matches.length - 1))];
	const newName = sanitizeBranchName(query);

	const runAndFinish = async (
		args: string[],
		label: string,
		success: string,
	): Promise<{ok: boolean; message: string}> => {
		setRunning(label);
		const result = await runGit(root, args);
		setRunning(undefined);
		const message = firstLine(result.stderr) || firstLine(result.stdout);
		if (result.code === 0) {
			onDone(`✓ ${success}`);
		}

		return {ok: result.code === 0, message};
	};

	const fail = (message: string) => {
		onDone(`✗ ${message}`, 1);
	};

	useStableInput((input, key) => {
		if (running) {
			return;
		}

		if (key.ctrl && input === 'c') {
			onDone('');
			return;
		}

		if (key.escape) {
			if (armed) {
				setArmed(undefined);
				return;
			}

			onDone('');
			return;
		}

		if (key.upArrow || key.downArrow) {
			const delta = key.downArrow ? 1 : -1;
			setIndex(
				previous =>
					(previous + delta + matches.length) % Math.max(1, matches.length),
			);
			setArmed(undefined);
			return;
		}

		if (key.tab) {
			onSwitch('commit');
			return;
		}

		if (key.ctrl && input === 'n') {
			if (newName) {
				void runAndFinish(
					['switch', '-c', newName],
					'creating',
					`created ${newName}`,
				).then(({ok, message}) => {
					if (!ok) fail(message);
				});
			}

			return;
		}

		if (key.ctrl && (input === 'o' || input === 'x') && selected) {
			if (selected.current) {
				return;
			}

			if (input === 'o') {
				if (armed?.kind !== 'merge' || armed.branch !== selected) {
					setArmed({kind: 'merge', branch: selected});
					return;
				}

				const ref = displayName(selected);
				void runAndFinish(
					['merge', ref],
					'merging',
					`merged ${ref} into ${current?.name ?? 'HEAD'}`,
				).then(({ok, message}) => {
					if (!ok) fail(message);
				});
				return;
			}

			if (selected.remote) {
				return;
			}

			if (!armed || armed.branch !== selected || armed.kind === 'merge') {
				setArmed({kind: 'delete', branch: selected});
				return;
			}

			const force = armed.kind === 'force-delete';
			void runAndFinish(
				['branch', force ? '-D' : '-d', selected.name],
				'deleting',
				`deleted ${selected.name}`,
			).then(({ok, message}) => {
				if (ok) return;
				if (!force && message.includes('not fully merged')) {
					setArmed({kind: 'force-delete', branch: selected});
					return;
				}

				fail(message);
			});
			return;
		}

		if (key.return) {
			if (selected) {
				if (selected.current) {
					onDone(`· already on ${selected.name}`);
					return;
				}

				const name = selected.remote
					? remoteTrackingShortName(selected.name)
					: selected.name;
				void runAndFinish(
					switchArgs(selected),
					'switching',
					`switched to ${name}`,
				).then(({ok, message}) => {
					if (!ok) fail(message);
				});
			} else if (newName) {
				void runAndFinish(
					['switch', '-c', newName],
					'creating',
					`created ${newName}`,
				).then(({ok, message}) => {
					if (!ok) fail(message);
				});
			}

			return;
		}

		if (filter.handle(input, key)) {
			setIndex(0);
			setArmed(undefined);
		}
	});

	if (running) {
		return <Spinner label={running} />;
	}

	if (!branches) {
		return <Spinner label="reading branches" />;
	}

	const window = windowedSlice(matches, index, visibleRows);
	const target = current?.name ?? 'HEAD';

	let hint = `⏎ switch · ^n new · ^o merge into ${target} · ^x delete · esc`;
	switch (armed?.kind) {
		case 'merge': {
			hint = `^o again to merge ${displayName(armed.branch)} into ${target}`;

			break;
		}

		case 'delete': {
			hint = `^x again to delete ${armed.branch.name}`;

			break;
		}

		case 'force-delete': {
			hint = `${armed.branch.name} is not merged · ^x again to force delete`;

			break;
		}

		default: {
			if (matches.length === 0 && newName) {
				hint = `⏎ create ${newName} · esc`;
			}
		}
	}

	return (
		<Box flexDirection="column">
			<Text>
				<Text color="cyan">› </Text>
				<LineInput
					active
					value={filter.value}
					cursor={filter.cursor}
					placeholder="branch"
				/>
			</Text>
			{window.items.map((branch, offset) => {
				const focused = window.start + offset === index;
				return (
					<Text
						key={branch.name}
						color={focused ? 'cyan' : undefined}
						dimColor={!focused && branch.remote}
					>
						{focused ? '› ' : '  '}
						{sanitizeSingleLine(displayName(branch))}
						{branch.current ? ' *' : ''}
					</Text>
				);
			})}
			<Text color={armed ? 'yellow' : undefined} dimColor={!armed}>
				{hint}
			</Text>
		</Box>
	);
}
