import {formatCommand, formatPipeline} from './format-command.js';
import {type GitBranch} from './parse-branches.js';
import {type ActionItem, type PendingCommand} from '../types.js';

export function buildChangeActions(options: {
	markedFiles: string[];
	commitMessage: string;
	fileCount: number;
}): ActionItem[] {
	const selected = options.markedFiles;
	const trimmed = options.commitMessage.trim();
	const steps = [
		['add', '-A'],
		['commit', '-m', trimmed.length > 0 ? trimmed : 'message'],
	];

	return [
		{
			id: 'commit',
			label: 'Commit all',
			command: formatPipeline(steps),
			disabled: trimmed.length === 0 || options.fileCount === 0,
			confirm: true,
			steps,
		},
		{
			id: 'stage',
			label: 'Stage marked',
			command: formatCommand(['add', '--', ...selected]),
			disabled: selected.length === 0,
			confirm: false,
			steps: [['add', '--', ...selected]],
		},
		{
			id: 'unstage',
			label: 'Unstage marked',
			command: formatCommand(['restore', '--staged', '--', ...selected]),
			disabled: selected.length === 0,
			confirm: true,
			steps: [['restore', '--staged', '--', ...selected]],
		},
		{
			id: 'fetch',
			label: 'Fetch',
			command: formatCommand(['fetch']),
			disabled: false,
			confirm: false,
			steps: [['fetch']],
		},
		{
			id: 'pull',
			label: 'Pull',
			command: formatCommand(['pull']),
			disabled: false,
			confirm: false,
			steps: [['pull']],
		},
		{
			id: 'push',
			label: 'Push',
			command: formatCommand(['push']),
			disabled: false,
			confirm: true,
			steps: [['push']],
		},
	];
}

export function requestFromAction(
	cwd: string,
	action: ActionItem,
): PendingCommand {
	return {
		title: action.label,
		cwd,
		display: action.command,
		steps: action.steps,
		confirm: action.confirm,
	};
}

export function branchRef(branch: GitBranch): string {
	return branch.name.replace(/^remotes\//, '');
}

export function branchShortName(branch: GitBranch): string {
	const ref = branchRef(branch);
	return branch.remote ? ref.replace(/^[^/]+\//, '') : ref;
}

export function checkoutPending(
	cwd: string,
	branch: GitBranch,
): PendingCommand {
	if (!branch.remote) {
		return {
			title: 'Checkout',
			cwd,
			display: formatCommand(['checkout', branch.name]),
			steps: [['checkout', branch.name]],
			confirm: false,
		};
	}

	const ref = branchRef(branch);
	const short = branchShortName(branch);
	return {
		title: 'Checkout remote',
		cwd,
		display: formatCommand(['checkout', '-B', short, ref]),
		steps: [['checkout', '-B', short, ref]],
		confirm: true,
	};
}
