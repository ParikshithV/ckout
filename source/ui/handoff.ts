import {spawnSync} from 'node:child_process';
import process from 'node:process';

/**
 * Give the terminal to a child process (a pager, an editor) and take it back.
 * Ink keeps stdin in raw mode, so release it while the child runs.
 */
export function runInTerminal(
	bin: string,
	args: string[],
	cwd: string,
): number {
	const raw = process.stdin.isTTY && process.stdin.isRaw;
	if (raw) {
		process.stdin.setRawMode(false);
	}

	try {
		const result = spawnSync(bin, args, {cwd, stdio: 'inherit'});
		return result.status ?? 1;
	} finally {
		if (raw) {
			process.stdin.setRawMode(true);
		}
	}
}
