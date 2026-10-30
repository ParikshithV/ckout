import {sanitizeSingleLine, sanitizeText} from '../lib/sanitize.js';

export type CommitSuggestion = {
	subject: string;
	body: string;
	branch?: string;
};

export type PrSuggestion = {
	title: string;
	body: string;
};

export const fallbackSubject = 'Update project files';

/** Pull the first JSON object out of model output, tolerating ``` fences and chatter. */
export function extractJson(text: string): Record<string, unknown> | undefined {
	const trimmed = text.trim();
	const candidates = [trimmed];
	const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
	if (fenced?.[1]) {
		candidates.push(fenced[1].trim());
	}

	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start !== -1 && end > start) {
		candidates.push(trimmed.slice(start, end + 1));
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate) as unknown;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// Try the next candidate.
		}
	}

	return undefined;
}

function stringField(
	object: Record<string, unknown> | undefined,
	key: string,
): string {
	const value = object?.[key];
	return typeof value === 'string' ? value : '';
}

export function cleanSubject(raw: string): string {
	const firstLine = sanitizeSingleLine(
		raw.trim().split(/\r?\n/)[0] ?? '',
	).trim();
	const subject = firstLine.replace(/[.]+$/, '').trim();
	return subject.length > 0 ? subject.slice(0, 72).trimEnd() : fallbackSubject;
}

export function sanitizeBranchName(raw: string): string {
	const cleaned = raw
		.toLowerCase()
		.trim()
		.replace(/[^a-z\d/._-]+/g, '-')
		.replace(/\/{2,}/g, '/')
		.replace(/-{2,}/g, '-')
		.replace(/\.{2,}/g, '.')
		.split('/')
		.map(part => part.replace(/^[-.]+|[-.]+$/g, '').replace(/\.lock$/, ''))
		.filter(part => part.length > 0)
		.join('/')
		.slice(0, 60)
		.replace(/[-./]+$/, '');
	return cleaned;
}

export function branchFromSubject(subject: string): string {
	const words = subject
		.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '')
		.split(/\s+/)
		.slice(0, 5)
		.join('-');
	const slug = sanitizeBranchName(words);
	return slug.length > 0 ? slug : 'update';
}

/** Append -2, -3, … until the name is free. */
export function uniqueBranchName(
	preferred: string,
	existing: string[],
): string {
	const taken = new Set(existing);
	if (!taken.has(preferred)) {
		return preferred;
	}

	for (let index = 2; ; index++) {
		const candidate = `${preferred}-${index}`;
		if (!taken.has(candidate)) {
			return candidate;
		}
	}
}

export function parseCommitSuggestion(text: string): CommitSuggestion {
	const json = extractJson(text);
	if (!json) {
		const [first = '', ...rest] = sanitizeText(text).trim().split(/\r?\n/);
		return {subject: cleanSubject(first), body: rest.join('\n').trim()};
	}

	const subject = cleanSubject(stringField(json, 'subject'));
	const body = sanitizeText(stringField(json, 'body')).trim();
	const rawBranch = stringField(json, 'branch');
	const branch = rawBranch ? sanitizeBranchName(rawBranch) : '';
	return branch.length > 0 ? {subject, body, branch} : {subject, body};
}

export function parsePrSuggestion(
	text: string,
	fallbackTitle: string,
): PrSuggestion {
	const json = extractJson(text);
	const title = sanitizeSingleLine(stringField(json, 'title')).trim();
	const body = sanitizeText(stringField(json, 'body')).trim();
	return {
		title: title.length > 0 ? title.slice(0, 120) : fallbackTitle,
		body,
	};
}
