import test from 'ava';
import {resolvePlan, type PlanInput} from '../source/git/plan.js';
import {type RepoState} from '../source/git/repo.js';
import {type ChangedFile} from '../source/git/parse-status.js';

const file: ChangedFile = {
	path: 'a.txt',
	index: ' ',
	worktree: 'M',
	staged: false,
	unstaged: true,
	untracked: false,
};

function repo(
	overrides: Partial<RepoState['status']> = {},
	extra: Partial<RepoState> = {},
): RepoState {
	return {
		root: '/repo',
		status: {
			branch: 'feat/x',
			upstream: 'origin/feat/x',
			ahead: 0,
			behind: 0,
			files: [file],
			dirty: true,
			...overrides,
		},
		hasHead: true,
		detached: false,
		remote: 'origin',
		defaultBranch: 'main',
		aheadOfDefault: 0,
		insertions: 1,
		deletions: 0,
		branches: [],
		...extra,
	};
}

function input(
	state: RepoState,
	overrides: Partial<PlanInput> = {},
): PlanInput {
	return {
		repo: state,
		files: state.status.files,
		allFiles: true,
		subject: 'Do the thing',
		body: '',
		newBranch: 'feat/thing',
		pr: {kind: 'none'},
		ghReady: true,
		noPush: false,
		protectedBranches: [],
		...overrides,
	};
}

const argvs = (plan: ReturnType<typeof resolvePlan>, key: string) =>
	plan.actions
		.find(action => action.key === key)
		?.steps.map(step =>
			step.kind === 'git'
				? step.argv.join(' ')
				: `pr ${step.base}<-${step.head}`,
		);

test('changes on a feature branch: ⏎ commits and pushes, p opens a PR here', t => {
	const plan = resolvePlan(input(repo()));
	t.deepEqual(
		plan.actions.map(action => action.key),
		['enter', 'b', 'p'],
	);
	t.deepEqual(argvs(plan, 'enter'), [
		'add -A',
		'commit -m Do the thing',
		'push',
	]);
	t.deepEqual(argvs(plan, 'p'), [
		'add -A',
		'commit -m Do the thing',
		'push',
		'pr main<-feat/x',
	]);
	t.deepEqual(argvs(plan, 'b'), [
		'switch -c feat/thing',
		'add -A',
		'commit -m Do the thing',
		'push -u origin feat/thing',
	]);
});

test('changes on the default branch lead with the new-branch actions', t => {
	const plan = resolvePlan(
		input(repo({branch: 'main', upstream: 'origin/main'})),
	);
	t.true(plan.onDefault);
	t.deepEqual(
		plan.actions.map(action => action.key),
		['b', 'p', 'enter'],
	);
	t.deepEqual(argvs(plan, 'p'), [
		'switch -c feat/thing',
		'add -A',
		'commit -m Do the thing',
		'push -u origin feat/thing',
		'pr main<-feat/thing',
	]);
});

test('an open PR hides p on a feature branch', t => {
	const plan = resolvePlan(
		input(repo(), {pr: {kind: 'open', number: 4, url: 'u'}}),
	);
	t.deepEqual(
		plan.actions.map(action => action.key),
		['enter', 'b'],
	);
});

test('no remote: ⏎ only commits and p is not offered', t => {
	const plan = resolvePlan(
		input(repo({upstream: undefined}, {remote: undefined})),
	);
	const enter = plan.actions.find(action => action.key === 'enter');
	t.is(enter?.label, 'commit');
	t.false(plan.actions.some(action => action.key === 'p'));
});

test('--no-push commits only', t => {
	const plan = resolvePlan(input(repo(), {noPush: true}));
	t.deepEqual(argvs(plan, 'enter'), ['add -A', 'commit -m Do the thing']);
});

test('a body becomes a second -m', t => {
	const plan = resolvePlan(input(repo(), {body: '- detail'}));
	t.deepEqual(argvs(plan, 'enter')?.[1], 'commit -m Do the thing -m - detail');
});

test('picking some files commits only those paths', t => {
	const other = {...file, path: 'b.txt'};
	const state = repo({files: [file, other]});
	const plan = resolvePlan(input(state, {files: [other], allFiles: false}));
	t.deepEqual(argvs(plan, 'enter')?.slice(0, 2), [
		'add -A -- b.txt',
		'commit -m Do the thing -- b.txt',
	]);
});

test('unpublished branch: ⏎ pushes with -u', t => {
	const state = repo({upstream: undefined, files: []}, {aheadOfDefault: 2});
	const plan = resolvePlan(input(state, {files: []}));
	t.deepEqual(argvs(plan, 'enter'), ['push -u origin feat/x']);
	t.is(plan.actions[0]?.label, 'publish');
});

test('behind: ⏎ pulls; diverged: nothing to run, with a notice', t => {
	const behind = resolvePlan(input(repo({files: [], behind: 2}), {files: []}));
	t.deepEqual(argvs(behind, 'enter'), ['pull --ff-only']);

	const diverged = resolvePlan(
		input(repo({files: [], behind: 1, ahead: 1}), {files: []}),
	);
	t.deepEqual(diverged.actions, []);
	t.regex(diverged.notice ?? '', /diverged ↑1 ↓1/);
	t.false(diverged.clean);
});

test('clean and up to date is clean, unless the branch still needs a PR', t => {
	const clean = resolvePlan(input(repo({files: []}), {files: []}));
	t.true(clean.clean);

	const needsPr = resolvePlan(
		input(repo({files: []}, {aheadOfDefault: 3}), {files: []}),
	);
	t.deepEqual(argvs(needsPr, 'enter'), ['pr main<-feat/x']);
});

test('detached HEAD only offers a new branch', t => {
	const plan = resolvePlan(input(repo({branch: 'HEAD'}, {detached: true})));
	t.deepEqual(
		plan.actions.map(action => action.key),
		['b'],
	);
});

test('protected branches count as default', t => {
	const plan = resolvePlan(
		input(repo({branch: 'release'}), {protectedBranches: ['release']}),
	);
	t.true(plan.onDefault);
});
