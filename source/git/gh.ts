import {runProcess, type ProcessResult} from '../lib/process.js';
import {type MergeMethod} from '../ai/config.js';

export type CheckSummary = {
	passed: number;
	failed: number;
	pending: number;
};

export type PullRequest = {
	number: number;
	url: string;
	title: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	isDraft: boolean;
	baseRefName: string;
	headRefName: string;
	mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
	reviewDecision: string;
	autoMerge: boolean;
	checks: CheckSummary;
};

const prFields = [
	'number',
	'url',
	'title',
	'state',
	'isDraft',
	'baseRefName',
	'headRefName',
	'mergeable',
	'reviewDecision',
	'autoMergeRequest',
	'statusCheckRollup',
].join(',');

export async function runGh(
	cwd: string,
	args: string[],
	input?: string,
): Promise<ProcessResult> {
	try {
		return await runProcess('gh', args, {cwd, input, timeoutMs: 120_000});
	} catch {
		return {stdout: '', stderr: 'gh is not installed', code: 127};
	}
}

/** True when `gh` is installed, logged in, and this repo lives on its host. */
export async function ghReady(cwd: string): Promise<boolean> {
	const result = await runGh(cwd, ['repo', 'view', '--json', 'url']);
	return result.code === 0;
}

type RollupEntry = {
	status?: string;
	conclusion?: string;
	state?: string;
};

export function summarizeChecks(
	rollup: RollupEntry[] | undefined,
): CheckSummary {
	const summary: CheckSummary = {passed: 0, failed: 0, pending: 0};
	for (const entry of rollup ?? []) {
		// CheckRun has status/conclusion; StatusContext has state.
		const result = (entry.conclusion ?? entry.state ?? '').toUpperCase();
		const status = (entry.status ?? '').toUpperCase();
		if (status && status !== 'COMPLETED') {
			summary.pending++;
		} else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(result)) {
			summary.passed++;
		} else if (['PENDING', 'EXPECTED', ''].includes(result)) {
			summary.pending++;
		} else {
			summary.failed++;
		}
	}

	return summary;
}

type RawPr = Omit<PullRequest, 'autoMerge' | 'checks'> & {
	autoMergeRequest: unknown;
	statusCheckRollup: RollupEntry[] | undefined;
};

export function parsePr(json: string): PullRequest {
	const raw = JSON.parse(json) as RawPr;
	return {
		number: raw.number,
		url: raw.url,
		title: raw.title,
		state: raw.state,
		isDraft: raw.isDraft,
		baseRefName: raw.baseRefName,
		headRefName: raw.headRefName,
		mergeable: raw.mergeable,
		reviewDecision: raw.reviewDecision,
		autoMerge: Boolean(raw.autoMergeRequest),
		checks: summarizeChecks(raw.statusCheckRollup),
	};
}

/** The PR for a branch (or number), if any. */
export async function viewPr(
	cwd: string,
	target?: string,
): Promise<PullRequest | undefined> {
	const args = ['pr', 'view', ...(target ? [target] : []), '--json', prFields];
	const result = await runGh(cwd, args);
	if (result.code !== 0) {
		return undefined;
	}

	try {
		return parsePr(result.stdout);
	} catch {
		return undefined;
	}
}

export async function findOpenPr(
	cwd: string,
	branch: string,
): Promise<PullRequest | undefined> {
	const pr = await viewPr(cwd, branch);
	return pr?.state === 'OPEN' ? pr : undefined;
}

export function prNumberFromUrl(url: string): number | undefined {
	const match = /\/pull\/(\d+)/.exec(url);
	return match?.[1] ? Number(match[1]) : undefined;
}

export type PrAction =
	| 'merge'
	| 'auto-merge'
	| 'disable-auto-merge'
	| 'ready'
	| 'draft'
	| 'close'
	| 'reopen'
	| 'open';

export function prActionArgs(
	action: PrAction,
	number: number,
	method: MergeMethod,
): string[] {
	const id = String(number);
	switch (action) {
		case 'merge': {
			return ['pr', 'merge', id, `--${method}`, '--delete-branch'];
		}

		case 'auto-merge': {
			return ['pr', 'merge', id, `--${method}`, '--auto'];
		}

		case 'disable-auto-merge': {
			return ['pr', 'merge', id, '--disable-auto'];
		}

		case 'ready': {
			return ['pr', 'ready', id];
		}

		case 'draft': {
			return ['pr', 'ready', id, '--undo'];
		}

		case 'close': {
			return ['pr', 'close', id];
		}

		case 'reopen': {
			return ['pr', 'reopen', id];
		}

		case 'open': {
			return ['pr', 'view', id, '--web'];
		}
	}
}

export function formatChecks(checks: CheckSummary): string {
	const total = checks.passed + checks.failed + checks.pending;
	if (total === 0) {
		return '';
	}

	if (checks.failed > 0) {
		return `✗ ${checks.failed}/${total} checks`;
	}

	if (checks.pending > 0) {
		return `… ${checks.passed}/${total} checks`;
	}

	return `✓ ${total}/${total} checks`;
}
