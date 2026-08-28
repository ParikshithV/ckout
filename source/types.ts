export type PendingCommand = {
	title: string;
	cwd: string;
	display: string;
	steps: string[][];
	confirm: boolean;
};

export type LastCommand = {
	ok: boolean;
	command: string;
	detail: string;
};

export type PromptMode = 'checkout' | 'commit' | 'filter';

export type ActiveList = 'branches' | 'files';

export type ActionItem = {
	id: string;
	label: string;
	command: string;
	disabled: boolean;
	confirm: boolean;
	steps: string[][];
};
