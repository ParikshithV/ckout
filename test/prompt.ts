import test from 'ava';
import {
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
});

test('isPrintable accepts paste and rejects control keys', t => {
	t.true(isPrintable('fix the readme', {ctrl: false, meta: false}));
	t.true(isPrintable('e', {ctrl: false, meta: false}));
	t.false(isPrintable('e', {ctrl: true, meta: false}));
	t.false(isPrintable('', {ctrl: false, meta: false}));
});
