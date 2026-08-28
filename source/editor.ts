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

export function parseEditorCommand(
	value = process.env['CKOUT_EDITOR'] ??
		process.env['VISUAL'] ??
		process.env['EDITOR'] ??
		'cursor',
): EditorCommand {
	const parts = value
		.trim()
		.split(/\s+/)
		.filter(part => part.length > 0);
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

async function spawnEditor(
	command: EditorCommand,
	target: string,
): Promise<void> {
	const gui = isGuiEditor(command.bin);
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

		child.once('exit', () => {
			resolve();
		});
	});
}

export async function openPathInEditor(target: string): Promise<void> {
	const attempts = editorAttempts();
	const missing: string[] = [];

	for (const command of attempts) {
		try {
			await spawnEditor(command, target);
			return;
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
): Promise<void> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ckout-'));
	const destination = path.join(
		directory,
		`${path.basename(filePath) || 'changes'}.diff`,
	);
	const body = diff.endsWith('\n') ? diff : `${diff}\n`;
	await fs.writeFile(destination, body);
	await openPathInEditor(destination);
}

export async function openChangeInEditor(options: {
	repoPath: string;
	relativePath: string;
	diff: string;
}): Promise<void> {
	const absolute = path.join(options.repoPath, options.relativePath);
	try {
		await fs.access(absolute);
	} catch {
		await openDiffInEditor(options.relativePath, options.diff);
		return;
	}

	await openPathInEditor(absolute);
}
