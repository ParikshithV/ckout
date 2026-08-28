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
]);

export function parseEditorCommand(
	value = process.env['CKOUT_EDITOR'] ??
		process.env['VISUAL'] ??
		process.env['EDITOR'] ??
		'cursor',
): {bin: string; extraArgs: string[]} {
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

export async function openPathInEditor(target: string): Promise<void> {
	const {bin, extraArgs} = parseEditorCommand();
	const gui = isGuiEditor(bin);
	const child = spawn(bin, [...extraArgs, target], {
		detached: gui,
		stdio: gui ? 'ignore' : 'inherit',
	});

	if (gui) {
		child.unref();
		return;
	}

	await new Promise<void>((resolve, reject) => {
		child.on('error', reject);
		child.on('exit', () => {
			resolve();
		});
	});
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
		await openPathInEditor(absolute);
	} catch {
		await openDiffInEditor(options.relativePath, options.diff);
	}
}
