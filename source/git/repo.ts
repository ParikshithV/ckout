import {parseBranches, type GitBranch} from './parse-branches.js';
import {parseStatus, type RepoStatus} from './parse-status.js';
import {runGit} from './run.js';

export type RepoState = {
	root: string;
	status: RepoStatus;
	/** False in a repo with no commits yet. */
	hasHead: boolean;
	detached: boolean;
	remote: string | undefined;
	defaultBranch: string | undefined;
	/** Commits on HEAD that the remote default branch does not have. */
	aheadOfDefault: number;
	insertions: number;
	deletions: number;
	branches: GitBranch[];
};

async function stdoutOf(
	cwd: string,
	args: string[],
	signal?: AbortSignal,
): Promise<string | undefined> {
	const result = await runGit(cwd, args, {signal});
	return result.code === 0 ? result.stdout.trim() : undefined;
}

export function sumNumstat(output: string): {
	insertions: number;
	deletions: number;
} {
	let insertions = 0;
	let deletions = 0;
	for (const line of output.split('\n')) {
		const [added, removed] = line.split('\t');
		// Binary files report "-".
		insertions += Number(added) || 0;
		deletions += Number(removed) || 0;
	}

	return {insertions, deletions};
}

export async function pickRemote(
	cwd: string,
	branch: string | undefined,
	signal?: AbortSignal,
): Promise<string | undefined> {
	if (branch) {
		const configured = await stdoutOf(
			cwd,
			['config', '--get', `branch.${branch}.remote`],
			signal,
		);
		if (configured) {
			return configured;
		}
	}

	const remotes = (await stdoutOf(cwd, ['remote'], signal))
		?.split('\n')
		.filter(Boolean);
	if (!remotes || remotes.length === 0) {
		return undefined;
	}

	return remotes.includes('origin') ? 'origin' : remotes[0];
}

export async function resolveDefaultBranch(
	cwd: string,
	remote: string | undefined,
	branches: GitBranch[],
	signal?: AbortSignal,
): Promise<string | undefined> {
	if (remote) {
		const head = await stdoutOf(
			cwd,
			['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`],
			signal,
		);
		if (head?.startsWith(`${remote}/`)) {
			return head.slice(remote.length + 1);
		}
	}

	const locals = new Set(
		branches.filter(branch => !branch.remote).map(branch => branch.name),
	);
	return ['main', 'master', 'trunk', 'develop'].find(name => locals.has(name));
}

export async function loadRepoState(
	root: string,
	signal?: AbortSignal,
): Promise<RepoState> {
	const [statusOut, branchOut, headSha] = await Promise.all([
		stdoutOf(root, ['status', '--porcelain=v1', '-z', '-b'], signal),
		stdoutOf(root, ['branch', '-a'], signal),
		stdoutOf(root, ['rev-parse', '--verify', '-q', 'HEAD'], signal),
	]);
	if (statusOut === undefined) {
		throw new Error('git status failed');
	}

	const status = parseStatus(statusOut);
	const branches = parseBranches(branchOut ?? '');
	const hasHead = Boolean(headSha);
	const detached = status.branch === 'HEAD';
	const remote = await pickRemote(
		root,
		detached ? undefined : status.branch,
		signal,
	);
	const defaultBranch = await resolveDefaultBranch(
		root,
		remote,
		branches,
		signal,
	);

	const numstat = hasHead
		? await stdoutOf(root, ['diff', 'HEAD', '--numstat'], signal)
		: await stdoutOf(root, ['diff', '--cached', '--numstat'], signal);
	const {insertions, deletions} = sumNumstat(numstat ?? '');

	let aheadOfDefault = 0;
	if (hasHead && remote && defaultBranch && status.branch !== defaultBranch) {
		const count = await stdoutOf(
			root,
			['rev-list', '--count', `${remote}/${defaultBranch}..HEAD`],
			signal,
		);
		aheadOfDefault = Number(count) || 0;
	}

	return {
		root,
		status,
		hasHead,
		detached,
		remote,
		defaultBranch,
		aheadOfDefault,
		insertions,
		deletions,
		branches,
	};
}
