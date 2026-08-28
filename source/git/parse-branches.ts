export type GitBranch = {
	name: string;
	current: boolean;
	remote: boolean;
};

export function parseBranches(output: string): GitBranch[] {
	const seen = new Set<string>();
	const branches: GitBranch[] = [];

	for (const raw of output.split('\n')) {
		const line = raw.trim();
		if (line.length === 0 || line.startsWith('(')) {
			continue;
		}

		const current = line.startsWith('* ');
		const name = (current ? line.slice(2) : line).trim();
		if (name.length === 0 || name.includes('HEAD detached') || seen.has(name)) {
			continue;
		}

		seen.add(name);
		branches.push({
			name,
			current,
			remote: name.startsWith('remotes/'),
		});
	}

	return branches;
}
