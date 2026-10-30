import React, {useEffect, useState} from 'react';
import {Text, Box} from 'ink';
import {Spinner} from '@inkjs/ui';
import {type MergeMethod} from '../ai/config.js';
import {
	formatChecks,
	ghReady,
	prActionArgs,
	runGh,
	viewPr,
	type PrAction,
	type PullRequest,
} from '../git/gh.js';
import {isDefaultLike, type PlanStep} from '../git/plan.js';
import {loadRepoState, type RepoState} from '../git/repo.js';
import {firstLine, runGit} from '../git/run.js';
import {runPlan, summarizeRun} from '../git/runner.js';
import {useStableInput} from '../hooks/use-stable-input.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';
import {type ViewProps} from '../types.js';

type CardKey = {key: string; label: string; action: PrAction | 'create'};

const methods: MergeMethod[] = ['squash', 'merge', 'rebase'];
const risky = new Set<PrAction | 'create'>(['merge', 'auto-merge', 'close']);

const doneLabels: Record<PrAction, string> = {
	merge: 'merged',
	'auto-merge': 'auto-merge on',
	'disable-auto-merge': 'auto-merge off',
	ready: 'ready for review',
	draft: 'back to draft',
	close: 'closed',
	reopen: 'reopened',
	open: 'opened in browser',
};

export function prKeys(pr: PullRequest, method: MergeMethod): CardKey[] {
	if (pr.state === 'MERGED') {
		return [{key: 'o', label: 'open', action: 'open'}];
	}

	if (pr.state === 'CLOSED') {
		return [
			{key: 'enter', label: 'reopen', action: 'reopen'},
			{key: 'o', label: 'open', action: 'open'},
		];
	}

	if (pr.isDraft) {
		return [
			{key: 'enter', label: 'ready', action: 'ready'},
			{key: 'o', label: 'open', action: 'open'},
			{key: 'x', label: 'close', action: 'close'},
		];
	}

	return [
		{key: 'enter', label: `merge (${method})`, action: 'merge'},
		pr.autoMerge
			? {key: 'a', label: 'auto off', action: 'disable-auto-merge'}
			: {key: 'a', label: 'auto-merge', action: 'auto-merge'},
		{key: 'd', label: 'draft', action: 'draft'},
		{key: 'o', label: 'open', action: 'open'},
		{key: 'x', label: 'close', action: 'close'},
	];
}

export function prHeadline(pr: PullRequest): string {
	const state =
		pr.isDraft && pr.state === 'OPEN' ? 'draft' : pr.state.toLowerCase();
	return [
		state,
		formatChecks(pr.checks),
		pr.mergeable === 'CONFLICTING' ? 'conflicts' : '',
		pr.reviewDecision === 'APPROVED'
			? 'approved'
			: pr.reviewDecision === 'CHANGES_REQUESTED'
			? 'changes requested'
			: '',
		pr.autoMerge ? 'auto-merge on' : '',
	]
		.filter(Boolean)
		.join(' · ');
}

export default function PrCard({root, settings, onDone, onSwitch}: ViewProps) {
	const [repo, setRepo] = useState<RepoState | undefined>();
	const [pr, setPr] = useState<PullRequest | undefined | 'none'>();
	const [method, setMethod] = useState<MergeMethod>(settings.mergeMethod);
	const [armed, setArmed] = useState<CardKey | undefined>();
	const [running, setRunning] = useState<string | undefined>();

	useEffect(() => {
		void (async () => {
			if (!(await ghReady(root))) {
				onDone(
					'✗ no GitHub repo here, or gh is not logged in (gh auth login)',
					1,
				);
				return;
			}

			const state = await loadRepoState(root);
			setRepo(state);
			setPr((await viewPr(root, state.status.branch)) ?? 'none');
		})().catch((error: unknown) => {
			onDone(`✗ ${error instanceof Error ? error.message : String(error)}`, 1);
		});
	}, []);

	const keys: CardKey[] =
		pr && pr !== 'none'
			? prKeys(pr, method)
			: repo &&
			  !repo.detached &&
			  !isDefaultLike(repo, settings.protectedBranches)
			? [{key: 'enter', label: 'create PR', action: 'create'}]
			: [];

	const nothingToDo = repo !== undefined && pr === 'none' && keys.length === 0;
	useEffect(() => {
		if (nothingToDo && repo) {
			onDone(`· ${sanitizeSingleLine(repo.status.branch)} has no PR`);
		}
	}, [nothingToDo]);

	const createPr = async (state: RepoState) => {
		const {status} = state;
		const steps: PlanStep[] = [];
		if (!status.upstream || status.ahead > 0) {
			steps.push({
				kind: 'git',
				phase: 'push',
				argv: status.upstream
					? ['push']
					: ['push', '-u', state.remote ?? 'origin', status.branch],
			});
		}

		steps.push({
			kind: 'pr',
			phase: 'pr',
			base: state.defaultBranch ?? 'main',
			head: status.branch,
		});
		const subject = (
			await runGit(root, ['log', '-1', '--pretty=format:%s'])
		).stdout.trim();
		const result = await runPlan(steps, {
			root,
			ai: settings.ai,
			remote: state.remote,
			subject: subject || status.branch,
			onPhase: setRunning,
		});
		onDone(summarizeRun(result), result.ok ? 0 : 1);
	};

	const perform = async (item: CardKey) => {
		if (item.action === 'create') {
			if (repo) {
				await createPr(repo);
			}

			return;
		}

		if (!pr || pr === 'none') {
			return;
		}

		setRunning(item.label);
		const result = await runGh(
			root,
			prActionArgs(item.action, pr.number, method),
		);
		if (result.code !== 0) {
			onDone(`✗ ${firstLine(result.stderr) || `${item.label} failed`}`, 1);
			return;
		}

		let suffix = '';
		if (item.action === 'merge') {
			const branch = (
				await runGit(root, ['branch', '--show-current'])
			).stdout.trim();
			suffix = ` (${method}) · on ${branch}`;
		}

		onDone(`✓ #${pr.number} ${doneLabels[item.action]}${suffix}`);
	};

	useStableInput((input, key) => {
		if (running) {
			return;
		}

		if ((key.ctrl && input === 'c') || input === 'q') {
			onDone('');
			return;
		}

		if (key.escape) {
			if (armed) {
				setArmed(undefined);
			} else {
				onDone('');
			}

			return;
		}

		if (input === 's') {
			setMethod(
				current => methods[(methods.indexOf(current) + 1) % methods.length]!,
			);
			setArmed(undefined);
			return;
		}

		if (input === ':') {
			onSwitch('commit');
			return;
		}

		const pressed = key.return ? 'enter' : input;
		const item = keys.find(entry => entry.key === pressed);
		if (!item) {
			setArmed(undefined);
			return;
		}

		if (risky.has(item.action) && armed?.action !== item.action) {
			setArmed(item);
			return;
		}

		setArmed(undefined);
		void perform(item);
	});

	if (running) {
		return <Spinner label={running} />;
	}

	if (!repo || pr === undefined) {
		return <Spinner label="looking up PR" />;
	}

	const branch = sanitizeSingleLine(repo.status.branch);

	if (pr === 'none') {
		if (nothingToDo) {
			return null;
		}

		return (
			<Box flexDirection="column">
				<Text>
					<Text bold>{branch}</Text>
					<Text dimColor> · no PR</Text>
				</Text>
				<Text>
					<Text bold>⏎</Text> create PR<Text dimColor>{'   '}esc</Text>
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text>
				<Text bold>#{pr.number}</Text> {sanitizeSingleLine(pr.title)}
				<Text dimColor> · {prHeadline(pr)}</Text>
			</Text>
			{armed ? (
				<Text color="yellow">
					{armed.key === 'enter' ? '⏎' : armed.key} again to {armed.label}
					<Text dimColor> · esc cancel</Text>
				</Text>
			) : (
				<Text>
					{keys.map(item => (
						<Text key={item.key}>
							<Text bold>{item.key === 'enter' ? '⏎' : item.key}</Text>{' '}
							{item.label}
							{'   '}
						</Text>
					))}
					{pr.state === 'OPEN' && !pr.isDraft ? (
						<Text dimColor>s method</Text>
					) : (
						''
					)}
				</Text>
			)}
		</Box>
	);
}
