import test from 'ava';
import {
	editorAttempts,
	isGuiEditor,
	parseEditorCommand,
} from '../source/editor.js';

test('parseEditorCommand splits binary and args', t => {
	t.deepEqual(parseEditorCommand('cursor'), {bin: 'cursor', extraArgs: []});
	t.deepEqual(parseEditorCommand('code -g'), {
		bin: 'code',
		extraArgs: ['-g'],
	});
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
