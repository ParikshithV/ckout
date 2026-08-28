import test from 'ava';
import {nextPromptMode, promptPlaceholder} from '../source/prompt.js';

test('tab cycles prompt modes while typing', t => {
	t.is(nextPromptMode('checkout'), 'commit');
	t.is(nextPromptMode('commit'), 'filter');
	t.is(nextPromptMode('filter'), 'checkout');
});

test('placeholders describe the mode', t => {
	t.is(promptPlaceholder('checkout'), 'Branch to checkout or create');
	t.is(promptPlaceholder('commit'), 'Commit message');
});
