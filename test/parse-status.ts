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

test('parseStatus handles NUL-delimited status output and special filenames', t => {
	const nulOutput = [
		'## main...origin/main [ahead 2, behind 1]',
		' M file with spaces.txt',
		'?? "quoted" name.txt',
		'RM renamed destination.ts',
		'source origin.ts',
		'MM mixed.txt',
		'',
	].join('\0');

	const status = parseStatus(nulOutput);
	t.is(status.branch, 'main');
	t.is(status.ahead, 2);
	t.is(status.behind, 1);
	t.is(status.files.length, 4);

	t.is(status.files[0]?.path, 'file with spaces.txt');
	t.true(status.files[0]?.unstaged);

	t.is(status.files[1]?.path, '"quoted" name.txt');
	t.true(status.files[1]?.untracked);

	t.is(status.files[2]?.path, 'renamed destination.ts');
	t.is(status.files[2]?.origPath, 'source origin.ts');
	t.true(status.files[2]?.staged);
	t.true(status.files[2]?.unstaged);

	t.is(status.files[3]?.path, 'mixed.txt');
	t.true(status.files[3]?.staged);
	t.true(status.files[3]?.unstaged);
});

test('parseStatus handles feature branches and empty repos', t => {
	t.is(
		parseStatus('## feature/foo...origin/feature/foo').branch,
		'feature/foo',
	);
	t.is(parseStatus('## No commits yet on main').branch, 'main');
});

test('parseStatus decodes C-quoted octal paths in legacy output', t => {
	const status = parseStatus(String.raw`## main
?? "caf\303\251 file.txt"`);
	t.is(status.files[0]?.path, 'café file.txt');
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

test('parseBranches handles linked worktrees and remote symbolic HEAD', t => {
	const branches = parseBranches(
		[
			'* main',
			'+ worktree-branch',
			'  feature-1',
			'  remotes/origin/HEAD -> origin/main',
			'  remotes/origin/main',
			'  remotes/origin/feature-2',
		].join('\n'),
	);

	t.deepEqual(
		branches.map(branch => [branch.name, branch.current, branch.remote]),
		[
			['main', true, false],
			['worktree-branch', false, false],
			['feature-1', false, false],
			['remotes/origin/feature-2', false, true],
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
