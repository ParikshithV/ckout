import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const guiEditors = new Set([
	'cursor',
	'code',
	'code-insiders',
	'subl',
	'atom',
	'windsurf',
	'open',
]);

export type EditorCommand = {
	bin: string;
	extraArgs: string[];
};

export function splitEditorCommand(value: string): string[] {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return [];
	}

	const args: string[] = [];
	let current = '';
	let quote: string | undefined;
	let argumentStarted = false;
	const characters = [...trimmed];
	let index = 0;

	while (index < characters.length) {
		const char = characters[index] ?? '';
		if (quote === "'") {
			if (char === "'") {
				quote = undefined;
			} else {
				current += char;
			}

			index += 1;
			continue;
		}

		if (quote === '"') {
			if (char === '"') {
				quote = undefined;
			} else if (char === '\\') {
				const next = characters[index + 1];
				if (next && ['"', '\\', '$', '`'].includes(next)) {
					current += next;
					index += 2;
					continue;
				}

				current += char;
			} else {
				current += char;
			}

			index += 1;
			continue;
		}

		if (char === '\\') {
			current += characters[index + 1] ?? '\\';
			argumentStarted = true;
			index += characters[index + 1] ? 2 : 1;
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			argumentStarted = true;
			index += 1;
			continue;
		}

		if (/\s/.test(char)) {
			if (argumentStarted) {
				args.push(current);
				current = '';
				argumentStarted = false;
			}

			index += 1;
			continue;
		}

		current += char;
		argumentStarted = true;
		index += 1;
	}

	if (argumentStarted) {
		args.push(current);
	}

	return args;
}

export function parseEditorCommand(
	value = process.env['CKOUT_EDITOR'] ??
		process.env['VISUAL'] ??
		process.env['EDITOR'] ??
		'cursor',
): EditorCommand {
	const parts = splitEditorCommand(value);
	return {
		bin: parts[0] ?? 'cursor',
		extraArgs: parts.slice(1),
	};
}

export function isGuiEditor(bin: string): boolean {
	return guiEditors.has(path.basename(bin));
}

export function editorAttempts(
	preferred = parseEditorCommand(),
): EditorCommand[] {
	const seen = new Set<string>();
	const attempts: EditorCommand[] = [];

	const push = (bin: string, extraArgs: string[]) => {
		const key = `${bin}\0${extraArgs.join('\0')}`;
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		attempts.push({bin, extraArgs});
	};

	push(preferred.bin, preferred.extraArgs);
	push('cursor', []);
	push('code', []);
	if (process.platform === 'darwin') {
		push('open', ['-t']);
	}

	push('nano', []);
	push('vim', []);
	push('vi', []);
	return attempts;
}

function isMissingBinary(error: unknown): boolean {
	return (
		error instanceof Error &&
		'code' in error &&
		(error as NodeJS.ErrnoException).code === 'ENOENT'
	);
}

export type EditorCallbacks = {
	onBeforeSpawn?: () => void;
	onAfterExit?: () => void;
};

async function spawnEditor(
	command: EditorCommand,
	target: string,
	callbacks?: EditorCallbacks,
): Promise<boolean> {
	const gui = isGuiEditor(command.bin);
	if (!gui) {
		callbacks?.onBeforeSpawn?.();
	}

	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(command.bin, [...command.extraArgs, target], {
				detached: gui,
				stdio: gui ? 'ignore' : 'inherit',
			});
			child.once('error', reject);
			if (gui) {
				child.once('spawn', () => {
					child.unref();
					resolve();
				});
				return;
			}

			child.once('exit', (code, signal) => {
				if (code !== 0 && code !== null) {
					reject(new Error(`Editor '${command.bin}' exited with code ${code}`));
					return;
				}

				if (signal) {
					reject(
						new Error(`Editor '${command.bin}' killed with signal ${signal}`),
					);
					return;
				}

				resolve();
			});
		});
		return gui;
	} finally {
		if (!gui) {
			callbacks?.onAfterExit?.();
		}
	}
}

export async function openPathInEditor(
	target: string,
	callbacks?: EditorCallbacks,
): Promise<boolean> {
	const attempts = editorAttempts();
	const missing: string[] = [];

	for (const command of attempts) {
		try {
			return await spawnEditor(command, target, callbacks);
		} catch (error: unknown) {
			if (!isMissingBinary(error)) {
				throw error;
			}

			missing.push(command.bin);
		}
	}

	throw new Error(
		`No editor found (tried ${missing.join(', ')}). Set CKOUT_EDITOR.`,
	);
}

export async function openDiffInEditor(
	filePath: string,
	diff: string,
	callbacks?: EditorCallbacks,
): Promise<void> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ckout-'));
	const destination = path.join(
		directory,
		`${path.basename(filePath) || 'changes'}.diff`,
	);
	const body = diff.endsWith('\n') ? diff : `${diff}\n`;
	await fs.writeFile(destination, body);
	let detached = false;
	try {
		detached = await openPathInEditor(destination, callbacks);
	} finally {
		if (!detached) {
			await fs.rm(directory, {recursive: true, force: true});
		}
	}
}

export async function openChangeInEditor(
	options: {
		repoPath: string;
		relativePath: string;
		diff: string;
	},
	callbacks?: EditorCallbacks,
): Promise<void> {
	const absolute = path.join(options.repoPath, options.relativePath);
	try {
		await fs.access(absolute);
	} catch {
		await openDiffInEditor(options.relativePath, options.diff, callbacks);
		return;
	}

	await openPathInEditor(absolute, callbacks);
}
