import test from 'ava';
import {windowedSlice} from '../source/lib/windowed.js';

test('windowedSlice keeps the focused index in view', t => {
	const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
	t.deepEqual(windowedSlice(items, 0, 4).items, [0, 1, 2, 3]);
	t.deepEqual(windowedSlice(items, 9, 4).items, [6, 7, 8, 9]);
	t.deepEqual(windowedSlice(items, 5, 4).items, [3, 4, 5, 6]);
});
