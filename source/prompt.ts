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
	if (key.ctrl || key.meta || input.length === 0) {
		return false;
	}

	for (const character of input) {
		if (character < ' ' || character === '\u007F') {
			return false;
		}
	}

	return true;
}
