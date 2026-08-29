/* eslint-disable no-control-regex */
const oscRegex = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;
const dcsRegex = /\u001B[P^_][^\u001B]*(?:\u001B\\)?/g;
const csiRegex = /\u001B\[[0-9:;<=>?]*[ -/]*[@-~]/g;
const escRegex = /\u001B./g;
const controlCharsRegex =
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Remove ANSI escape sequences, OSC/CSI controls, and unsafe C0/C1 control characters
 * while preserving tabs and newlines.
 */
export function sanitizeText(str: string): string {
	if (!str) {
		return '';
	}

	return str
		.replace(oscRegex, '')
		.replace(dcsRegex, '')
		.replace(csiRegex, '')
		.replace(escRegex, '')
		.replace(controlCharsRegex, '');
}

/**
 * Sanitize text and collapse internal newlines and tabs into single spaces.
 */
export function sanitizeSingleLine(str: string): string {
	if (!str) {
		return '';
	}

	return sanitizeText(str).replace(/[\r\n\t]+/g, ' ');
}
