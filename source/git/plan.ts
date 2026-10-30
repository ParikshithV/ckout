import {formatCommand, shellQuote} from './format-command.js';
import {type ChangedFile} from './parse-status.js';
import {type RepoState} from './repo.js';

export type Phase = 'branch' | 'commit' | 'push' | 'pull' | 'pr';

export type PlanStep =
	| {kind: 'git'; phase: Exclude<Phase, 'pr'>; argv: string[]}
	| {kind: 'pr'; phase: 'pr'; base: string; head: string};

export type ActionKey = 'enter' | 'b' | 'p';

export type CardAction = {
	key: ActionKey;
	label: string;
	steps: PlanStep[];
};

export type PrState =
	| {kind: 'loading'}
	| {kind: 'unavailable'}
	| {kind: 'none'}
	| {kind: 'open'; number: number; url: string};

export type PlanInput = {
	repo: RepoState;
	/** Files that will be committed. */
	files: ChangedFile[];
	allFiles: boolean;
	subject: string;
	body: string;
	newBranch: string;
	pr: PrState;
	ghReady: boolean;
	noPush: boolean;
	protectedBranches: string[];
};

export type Plan = {
	/** In display order; the first one is what the card leads with. */
	actions: CardAction[];
	/** One short line when there is nothing to run, or why not. */
	notice?: string;
	clean: boolean;
	onDefault: boolean;
};

export function isDefaultLike(
	repo: RepoState,
	protectedBranches: string[],
): boolean {
	const {branch} = repo.status;
	return branch === repo.defaultBranch || protectedBranches.includes(branch);
}

function commitSteps(input: PlanInput): PlanStep[] {
	const message = ['-m', input.subject];
	if (input.body.trim().length > 0) {
		message.push('-m', input.body.trim());
	}

	if (input.allFiles) {
		return [
			{kind: 'git', phase: 'commit', argv: ['add', '-A']},
			{kind: 'git', phase: 'commit', argv: ['commit', ...message]},
		];
	}

	const paths = input.files.flatMap(file =>
		file.origPath ? [file.origPath, file.path] : [file.path],
	);
	return [
		{kind: 'git', phase: 'commit', argv: ['add', '-A', '--', ...paths]},
		{
			kind: 'git',
			phase: 'commit',
			argv: ['commit', ...message, '--', ...paths],
		},
	];
}

function pushStep(
	repo: RepoState,
	branch: string,
	hasUpstream: boolean,
): PlanStep {
	return hasUpstream
		? {kind: 'git', phase: 'push', argv: ['push']}
		: {
				kind: 'git',
				phase: 'push',
				argv: ['push', '-u', repo.remote ?? 'origin', branch],
		  };
}

function branchStep(name: string): PlanStep {
	return {kind: 'git', phase: 'branch', argv: ['switch', '-c', name]};
}

/**
 * Pick what ⏎, b and p do for the current repo state. Mirrors T3 Code's
 * quick-action rules, minus the parts that need a hosted UI.
 */
export function resolvePlan(input: PlanInput): Plan {
	const {repo} = input;
	const {status} = repo;
	const onDefault = isDefaultLike(repo, input.protectedBranches);
	const hasChanges = input.files.length > 0;
	const canPush = Boolean(repo.remote) && !input.noPush;
	const canPr =
		canPush && input.ghReady && Boolean(repo.defaultBranch) && !repo.detached;
	const hasUpstream = Boolean(status.upstream);
	const openPr = input.pr.kind === 'open';
	const branch = status.branch;
	const plan = (actions: CardAction[], notice?: string): Plan => ({
		actions,
		notice,
		clean: actions.length === 0 && !notice,
		onDefault,
	});

	if (repo.detached) {
		if (!hasChanges) {
			return plan([], 'detached HEAD · nothing to do');
		}

		return plan([
			{
				key: 'b',
				label: 'branch',
				steps: [
					branchStep(input.newBranch),
					...commitSteps(input),
					...(canPush ? [pushStep(repo, input.newBranch, false)] : []),
				],
			},
		]);
	}

	if (hasChanges) {
		const here: CardAction = {
			key: 'enter',
			label: canPush ? 'push' : 'commit',
			steps: [
				...commitSteps(input),
				...(canPush ? [pushStep(repo, branch, hasUpstream)] : []),
			],
		};
		const onBranch: CardAction = {
			key: 'b',
			label: 'branch',
			steps: [
				branchStep(input.newBranch),
				...commitSteps(input),
				...(canPush ? [pushStep(repo, input.newBranch, false)] : []),
			],
		};
		const actions: CardAction[] = [here, onBranch];

		if (canPr && (onDefault || !openPr)) {
			const head = onDefault ? input.newBranch : branch;
			actions.push({
				key: 'p',
				label: 'PR',
				steps: [
					...(onDefault ? [branchStep(input.newBranch)] : []),
					...commitSteps(input),
					pushStep(repo, head, onDefault ? false : hasUpstream),
					{kind: 'pr', phase: 'pr', base: repo.defaultBranch ?? 'main', head},
				],
			});
		}

		return plan(
			onDefault ? [...actions.slice(1), here] : actions,
			status.behind > 0 ? `behind ↓${status.behind}` : undefined,
		);
	}

	if (!repo.remote || input.noPush) {
		return plan([]);
	}

	const prAction = (withPush: boolean): CardAction => ({
		key: 'p',
		label: 'PR',
		steps: [
			...(withPush ? [pushStep(repo, branch, hasUpstream)] : []),
			{
				kind: 'pr',
				phase: 'pr',
				base: repo.defaultBranch ?? 'main',
				head: branch,
			},
		],
	});
	const wantsPr = canPr && !onDefault && !openPr;

	if (!hasUpstream) {
		const unpublished = onDefault ? status.ahead : repo.aheadOfDefault;
		if (!repo.hasHead || (unpublished === 0 && repo.defaultBranch)) {
			return plan([]);
		}

		const actions: CardAction[] = [
			{key: 'enter', label: 'publish', steps: [pushStep(repo, branch, false)]},
		];
		if (wantsPr) {
			actions.push(prAction(true));
		}

		return plan(actions);
	}

	if (status.ahead > 0 && status.behind > 0) {
		return plan(
			[],
			`diverged ↑${status.ahead} ↓${status.behind} · rebase or merge first`,
		);
	}

	if (status.behind > 0) {
		return plan([
			{
				key: 'enter',
				label: 'pull',
				steps: [{kind: 'git', phase: 'pull', argv: ['pull', '--ff-only']}],
			},
		]);
	}

	if (status.ahead > 0) {
		const actions: CardAction[] = [
			{key: 'enter', label: 'push', steps: [pushStep(repo, branch, true)]},
		];
		if (wantsPr) {
			actions.push(prAction(true));
		}

		return plan(actions);
	}

	if (wantsPr && repo.aheadOfDefault > 0 && input.pr.kind === 'none') {
		return plan([{...prAction(false), key: 'enter'}]);
	}

	return plan([]);
}

export function describeStep(step: PlanStep): string {
	if (step.kind === 'pr') {
		return `gh pr create --base ${shellQuote(step.base)} --head ${shellQuote(
			step.head,
		)} --title … --body …`;
	}

	return formatCommand(step.argv);
}

export function keyLabel(key: ActionKey): string {
	return key === 'enter' ? '⏎' : key;
}
