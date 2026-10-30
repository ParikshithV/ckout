import {runProcess} from '../lib/process.js';
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
	const result = await runProcess('git', argv, {
		cwd,
		timeoutMs: options.timeoutMs,
		signal: options.signal,
	});
	return {argv, command: formatCommand(argv), ...result};
}

/** Like runGit, but throws on a non-zero exit. Returns stdout. */
export async function gitOutput(
	cwd: string,
	args: readonly string[],
	options: RunGitOptions = {},
): Promise<string> {
	const result = await runGit(cwd, args, options);
	if (result.code !== 0) {
		throw new Error(
			firstLine(result.stderr) ||
				firstLine(result.stdout) ||
				`${result.command} failed`,
		);
	}

	return result.stdout;
}

export function firstLine(text: string): string {
	return (
		text
			.split('\n')
			.map(line => line.trim())
			.find(line => line.length > 0) ?? ''
	);
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
