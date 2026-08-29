import process from 'node:process';

const enterAltScreen = '\u001B[?1049h';
const leaveAltScreen = '\u001B[?1049l';
const clearScreen = '\u001B[2J\u001B[3J\u001B[H';
const showCursor = '\u001B[?25h';

let usingAppScreen = false;

export function enterAppScreen(
	stream: NodeJS.WriteStream = process.stdout,
): void {
	if (!stream.isTTY || usingAppScreen) {
		return;
	}

	usingAppScreen = true;
	stream.write(`${enterAltScreen}${clearScreen}`);
}

export function leaveAppScreen(
	stream: NodeJS.WriteStream = process.stdout,
): void {
	if (!usingAppScreen) {
		return;
	}

	usingAppScreen = false;
	if (!stream.isTTY) {
		return;
	}

	stream.write(`${leaveAltScreen}${showCursor}`);
}

/** Test helper. */
export function resetAppScreenState(): void {
	usingAppScreen = false;
}
