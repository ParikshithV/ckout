import test from 'ava';
import {
	formatChecks,
	parsePr,
	prActionArgs,
	prNumberFromUrl,
	summarizeChecks,
} from '../source/git/gh.js';
import {sumNumstat} from '../source/git/repo.js';
import {summarizeRun} from '../source/git/runner.js';

test('summarizeChecks handles check runs and status contexts', t => {
	t.deepEqual(
		summarizeChecks([
			{status: 'COMPLETED', conclusion: 'SUCCESS'},
			{status: 'IN_PROGRESS', conclusion: ''},
			{status: 'COMPLETED', conclusion: 'FAILURE'},
			{state: 'SUCCESS'},
			{state: 'PENDING'},
		]),
		{passed: 2, failed: 1, pending: 2},
	);
});

test('formatChecks reads at a glance', t => {
	t.is(formatChecks({passed: 4, failed: 0, pending: 0}), '✓ 4/4 checks');
	t.is(formatChecks({passed: 2, failed: 0, pending: 1}), '… 2/3 checks');
	t.is(formatChecks({passed: 2, failed: 1, pending: 0}), '✗ 1/3 checks');
	t.is(formatChecks({passed: 0, failed: 0, pending: 0}), '');
});

test('parsePr flattens gh JSON', t => {
	const pr = parsePr(
		JSON.stringify({
			number: 7,
			url: 'https://github.com/o/r/pull/7',
			title: 'T',
			state: 'OPEN',
			isDraft: false,
			baseRefName: 'main',
			headRefName: 'feat/x',
			mergeable: 'MERGEABLE',
			reviewDecision: '',
			autoMergeRequest: null,
			statusCheckRollup: [{status: 'COMPLETED', conclusion: 'SUCCESS'}],
		}),
	);
	t.is(pr.number, 7);
	t.false(pr.autoMerge);
	t.deepEqual(pr.checks, {passed: 1, failed: 0, pending: 0});
});

test('prActionArgs maps actions to gh', t => {
	t.deepEqual(prActionArgs('merge', 7, 'squash'), [
		'pr',
		'merge',
		'7',
		'--squash',
		'--delete-branch',
	]);
	t.deepEqual(prActionArgs('auto-merge', 7, 'rebase'), [
		'pr',
		'merge',
		'7',
		'--rebase',
		'--auto',
	]);
	t.deepEqual(prActionArgs('draft', 7, 'merge'), [
		'pr',
		'ready',
		'7',
		'--undo',
	]);
});

test('prNumberFromUrl', t => {
	t.is(prNumberFromUrl('https://github.com/o/r/pull/42'), 42);
	t.is(prNumberFromUrl('nope'), undefined);
});

test('sumNumstat ignores binary rows', t => {
	t.deepEqual(sumNumstat('3\t1\ta\n-\t-\tbin\n2\t0\tb\n'), {
		insertions: 5,
		deletions: 1,
	});
});

test('summarizeRun gives one line, and a second on failure', t => {
	t.is(
		summarizeRun({
			ok: true,
			outcomes: [],
			branch: 'feat/x',
			sha: 'abc1234',
			pushedTo: 'origin/feat/x',
			pr: {number: 4, url: 'https://x/pull/4', existing: false},
		}),
		'✓ feat/x · abc1234 → origin/feat/x · PR #4 https://x/pull/4',
	);
	t.is(
		summarizeRun({
			ok: false,
			outcomes: [],
			sha: 'abc1234',
			error: {phase: 'push', message: 'rejected'},
		}),
		'✓ abc1234\n✗ push: rejected',
	);
});
