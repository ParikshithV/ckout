export type ChangedFile = {
	path: string;
	index: string;
	worktree: string;
	staged: boolean;
	unstaged: boolean;
	untracked: boolean;
};

export type RepoStatus = {
	branch: string;
	upstream: string | undefined;
	ahead: number;
	behind: number;
	files: ChangedFile[];
	dirty: boolean;
};

function parseTrack(track: string | undefined): {
	ahead: number;
	behind: number;
} {
	if (!track) {
		return {ahead: 0, behind: 0};
	}

	const aheadMatch = /ahead (\d+)/.exec(track);
	const behindMatch = /behind (\d+)/.exec(track);

	return {
		ahead: aheadMatch?.[1] ? Number(aheadMatch[1]) : 0,
		behind: behindMatch?.[1] ? Number(behindMatch[1]) : 0,
	};
}

function parseHeader(
	header: string,
): Pick<RepoStatus, 'branch' | 'upstream' | 'ahead' | 'behind'> {
	const rest = header.startsWith('## ') ? header.slice(3) : header;
	const noCommits = /^No commits yet on (.+)$/.exec(rest);

	if (noCommits?.[1]) {
		return {branch: noCommits[1], upstream: undefined, ahead: 0, behind: 0};
	}

	if (rest.startsWith('HEAD (no branch)')) {
		return {branch: 'HEAD', upstream: undefined, ahead: 0, behind: 0};
	}

	const match = /^(\S+?)(?:\.\.\.(\S+))?(?: \[(.*)])?$/.exec(rest);

	return {
		branch: match?.[1] ?? rest,
		upstream: match?.[2],
		...parseTrack(match?.[3]),
	};
}

export function parseStatus(porcelain: string): RepoStatus {
	const lines = porcelain.split('\n').filter(line => line.length > 0);
	const hasHeader = lines[0]?.startsWith('## ') ?? false;
	const header = hasHeader
		? parseHeader(lines[0] ?? '## HEAD')
		: {branch: 'HEAD', upstream: undefined, ahead: 0, behind: 0};
	const fileLines = hasHeader ? lines.slice(1) : lines;
	const files: ChangedFile[] = [];

	for (const line of fileLines) {
		if (line.length < 3) {
			continue;
		}

		const index = line[0] ?? ' ';
		const worktree = line[1] ?? ' ';
		let filePath = line.slice(3);
		const renameIndex = filePath.indexOf(' -> ');
		if (renameIndex !== -1) {
			filePath = filePath.slice(renameIndex + 4);
		}

		const untracked = index === '?' && worktree === '?';
		const staged = !untracked && index !== ' ' && index !== '?';
		const unstaged = untracked || (worktree !== ' ' && worktree !== '?');

		files.push({
			path: filePath,
			index,
			worktree,
			staged,
			unstaged,
			untracked,
		});
	}

	return {
		...header,
		files,
		dirty: files.length > 0,
	};
}

export function fileStatusLabel(file: ChangedFile): string {
	if (file.untracked) {
		return '??';
	}

	return `${file.index === ' ' ? '.' : file.index}${
		file.worktree === ' ' ? '.' : file.worktree
	}`;
}
