import test from 'ava';
import {
	editorAttempts,
	isGuiEditor,
	parseEditorCommand,
	splitEditorCommand,
} from '../source/editor.js';

test('parseEditorCommand splits binary and args', t => {
	t.deepEqual(parseEditorCommand('cursor'), {bin: 'cursor', extraArgs: []});
	t.deepEqual(parseEditorCommand('code -g'), {
		bin: 'code',
		extraArgs: ['-g'],
	});
	t.deepEqual(parseEditorCommand('"my editor" --wait -n'), {
		bin: 'my editor',
		extraArgs: ['--wait', '-n'],
	});
});

test('splitEditorCommand handles quotes and escapes', t => {
	t.deepEqual(splitEditorCommand(''), []);
	t.deepEqual(splitEditorCommand('editor "" --wait'), ['editor', '', '--wait']);
	t.deepEqual(splitEditorCommand('vim -u NONE'), ['vim', '-u', 'NONE']);
	t.deepEqual(splitEditorCommand(`'C:\\Program Files\\Editor' --wait`), [
		'C:\\Program Files\\Editor',
		'--wait',
	]);
	t.deepEqual(splitEditorCommand(`"my custom editor" "arg with spaces"`), [
		'my custom editor',
		'arg with spaces',
	]);
	t.deepEqual(splitEditorCommand('"C:\\Program Files\\Editor" --wait'), [
		'C:\\Program Files\\Editor',
		'--wait',
	]);
	t.deepEqual(splitEditorCommand('editor "say \\"hello\\""'), [
		'editor',
		'say "hello"',
	]);
	t.deepEqual(splitEditorCommand('editor trailing\\'), [
		'editor',
		'trailing\\',
	]);
});

test('cursor and code are treated as GUI editors', t => {
	t.true(isGuiEditor('cursor'));
	t.true(isGuiEditor('/usr/local/bin/code'));
	t.true(isGuiEditor('open'));
	t.false(isGuiEditor('vim'));
});

test('editorAttempts puts the preferred command first and skips duplicates', t => {
	const attempts = editorAttempts({bin: 'cursor', extraArgs: []});
	t.deepEqual(attempts[0], {bin: 'cursor', extraArgs: []});
	t.is(attempts.filter(item => item.bin === 'cursor').length, 1);
	t.true(attempts.some(item => item.bin === 'vi'));
});
