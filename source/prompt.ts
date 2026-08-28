import {type PromptMode} from './types.js';

export const promptModes: PromptMode[] = ['checkout', 'commit', 'filter'];

export function nextPromptMode(current: PromptMode): PromptMode {
	const index = promptModes.indexOf(current);
	return promptModes[(index + 1) % promptModes.length] ?? 'checkout';
}

export function promptPlaceholder(mode: PromptMode): string {
	switch (mode) {
		case 'checkout': {
			return 'Branch to checkout or create';
		}

		case 'commit': {
			return 'Commit message';
		}

		case 'filter': {
			return 'Filter files';
		}
	}
}

export function isPrintable(
	input: string,
	key: {ctrl: boolean; meta: boolean},
): boolean {
	return (
		input.length === 1 &&
		!key.ctrl &&
		!key.meta &&
		input >= ' ' &&
		input !== '\u007F'
	);
}
