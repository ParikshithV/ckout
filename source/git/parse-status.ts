export type ChangedFile = {
	path: string;
	origPath?: string;
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

function unquoteGitPath(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		const inner = trimmed.slice(1, -1);
		const bytes: number[] = [];
		let index = 0;

		while (index < inner.length) {
			const character = inner[index] ?? '';
			if (character !== '\\') {
				bytes.push(...Buffer.from(character));
				index += 1;
				continue;
			}

			const escaped = inner[index + 1] ?? '';
			const octal = /^[0-7]{1,3}/.exec(inner.slice(index + 1))?.[0];
			if (octal) {
				bytes.push(Number.parseInt(octal, 8));
				index += octal.length + 1;
				continue;
			}

			const decodedEscape =
				escaped === 'a'
					? '\u0007'
					: escaped === 'b'
					? '\b'
					: escaped === 'f'
					? '\f'
					: escaped === 'n'
					? '\n'
					: escaped === 'r'
					? '\r'
					: escaped === 't'
					? '\t'
					: escaped === 'v'
					? '\u000B'
					: escaped;
			bytes.push(...Buffer.from(decodedEscape));
			index += 2;
		}

		return Buffer.from(bytes).toString('utf8');
	}

	return trimmed;
}

export function parseStatus(porcelain: string): RepoStatus {
	if (porcelain.includes('\0')) {
		const tokens = porcelain.split('\0');
		if (tokens.length > 0 && tokens[tokens.length - 1] === '') {
			tokens.pop();
		}

		let i = 0;
		let header = {
			branch: 'HEAD',
			upstream: undefined as string | undefined,
			ahead: 0,
			behind: 0,
		};
		if (tokens[0]?.startsWith('## ')) {
			header = parseHeader(tokens[0]);
			i = 1;
		}

		const files: ChangedFile[] = [];
		while (i < tokens.length) {
			const entry = tokens[i++];
			if (!entry || entry.length < 3) {
				continue;
			}

			const index = entry[0] ?? ' ';
			const worktree = entry[1] ?? ' ';
			const filePath = entry.slice(3);
			let origPath: string | undefined;

			const isRenameOrCopy =
				index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C';
			if (isRenameOrCopy && i < tokens.length) {
				origPath = tokens[i++];
			}

			const untracked = index === '?' && worktree === '?';
			const staged = !untracked && index !== ' ' && index !== '?';
			const unstaged = untracked || (worktree !== ' ' && worktree !== '?');

			files.push({
				path: filePath,
				origPath,
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
		let origPath: string | undefined;

		const renameIndex = filePath.indexOf(' -> ');
		if (renameIndex !== -1) {
			origPath = unquoteGitPath(filePath.slice(0, renameIndex));
			filePath = filePath.slice(renameIndex + 4);
		}

		filePath = unquoteGitPath(filePath);

		const untracked = index === '?' && worktree === '?';
		const staged = !untracked && index !== ' ' && index !== '?';
		const unstaged = untracked || (worktree !== ' ' && worktree !== '?');

		files.push({
			path: filePath,
			origPath,
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
