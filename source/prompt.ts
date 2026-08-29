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

export function textLength(value: string): number {
	return [...value].length;
}

export function isBackwardDeleteKey(key: {
	backspace: boolean;
	delete: boolean;
}): boolean {
	return key.backspace || key.delete;
}

export function insertAtCursor(
	value: string,
	cursor: number,
	text: string,
): {value: string; cursor: number} {
	const characters = [...value];
	const pos = Math.max(0, Math.min(characters.length, cursor));
	characters.splice(pos, 0, ...text);
	return {
		value: characters.join(''),
		cursor: pos + textLength(text),
	};
}

export function deleteBeforeCursor(
	value: string,
	cursor: number,
): {value: string; cursor: number} {
	const characters = [...value];
	const pos = Math.max(0, Math.min(characters.length, cursor));
	if (pos === 0) {
		return {value, cursor: 0};
	}

	return {
		value: [...characters.slice(0, pos - 1), ...characters.slice(pos)].join(''),
		cursor: pos - 1,
	};
}

export function deleteAtCursor(
	value: string,
	cursor: number,
): {value: string; cursor: number} {
	const characters = [...value];
	const pos = Math.max(0, Math.min(characters.length, cursor));
	if (pos >= characters.length) {
		return {value, cursor: pos};
	}

	return {
		value: [...characters.slice(0, pos), ...characters.slice(pos + 1)].join(''),
		cursor: pos,
	};
}

export function deleteWordBeforeCursor(
	value: string,
	cursor: number,
): {value: string; cursor: number} {
	const characters = [...value];
	const pos = Math.max(0, Math.min(characters.length, cursor));
	if (pos === 0) {
		return {value, cursor: 0};
	}

	const before = characters.slice(0, pos).join('');
	const match = /\S+\s*$/.exec(before);
	const deleteCount = match ? textLength(match[0]) : 1;
	const newPos = Math.max(0, pos - deleteCount);

	return {
		value: [...characters.slice(0, newPos), ...characters.slice(pos)].join(''),
		cursor: newPos,
	};
}

export function deleteToStart(
	value: string,
	cursor: number,
): {value: string; cursor: number} {
	const characters = [...value];
	const pos = Math.max(0, Math.min(characters.length, cursor));
	return {
		value: characters.slice(pos).join(''),
		cursor: 0,
	};
}
