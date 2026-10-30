import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, type Key} from 'ink';
import {Spinner} from '@inkjs/ui';
import {collectCommitContext} from '../ai/context.js';
import {suggestCommit} from '../ai/generate.js';
import {branchFromSubject, uniqueBranchName} from '../ai/parse.js';
import {shortError} from '../ai/providers.js';
import {ghReady, viewPr} from '../git/gh.js';
import {
	describeStep,
	keyLabel,
	resolvePlan,
	type ActionKey,
	type CardAction,
	type PrState,
} from '../git/plan.js';
import {loadRepoState, type RepoState} from '../git/repo.js';
import {firstLine, runGit} from '../git/run.js';
import {runPlan, summarizeRun} from '../git/runner.js';
import {fileStatusLabel} from '../git/parse-status.js';
import {useStableInput} from '../hooks/use-stable-input.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';
import {windowedSlice} from '../lib/windowed.js';
import {type ViewProps} from '../types.js';
import {runInTerminal} from './handoff.js';
import {LineInput, useLineInput} from './line-input.js';

type Mode = 'actions' | 'edit' | 'files' | 'menu';

type AiState =
	| {status: 'idle'}
	| {status: 'writing'}
	| {status: 'done'}
	| {status: 'failed'; reason: string};

const actionKeys: Record<string, ActionKey> = {b: 'b', p: 'p'};

export function aiShortName(tag: string): string {
	return tag.split(' · ')[0] ?? tag;
}

export default function CommitCard({
	root,
	settings,
	flags,
	onSwitch,
	onDone,
}: ViewProps) {
	const [repo, setRepo] = useState<RepoState | undefined>();
	const [reloadTick, setReloadTick] = useState(0);
	const [pr, setPr] = useState<PrState>({kind: 'loading'});
	const [gh, setGh] = useState(false);
	const message = useLineInput(flags.message ?? '');
	const [body, setBody] = useState('');
	const [aiBranch, setAiBranch] = useState<string | undefined>();
	const aiSubjectRef = useRef<string | undefined>();
	const editStartRef = useRef('');
	const [ai, setAi] = useState<AiState>({status: 'idle'});
	const [mode, setMode] = useState<Mode>('actions');
	const [showPlan, setShowPlan] = useState(false);
	const [excluded, setExcluded] = useState<string[]>([]);
	const [fileIndex, setFileIndex] = useState(0);
	const [running, setRunning] = useState<string | undefined>();
	const [flash, setFlash] = useState<string | undefined>();
	const abortRef = useRef<AbortController | undefined>();
	const autoRanRef = useRef(false);

	const files = repo?.status.files ?? [];
	const selected = files.filter(file => !excluded.includes(file.path));
	const hasChanges = files.length > 0;
	const subject = message.value.trim();
	const aiAuthored =
		aiSubjectRef.current !== undefined && aiSubjectRef.current === subject;

	const newBranch = useMemo(() => {
		const preferred =
			aiAuthored && aiBranch
				? aiBranch
				: branchFromSubject(subject || 'update');
		const existing = (repo?.branches ?? [])
			.filter(branch => !branch.remote)
			.map(branch => branch.name);
		return uniqueBranchName(preferred, existing);
	}, [aiAuthored, aiBranch, repo?.branches, subject]);

	const plan = useMemo(
		() =>
			repo
				? resolvePlan({
						repo,
						files: selected,
						allFiles: excluded.length === 0,
						subject,
						body: aiAuthored ? body : '',
						newBranch,
						pr,
						ghReady: gh,
						noPush: flags.noPush,
						protectedBranches: settings.protectedBranches,
				  })
				: undefined,
		[
			aiAuthored,
			body,
			excluded.length,
			flags.noPush,
			gh,
			newBranch,
			pr,
			repo,
			selected,
			settings.protectedBranches,
			subject,
		],
	);

	const generate = useCallback(
		async (state: RepoState) => {
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			setAi({status: 'writing'});
			try {
				const context = await collectCommitContext({
					root,
					branch: state.detached ? undefined : state.status.branch,
					hasHead: state.hasHead,
					files: state.status.files.filter(
						file => !excluded.includes(file.path),
					),
					includeRepoInstructions: settings.ai.style === 'repo',
				});
				const suggestion = await suggestCommit(
					settings.ai,
					context,
					controller.signal,
				);
				if (controller.signal.aborted) {
					return;
				}

				aiSubjectRef.current = suggestion.subject;
				message.set(suggestion.subject);
				setBody(suggestion.body);
				setAiBranch(suggestion.branch);
				setAi({status: 'done'});
			} catch (error: unknown) {
				if (controller.signal.aborted) {
					return;
				}

				setAi({status: 'failed', reason: shortError(error)});
				setMode(current => (current === 'actions' ? 'edit' : current));
			}
		},
		[excluded, message, root, settings.ai],
	);

	useEffect(() => {
		let cancelled = false;
		loadRepoState(root)
			.then(state => {
				if (cancelled) {
					return;
				}

				setRepo(state);
				const first = reloadTick === 0;
				if (!first || state.status.files.length === 0 || flags.message) {
					return;
				}

				if (settings.ai.provider === 'off') {
					setMode('edit');
				} else {
					void generate(state);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					onDone(
						`✗ ${error instanceof Error ? error.message : String(error)}`,
						1,
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [reloadTick]);

	useEffect(() => {
		if (!repo) {
			return;
		}

		if (!repo.remote || repo.detached) {
			setPr({kind: 'unavailable'});
			return;
		}

		let cancelled = false;
		void (async () => {
			const ready = await ghReady(root);
			if (cancelled) {
				return;
			}

			setGh(ready);
			if (!ready) {
				setPr({kind: 'unavailable'});
				return;
			}

			const found = await viewPr(root, repo.status.branch);
			if (cancelled) {
				return;
			}

			setPr(
				found?.state === 'OPEN'
					? {kind: 'open', number: found.number, url: found.url}
					: {kind: 'none'},
			);
		})();

		return () => {
			cancelled = true;
		};
	}, [repo?.status.branch, repo?.remote]);

	useEffect(
		() => () => {
			abortRef.current?.abort();
		},
		[],
	);

	const run = useCallback(
		async (action: CardAction) => {
			const needsMessage = action.steps.some(
				step => step.kind === 'git' && step.argv[0] === 'commit',
			);
			if (needsMessage && subject.length === 0) {
				editStartRef.current = message.value;
				setMode('edit');
				return;
			}

			abortRef.current?.abort();
			setRunning('starting');
			const result = await runPlan(action.steps, {
				root,
				ai: settings.ai,
				remote: repo?.remote,
				subject,
				onPhase: setRunning,
			});
			let summary = summarizeRun(result);
			if (result.ok && needsMessage && aiAuthored) {
				summary += ` · ✦ ${aiShortName(settings.ai.tag)}`;
			}

			const lines = [summary];

			if (flags.verbose) {
				lines.push(...result.outcomes.map(outcome => `  ${outcome.command}`));
			}

			onDone(lines.join('\n'), result.ok ? 0 : 1);
		},
		[
			aiAuthored,
			flags.verbose,
			message.value,
			onDone,
			repo?.remote,
			root,
			settings.ai,
			subject,
		],
	);

	// Nothing to show: say so and leave.
	useEffect(() => {
		if (!repo || !plan || running !== undefined || flags.yes) {
			return;
		}

		if (plan.clean && pr.kind !== 'loading') {
			onDone(`✓ clean · ${sanitizeSingleLine(repo.status.branch)} up to date`);
		}
	}, [flags.yes, plan, pr.kind, repo, running]);

	// --yes: run the lead action as soon as there is something to run.
	useEffect(() => {
		if (
			!flags.yes ||
			autoRanRef.current ||
			!repo ||
			!plan ||
			running !== undefined ||
			ai.status === 'writing' ||
			pr.kind === 'loading'
		) {
			return;
		}

		autoRanRef.current = true;
		const lead =
			plan.actions.find(action => action.key === 'enter') ?? plan.actions[0];
		if (!lead) {
			onDone(
				plan.notice
					? `! ${plan.notice}`
					: `✓ clean · ${repo.status.branch} up to date`,
			);
			return;
		}

		if (hasChanges && subject.length === 0) {
			onDone(
				`✗ no commit message (${
					ai.status === 'failed' ? ai.reason : 'ai off'
				}) · pass -m`,
				1,
			);
			return;
		}

		void run(lead);
	}, [ai.status, flags.yes, plan, pr.kind, repo, running]);

	const runGitAndReload = async (args: string[], label: string) => {
		setRunning(label);
		const result = await runGit(root, args, {timeoutMs: 120_000});
		setRunning(undefined);
		setFlash(
			result.code === 0
				? `✓ ${label.replace(/ing$/, 'ed')}`
				: `✗ ${firstLine(result.stderr) || label}`,
		);
		setReloadTick(tick => tick + 1);
	};

	const handleActions = (input: string, key: Key) => {
		if (!plan || !repo) {
			return;
		}

		const wanted: ActionKey | undefined = key.return
			? 'enter'
			: actionKeys[input];
		if (wanted) {
			if (ai.status === 'writing') {
				return;
			}

			const action = plan.actions.find(item => item.key === wanted);
			if (action) {
				void run(action);
			}

			return;
		}

		switch (input) {
			case 'e': {
				if (!hasChanges) {
					return;
				}

				abortRef.current?.abort();
				if (ai.status === 'writing') {
					setAi({status: 'idle'});
				}

				editStartRef.current = message.value;
				setMode('edit');
				return;
			}

			case 'g': {
				if (hasChanges && settings.ai.provider !== 'off') {
					void generate(repo);
				}

				return;
			}

			case 'f': {
				if (hasChanges) {
					setMode('files');
				}

				return;
			}

			case 'd': {
				runInTerminal(
					'git',
					repo.hasHead ? ['diff', 'HEAD'] : ['diff', '--cached'],
					root,
				);
				return;
			}

			case '?': {
				setShowPlan(current => !current);
				return;
			}

			case ':': {
				setMode('menu');
				return;
			}

			case 'q': {
				onDone('');
			}
		}

		if (key.escape) {
			if (ai.status === 'writing') {
				abortRef.current?.abort();
				setAi({status: 'idle'});
				editStartRef.current = message.value;
				setMode('edit');
				return;
			}

			onDone('');
		}
	};

	const handleEdit = (input: string, key: Key) => {
		if (key.return) {
			if (subject.length > 0) {
				setMode('actions');
			}

			return;
		}

		if (key.escape) {
			message.set(editStartRef.current);
			setMode('actions');
			if (editStartRef.current.trim().length === 0 && subject.length === 0) {
				onDone('');
			}

			return;
		}

		message.handle(input, key);
	};

	const handleFiles = (input: string, key: Key) => {
		if (key.upArrow || key.downArrow) {
			const delta = key.downArrow ? 1 : -1;
			setFileIndex(
				current => (current + delta + files.length) % Math.max(1, files.length),
			);
			return;
		}

		if (input === ' ') {
			const path = files[fileIndex]?.path;
			if (path) {
				setExcluded(current =>
					current.includes(path)
						? current.filter(item => item !== path)
						: [...current, path],
				);
			}

			return;
		}

		if (input === 'a') {
			setExcluded(current =>
				current.length === 0 ? files.map(file => file.path) : [],
			);
			return;
		}

		if (key.return || key.escape || input === 'f') {
			setMode('actions');
		}
	};

	const handleMenu = (input: string, key: Key) => {
		setMode('actions');
		switch (input) {
			case 'f': {
				void runGitAndReload(['fetch'], 'fetching');
				break;
			}

			case 'u': {
				void runGitAndReload(['pull', '--ff-only'], 'pulling');
				break;
			}

			case 'b': {
				onSwitch('branch');
				break;
			}

			case 'r': {
				onSwitch('pr');
				break;
			}

			case 'c': {
				onSwitch('config');
				break;
			}

			default: {
				if (!key.escape) {
					setMode('menu');
				}
			}
		}
	};

	useStableInput((input, key) => {
		if (running) {
			return;
		}

		if (key.ctrl && input === 'c') {
			abortRef.current?.abort();
			onDone('');
			return;
		}

		setFlash(undefined);
		switch (mode) {
			case 'edit': {
				handleEdit(input, key);
				break;
			}

			case 'files': {
				handleFiles(input, key);
				break;
			}

			case 'menu': {
				handleMenu(input, key);
				break;
			}

			default: {
				handleActions(input, key);
			}
		}
	});

	if (running) {
		return <Spinner label={running} />;
	}

	// While deciding whether there is anything to do, don't flash an empty card.
	if (!repo || !plan || plan.clean) {
		return <Spinner label="reading repo" />;
	}

	const {status} = repo;
	const header = [
		hasChanges
			? `${
					excluded.length > 0
						? `${selected.length}/${files.length}`
						: files.length
			  } file${files.length === 1 ? '' : 's'} +${repo.insertions} −${
					repo.deletions
			  }`
			: undefined,
		status.ahead > 0 ? `↑${status.ahead}` : undefined,
		status.behind > 0 ? `↓${status.behind}` : undefined,
		pr.kind === 'open' ? `PR #${pr.number}` : undefined,
	].filter(Boolean);
	const tag =
		ai.status === 'failed' ? `ai failed · ${ai.reason}` : settings.ai.tag;
	const bodyLines = body.trim() ? body.trim().split('\n').length : 0;

	return (
		<Box flexDirection="column">
			<Text>
				<Text bold>{sanitizeSingleLine(status.branch)}</Text>
				{header.length > 0 ? <Text dimColor> · {header.join(' · ')}</Text> : ''}
				{flash ? <Text dimColor> · {flash}</Text> : ''}
			</Text>

			{hasChanges ? (
				<Box>
					<Box flexGrow={1}>
						<Text color={aiAuthored ? 'magenta' : 'cyan'}>
							{aiAuthored ? '✦ ' : '› '}
						</Text>
						{ai.status === 'writing' ? (
							<Spinner label="writing…" />
						) : (
							<Text>
								<LineInput
									value={message.value}
									cursor={message.cursor}
									active={mode === 'edit'}
									placeholder={
										mode === 'edit' ? 'commit message' : 'e to write a message'
									}
								/>
								{aiAuthored && bodyLines > 0 && mode !== 'edit' ? (
									<Text dimColor>
										{'  '}+{bodyLines} line{bodyLines === 1 ? '' : 's'}
									</Text>
								) : (
									''
								)}
							</Text>
						)}
					</Box>
					<Text dimColor> {tag}</Text>
				</Box>
			) : undefined}

			{mode === 'files'
				? windowedSlice(files, fileIndex, 10).items.map((file, offset) => {
						const index = windowedSlice(files, fileIndex, 10).start + offset;
						const on = !excluded.includes(file.path);
						return (
							<Text
								key={file.path}
								color={index === fileIndex ? 'cyan' : undefined}
							>
								{on ? '[x]' : '[ ]'} {fileStatusLabel(file)}{' '}
								{sanitizeSingleLine(file.path)}
							</Text>
						);
				  })
				: undefined}

			{showPlan && mode === 'actions' ? (
				<Box flexDirection="column">
					{plan.actions.map(action => (
						<Text key={action.key} dimColor wrap="truncate-end">
							{keyLabel(action.key)}{' '}
							{action.steps.map(step => describeStep(step)).join(' && ')}
						</Text>
					))}
					<Text dimColor>
						e edit · g regenerate · f files · d diff · : more · esc quit
					</Text>
				</Box>
			) : undefined}

			<ActionLine
				mode={mode}
				actions={plan.actions}
				notice={plan.notice}
				dim={ai.status === 'writing'}
			/>
		</Box>
	);
}

function ActionLine({
	mode,
	actions,
	notice,
	dim,
}: {
	mode: Mode;
	actions: CardAction[];
	notice: string | undefined;
	dim: boolean;
}) {
	if (mode === 'edit') {
		return <Text dimColor>⏎ done · esc cancel</Text>;
	}

	if (mode === 'files') {
		return <Text dimColor>space toggle · a all · ⏎ done</Text>;
	}

	if (mode === 'menu') {
		return (
			<Text dimColor>
				f fetch · u pull · b branches · r PR · c config · esc back
			</Text>
		);
	}

	return (
		<Text dimColor={dim}>
			{actions.map(action => (
				<Text key={action.key}>
					<Text bold>{keyLabel(action.key)}</Text> {action.label}
					{'   '}
				</Text>
			))}
			{notice ? <Text color="yellow">{notice} </Text> : ''}
			<Text dimColor>?</Text>
		</Text>
	);
}
