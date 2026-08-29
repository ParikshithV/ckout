import test from 'ava';
import {
	deleteAtCursor,
	deleteBeforeCursor,
	deleteToStart,
	deleteWordBeforeCursor,
	insertAtCursor,
	isBackwardDeleteKey,
	isPrintable,
	nextPromptMode,
	promptPlaceholder,
} from '../source/prompt.js';

test('tab cycles prompt modes while typing', t => {
	t.is(nextPromptMode('checkout'), 'commit');
	t.is(nextPromptMode('commit'), 'filter');
	t.is(nextPromptMode('filter'), 'checkout');
});

test('placeholders describe the mode', t => {
	t.is(promptPlaceholder('checkout'), 'Branch to checkout or create');
	t.is(promptPlaceholder('commit'), 'Commit message');
	t.is(promptPlaceholder('filter'), 'Filter files');
});

test('isPrintable accepts paste and rejects control keys', t => {
	t.true(isPrintable('fix the readme', {ctrl: false, meta: false}));
	t.true(isPrintable('e', {ctrl: false, meta: false}));
	t.false(isPrintable('e', {ctrl: true, meta: false}));
	t.false(isPrintable('', {ctrl: false, meta: false}));
});

test('both Ink Backspace key names delete backward', t => {
	t.true(isBackwardDeleteKey({backspace: true, delete: false}));
	t.true(isBackwardDeleteKey({backspace: false, delete: true}));
	t.false(isBackwardDeleteKey({backspace: false, delete: false}));
});

test('insertAtCursor inserts text and updates cursor position', t => {
	t.deepEqual(insertAtCursor('helloworld', 5, ' '), {
		value: 'hello world',
		cursor: 6,
	});
	t.deepEqual(insertAtCursor('test', 0, 'pre-'), {
		value: 'pre-test',
		cursor: 4,
	});
	t.deepEqual(insertAtCursor('test', 4, '-post'), {
		value: 'test-post',
		cursor: 9,
	});
});

test('deleteBeforeCursor handles backspace at different positions', t => {
	t.deepEqual(deleteBeforeCursor('hello', 5), {
		value: 'hell',
		cursor: 4,
	});
	t.deepEqual(deleteBeforeCursor('hello', 2), {
		value: 'hllo',
		cursor: 1,
	});
	t.deepEqual(deleteBeforeCursor('hello', 0), {
		value: 'hello',
		cursor: 0,
	});
});

test('cursor editing preserves multi-code-unit characters', t => {
	t.deepEqual(deleteBeforeCursor('fix 😀', 5), {
		value: 'fix ',
		cursor: 4,
	});
	t.deepEqual(insertAtCursor('ab', 1, '😀'), {
		value: 'a😀b',
		cursor: 2,
	});
});

test('deleteAtCursor handles delete key at different positions', t => {
	t.deepEqual(deleteAtCursor('hello', 0), {
		value: 'ello',
		cursor: 0,
	});
	t.deepEqual(deleteAtCursor('hello', 2), {
		value: 'helo',
		cursor: 2,
	});
	t.deepEqual(deleteAtCursor('hello', 5), {
		value: 'hello',
		cursor: 5,
	});
});

test('deleteWordBeforeCursor and deleteToStart handle line/word operations', t => {
	t.deepEqual(deleteWordBeforeCursor('feat: add support', 17), {
		value: 'feat: add ',
		cursor: 10,
	});
	t.deepEqual(deleteToStart('git checkout branch', 12), {
		value: ' branch',
		cursor: 0,
	});
});
