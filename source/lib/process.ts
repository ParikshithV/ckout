import {spawn} from 'node:child_process';

export type ProcessResult = {
	stdout: string;
	stderr: string;
	code: number;
};

export type RunProcessOptions = {
	cwd?: string;
	input?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	env?: NodeJS.ProcessEnv;
	/** Run `bin` through the shell (only for user-supplied command strings). */
	shell?: boolean;
};

export async function runProcess(
	bin: string,
	args: readonly string[],
	options: RunProcessOptions = {},
): Promise<ProcessResult> {
	const timeoutMs = options.timeoutMs ?? 60_000;

	return new Promise((resolve, reject) => {
		const child = spawn(bin, [...args], {
			cwd: options.cwd,
			env: options.env,
			shell: options.shell ?? false,
			stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		let settled = false;

		const finish = (result: ProcessResult) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			resolve(result);
		};

		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			finish({
				stdout,
				stderr: stderr || `Timed out after ${timeoutMs}ms`,
				code: 124,
			});
		}, timeoutMs);

		const onAbort = () => {
			child.kill('SIGTERM');
		};

		if (options.signal?.aborted) {
			onAbort();
		} else {
			options.signal?.addEventListener('abort', onAbort);
		}

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		if (options.input !== undefined && child.stdin) {
			child.stdin.on('error', () => {
				// The child may exit before reading all of stdin.
			});
			child.stdin.end(options.input);
		}

		child.on('error', error => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			reject(error);
		});

		child.on('close', code => {
			finish({stdout, stderr, code: code ?? 1});
		});
	});
}

export async function commandExists(bin: string): Promise<boolean> {
	try {
		const result = await runProcess(bin, ['--version'], {timeoutMs: 10_000});
		return result.code === 0;
	} catch {
		return false;
	}
}
