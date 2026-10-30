import fs from 'node:fs/promises';
import path from 'node:path';
import {type ChangedFile} from '../git/parse-status.js';
import {runGit} from '../git/run.js';

export type CommitContext = {
	branch: string | undefined;
	summary: string;
	patch: string;
	recentSubjects: string[];
	repoInstructions?: string;
};

export type PrContext = {
	commits: string;
	diffStat: string;
	patch: string;
	template?: string;
};

/** Lockfiles and generated noise that cost tokens without describing the change. */
export const excludedPathspecs = [
	':(exclude)package-lock.json',
	':(exclude)pnpm-lock.yaml',
	':(exclude)yarn.lock',
	':(exclude)bun.lockb',
	':(exclude)Cargo.lock',
	':(exclude)go.sum',
	':(exclude)poetry.lock',
	':(exclude)*.min.js',
];

const maxUntrackedFiles = 20;
const maxUntrackedBytes = 20_000;

async function stdoutOf(cwd: string, args: string[]): Promise<string> {
	const result = await runGit(cwd, args);
	// `diff --no-index` exits 1 when files differ.
	return result.code === 0 || result.code === 1 ? result.stdout : '';
}

async function untrackedPatch(root: string, files: ChangedFile[]) {
	const parts: string[] = [];
	for (const file of files.slice(0, maxUntrackedFiles)) {
		try {
			const stat = await fs.stat(path.join(root, file.path));
			if (!stat.isFile() || stat.size > maxUntrackedBytes) {
				parts.push(`new file ${file.path} (${stat.size} bytes, not shown)`);
				continue;
			}
		} catch {
			continue;
		}

		parts.push(
			await stdoutOf(root, [
				'diff',
				'--no-index',
				'--',
				'/dev/null',
				file.path,
			]),
		);
	}

	if (files.length > maxUntrackedFiles) {
		parts.push(`(${files.length - maxUntrackedFiles} more new files)`);
	}

	return parts.join('\n');
}

async function readFirst(root: string, candidates: string[]) {
	for (const candidate of candidates) {
		try {
			return await fs.readFile(path.join(root, candidate), 'utf8');
		} catch {
			// Try the next one.
		}
	}

	return undefined;
}

export async function collectCommitContext(options: {
	root: string;
	branch: string | undefined;
	hasHead: boolean;
	files: ChangedFile[];
	includeRepoInstructions: boolean;
}): Promise<CommitContext> {
	const {root, files, hasHead} = options;
	const tracked = files.filter(file => !file.untracked);
	const untracked = files.filter(file => file.untracked);
	const paths = tracked.flatMap(file =>
		file.origPath ? [file.path, file.origPath] : [file.path],
	);

	const trackedPatch =
		paths.length === 0
			? ''
			: await stdoutOf(root, [
					'diff',
					...(hasHead ? ['HEAD'] : ['--cached']),
					'--',
					...paths,
					...excludedPathspecs,
			  ]);
	const summary = files
		.map(file =>
			file.untracked
				? `A  ${file.path}`
				: `${file.index === ' ' ? file.worktree : file.index}  ${
						file.origPath ? `${file.origPath} -> ` : ''
				  }${file.path}`,
		)
		.join('\n');

	const recentSubjects = hasHead
		? (
				await stdoutOf(root, [
					'log',
					'-n',
					'20',
					'--no-merges',
					'--pretty=format:%s',
				])
		  )
				.split('\n')
				.map(line => line.trim())
				.filter(Boolean)
		: [];

	let repoInstructions: string | undefined;
	if (options.includeRepoInstructions) {
		const agents = await readFirst(root, ['AGENTS.md']);
		const claude = await readFirst(root, ['CLAUDE.md']);
		const joined = [agents, claude === agents ? undefined : claude]
			.filter(Boolean)
			.join('\n\n');
		repoInstructions = joined.length > 0 ? joined : undefined;
	}

	return {
		branch: options.branch,
		summary,
		patch: [trackedPatch, await untrackedPatch(root, untracked)]
			.filter(Boolean)
			.join('\n'),
		recentSubjects,
		repoInstructions,
	};
}

export async function collectPrContext(
	root: string,
	baseRef: string,
): Promise<PrContext> {
	const range = `${baseRef}...HEAD`;
	const [commits, diffStat, patch, template] = await Promise.all([
		stdoutOf(root, ['log', '--no-merges', '--pretty=format:- %s', range]),
		stdoutOf(root, ['diff', '--stat', range]),
		stdoutOf(root, ['diff', range, '--', '.', ...excludedPathspecs]),
		readFirst(root, [
			'.github/pull_request_template.md',
			'.github/PULL_REQUEST_TEMPLATE.md',
			'docs/pull_request_template.md',
			'pull_request_template.md',
		]),
	]);
	return {commits, diffStat, patch, template};
}
