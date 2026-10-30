import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import {
	displayName,
	fuzzyMatch,
	switchArgs,
} from '../source/ui/branch-picker.js';
import {aiShortName} from '../source/ui/commit-card.js';
import {fieldsFor, modelRows} from '../source/ui/config-view.js';
import {LineInput} from '../source/ui/line-input.js';
import {prHeadline, prKeys} from '../source/ui/pr-card.js';
import {type PullRequest} from '../source/git/gh.js';

const pr: PullRequest = {
	number: 3,
	url: 'u',
	title: 'T',
	state: 'OPEN',
	isDraft: false,
	baseRefName: 'main',
	headRefName: 'feat/x',
	mergeable: 'CONFLICTING',
	reviewDecision: 'APPROVED',
	autoMerge: false,
	checks: {passed: 2, failed: 0, pending: 0},
};

test('fuzzyMatch matches subsequences', t => {
	t.true(fuzzyMatch('feat/ai-commit', 'fai'));
	t.false(fuzzyMatch('main', 'xm'));
	t.true(fuzzyMatch('anything', ''));
});

test('remote branches switch with tracking', t => {
	const remote = {name: 'remotes/origin/feat/y', current: false, remote: true};
	t.is(displayName(remote), 'origin/feat/y');
	t.deepEqual(switchArgs(remote), [
		'switch',
		'-c',
		'feat/y',
		'--track',
		'origin/feat/y',
	]);
	t.deepEqual(switchArgs({name: 'main', current: false, remote: false}), [
		'switch',
		'main',
	]);
});

test('PR keys follow PR state', t => {
	t.deepEqual(
		prKeys(pr, 'squash').map(item => item.label),
		['merge (squash)', 'auto-merge', 'draft', 'open', 'close'],
	);
	t.deepEqual(
		prKeys({...pr, isDraft: true}, 'squash').map(item => item.action),
		['ready', 'open', 'close'],
	);
	t.deepEqual(
		prKeys({...pr, state: 'MERGED'}, 'squash').map(item => item.action),
		['open'],
	);
	t.is(prHeadline(pr), 'open · ✓ 2/2 checks · conflicts · approved');
});

test('config asks for a key only when its env var is missing', t => {
	const withEnv = fieldsFor('anthropic', {}, {ANTHROPIC_API_KEY: 'k'}).map(
		field => field.id,
	);
	t.deepEqual(withEnv, ['model', 'style']);
	const without = fieldsFor('openai', {}, {}).map(field => field.id);
	t.deepEqual(without, ['baseUrl', 'apiKey', 'model', 'style']);
	const custom = fieldsFor('codex-cli', {}, {}, {style: 'custom'}).map(
		field => field.id,
	);
	t.deepEqual(custom, ['model', 'style', 'instructions']);
	t.deepEqual(fieldsFor('off', {}, {}), []);
});

test('aiShortName keeps the model part of the tag', t => {
	t.is(aiShortName('claude-haiku · key'), 'claude-haiku');
	t.is(aiShortName('claude cli'), 'claude cli');
});

test('LineInput shows a placeholder and a cursor', t => {
	const empty = render(
		<LineInput active value="" cursor={0} placeholder="branch" />,
	);
	t.true((empty.lastFrame() ?? '').includes('branch'));
	const typed = render(<LineInput active={false} value="fix it" cursor={3} />);
	t.is(typed.lastFrame(), 'fix it');
});

test('modelRows filters and offers the typed name', t => {
	const models = [
		{id: ''},
		{id: 'gpt-6-luna', note: 'fast'},
		{id: 'gpt-5.6-terra'},
	];
	t.deepEqual(
		modelRows(models, 'luna').map(row => row.id),
		['luna', 'gpt-6-luna'],
	);
	t.deepEqual(
		modelRows(models, 'gpt-6-luna').map(row => row.id),
		['gpt-6-luna'],
	);
	t.is(modelRows(models, '').length, 3);
});
