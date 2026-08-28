import {spawn} from 'node:child_process';
import {formatCommand} from './format-command.js';

export type GitResult = {
	argv: string[];
	command: string;
	stdout: string;
	stderr: string;
	code: number;
};

export type RunGitOptions = {
	timeoutMs?: number;
	signal?: AbortSignal;
};

export async function runGit(
	cwd: string,
	args: readonly string[],
	options: RunGitOptions = {},
): Promise<GitResult> {
	const argv = [...args];
	const command = formatCommand(argv);
	const timeoutMs = options.timeoutMs ?? 60_000;

	return new Promise((resolve, reject) => {
		const child = spawn('git', argv, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		let settled = false;

		const finish = (result: GitResult) => {
			if (settled) {
				return;
			}

			settled = true;
			resolve(result);
		};

		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			finish({
				argv,
				command,
				stdout,
				stderr: stderr || `Timed out after ${timeoutMs}ms`,
				code: 124,
			});
		}, timeoutMs);

		const onAbort = () => {
			child.kill('SIGTERM');
		};

		options.signal?.addEventListener('abort', onAbort);

		child.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('error', error => {
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			reject(error);
		});

		child.on('close', code => {
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			finish({
				argv,
				command,
				stdout,
				stderr,
				code: code ?? 1,
			});
		});
	});
}

export async function runGitPipeline(
	cwd: string,
	steps: readonly string[][],
	options: RunGitOptions = {},
): Promise<GitResult> {
	let last: GitResult | undefined;

	for (const step of steps) {
		last = await runGit(cwd, step, options);
		if (last.code !== 0) {
			return last;
		}
	}

	if (!last) {
		return {
			argv: [],
			command: formatCommand([]),
			stdout: '',
			stderr: 'No git steps to run',
			code: 1,
		};
	}

	return last;
}

export async function resolveRepoRoot(
	cwd: string,
	options: RunGitOptions = {},
): Promise<string | undefined> {
	const result = await runGit(cwd, ['rev-parse', '--show-toplevel'], options);

	if (result.code !== 0) {
		return undefined;
	}

	const root = result.stdout.trim();
	return root.length > 0 ? root : undefined;
}
