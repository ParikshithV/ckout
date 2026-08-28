import test from 'ava';
import {fileStatusLabel, parseStatus} from '../source/git/parse-status.js';
import {parseBranches} from '../source/git/parse-branches.js';

test('parseStatus reads branch tracking and files', t => {
	const status = parseStatus(
		[
			'## main...origin/main [ahead 1, behind 2]',
			' M source/app.tsx',
			'A  staged.txt',
			'?? new.md',
		].join('\n'),
	);

	t.is(status.branch, 'main');
	t.is(status.upstream, 'origin/main');
	t.is(status.ahead, 1);
	t.is(status.behind, 2);
	t.is(status.files.length, 3);
	t.true(status.files[0]?.unstaged);
	t.true(status.files[1]?.staged);
	t.true(status.files[2]?.untracked);
	t.is(fileStatusLabel(status.files[2]!), '??');
});

test('parseStatus handles feature branches and empty repos', t => {
	t.is(
		parseStatus('## feature/foo...origin/feature/foo').branch,
		'feature/foo',
	);
	t.is(parseStatus('## No commits yet on main').branch, 'main');
});

test('parseBranches marks the current branch', t => {
	const branches = parseBranches(
		['* main', '  feature', '  remotes/origin/main'].join('\n'),
	);
	t.deepEqual(
		branches.map(branch => [branch.name, branch.current, branch.remote]),
		[
			['main', true, false],
			['feature', false, false],
		],
	);
});

test('parseBranches keeps remotes that have no local branch', t => {
	const branches = parseBranches(
		['* main', '  remotes/origin/main', '  remotes/origin/pr-12'].join('\n'),
	);
	t.deepEqual(
		branches.map(branch => branch.name),
		['main', 'remotes/origin/pr-12'],
	);
});
