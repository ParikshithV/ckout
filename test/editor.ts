import test from 'ava';
import {isGuiEditor, parseEditorCommand} from '../source/editor.js';

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
	t.false(isGuiEditor('vim'));
});
