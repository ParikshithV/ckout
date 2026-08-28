export type GitBranch = {
	name: string;
	current: boolean;
	remote: boolean;
};

function isRemoteHead(name: string): boolean {
	return name.endsWith('/HEAD') || name === 'HEAD';
}

export function remoteTrackingShortName(name: string): string {
	const ref = name.replace(/^remotes\//, '');
	return ref.replace(/^[^/]+\//, '');
}

/** Drop remote-tracking refs that already have a local branch of the same name. */
export function visibleCheckoutBranches(branches: GitBranch[]): GitBranch[] {
	const locals = branches.filter(branch => !branch.remote);
	const localNames = new Set(locals.map(branch => branch.name));
	const remotes = branches.filter(branch => {
		if (!branch.remote || isRemoteHead(branch.name)) {
			return false;
		}

		return !localNames.has(remoteTrackingShortName(branch.name));
	});

	return [...locals, ...remotes];
}

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

	return visibleCheckoutBranches(branches);
}
