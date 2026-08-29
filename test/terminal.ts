import test from 'ava';
import {
	enterAppScreen,
	leaveAppScreen,
	resetAppScreenState,
} from '../source/lib/terminal.js';

function fakeTty() {
	let output = '';
	return {
		isTTY: true,
		write(chunk: string) {
			output += chunk;
			return true;
		},
		get output() {
			return output;
		},
	};
}

test.afterEach(() => {
	resetAppScreenState();
});

test('leaveAppScreen restores the previous terminal and is safe to call twice', t => {
	const stream = fakeTty();
	enterAppScreen(stream as unknown as NodeJS.WriteStream);
	t.true(stream.output.includes('\u001B[?1049h'));

	leaveAppScreen(stream as unknown as NodeJS.WriteStream);
	t.true(stream.output.includes('\u001B[?1049l'));
	t.true(stream.output.endsWith('\u001B[?25h'));

	const afterFirstLeave = stream.output;
	leaveAppScreen(stream as unknown as NodeJS.WriteStream);
	t.is(stream.output, afterFirstLeave);
});
