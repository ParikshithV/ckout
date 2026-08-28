import test from 'ava';
import {
	formatCommand,
	formatPipeline,
	shellQuote,
} from '../source/git/format-command.js';
import {runGit} from '../source/git/run.js';

test('shellQuote wraps unsafe arguments', t => {
	t.is(shellQuote('hello'), 'hello');
	t.is(shellQuote('hello world'), `'hello world'`);
	t.is(shellQuote(`it's`), `'it'\\''s'`);
});

test('formatCommand matches spawned argv display', t => {
	t.is(formatCommand(['commit', '-m', 'hi']), `git commit -m hi`);
	t.is(
		formatCommand(['commit', '-m', 'fix the thing']),
		`git commit -m 'fix the thing'`,
	);
});

test('formatPipeline joins commands', t => {
	t.is(
		formatPipeline([
			['add', '-A'],
			['commit', '-m', 'hi'],
		]),
		'git add -A && git commit -m hi',
	);
});

test('runGit command string matches formatCommand', async t => {
	const args = ['--version'];
	const result = await runGit(process.cwd(), args);
	t.is(result.command, formatCommand(args));
	t.is(result.code, 0);
	t.true(result.stdout.includes('git version'));
});
