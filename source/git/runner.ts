import {type AiSettings} from '../ai/config.js';
import {collectPrContext} from '../ai/context.js';
import {suggestPr} from '../ai/generate.js';
import {findOpenPr, prNumberFromUrl, runGh} from './gh.js';
import {describeStep, type Phase, type PlanStep} from './plan.js';
import {firstLine, runGit} from './run.js';

export type StepOutcome = {
	phase: Phase;
	ok: boolean;
	command: string;
	detail: string;
};

export type RunResult = {
	ok: boolean;
	outcomes: StepOutcome[];
	branch?: string;
	sha?: string;
	pushedTo?: string;
	pulled?: boolean;
	pr?: {number?: number; url: string; existing: boolean};
	error?: {phase: Phase; message: string};
};

export type RunContext = {
	root: string;
	ai: AiSettings;
	remote: string | undefined;
	subject: string;
	onPhase: (label: string) => void;
	signal?: AbortSignal;
};

const phaseLabels: Record<Phase, string> = {
	branch: 'creating branch',
	commit: 'committing',
	push: 'pushing',
	pull: 'pulling',
	pr: 'opening PR',
};

async function runPrStep(
	step: Extract<PlanStep, {kind: 'pr'}>,
	context: RunContext,
): Promise<{
	ok: boolean;
	detail: string;
	command: string;
	pr?: RunResult['pr'];
}> {
	const existing = await findOpenPr(context.root, step.head);
	if (existing) {
		return {
			ok: true,
			command: `gh pr view ${step.head}`,
			detail: existing.url,
			pr: {number: existing.number, url: existing.url, existing: true},
		};
	}

	const base = ['pr', 'create', '--base', step.base, '--head', step.head];
	let args = [...base, '--fill'];
	let body: string | undefined;

	if (context.ai.provider !== 'off') {
		context.onPhase('✦ writing PR');
		try {
			const baseRef = context.remote
				? `${context.remote}/${step.base}`
				: step.base;
			const prContext = await collectPrContext(context.root, baseRef);
			const suggestion = await suggestPr(
				context.ai,
				{...prContext, baseBranch: step.base, headBranch: step.head},
				context.subject,
				context.signal ?? new AbortController().signal,
			);
			args = [...base, '--title', suggestion.title, '--body-file', '-'];
			body = suggestion.body;
		} catch {
			// Fall back to gh's own title/body from commits.
		}

		context.onPhase(phaseLabels.pr);
	}

	const result = await runGh(context.root, args, body);
	const command = `gh ${args
		.map(arg => (arg.includes(' ') ? `'…'` : arg))
		.join(' ')}`;
	if (result.code !== 0) {
		return {
			ok: false,
			command,
			detail: firstLine(result.stderr) || 'gh pr create failed',
		};
	}

	const url =
		result.stdout
			.split('\n')
			.map(line => line.trim())
			.find(line => line.startsWith('http')) ?? result.stdout.trim();
	return {
		ok: true,
		command,
		detail: url,
		pr: {number: prNumberFromUrl(url), url, existing: false},
	};
}

/** Run plan steps in order, stopping at the first failure. */
export async function runPlan(
	steps: PlanStep[],
	context: RunContext,
): Promise<RunResult> {
	const result: RunResult = {ok: true, outcomes: []};
	let lastPhase: Phase | undefined;

	for (const step of steps) {
		if (step.phase !== lastPhase) {
			context.onPhase(phaseLabels[step.phase]);
			lastPhase = step.phase;
		}

		if (step.kind === 'pr') {
			const pr = await runPrStep(step, context);
			result.outcomes.push({
				phase: 'pr',
				ok: pr.ok,
				command: pr.command,
				detail: pr.detail,
			});
			if (!pr.ok) {
				result.ok = false;
				result.error = {phase: 'pr', message: pr.detail};
				return result;
			}

			result.pr = pr.pr;
			continue;
		}

		const git = await runGit(context.root, step.argv, {
			timeoutMs: step.phase === 'commit' ? 600_000 : 120_000,
		});
		const detail = firstLine(git.stderr) || firstLine(git.stdout);
		result.outcomes.push({
			phase: step.phase,
			ok: git.code === 0,
			command: describeStep(step),
			detail,
		});

		if (git.code !== 0) {
			result.ok = false;
			result.error = {
				phase: step.phase,
				message: detail || `${describeStep(step)} failed`,
			};
			return result;
		}

		if (step.phase === 'branch') {
			result.branch = step.argv[step.argv.length - 1];
		} else if (step.phase === 'commit' && step.argv[0] === 'commit') {
			const sha = await runGit(context.root, ['rev-parse', '--short', 'HEAD']);
			result.sha = sha.stdout.trim();
		} else if (step.phase === 'push') {
			const upstream = await runGit(context.root, [
				'rev-parse',
				'--abbrev-ref',
				'--symbolic-full-name',
				'@{u}',
			]);
			result.pushedTo = upstream.code === 0 ? upstream.stdout.trim() : 'remote';
		} else if (step.phase === 'pull') {
			result.pulled = true;
		}
	}

	return result;
}

/** One line: `✓ feat/x · 3f2a91c → origin/feat/x · PR #42 <url>`. */
export function summarizeRun(result: RunResult): string {
	const parts: string[] = [];
	if (result.branch) {
		parts.push(result.branch);
	}

	if (result.sha) {
		parts.push(
			result.pushedTo ? `${result.sha} → ${result.pushedTo}` : result.sha,
		);
	} else if (result.pushedTo) {
		parts.push(`pushed → ${result.pushedTo}`);
	}

	if (result.pulled) {
		parts.push('pulled');
	}

	if (result.pr) {
		parts.push(
			`${result.pr.number ? `PR #${result.pr.number}` : 'PR'}${
				result.pr.existing ? ' (open)' : ''
			} ${result.pr.url}`,
		);
	}

	const done = parts.join(' · ');
	if (result.error) {
		const failure = `✗ ${result.error.phase}: ${result.error.message}`;
		return done ? `✓ ${done}\n${failure}` : failure;
	}

	return `✓ ${done || 'done'}`;
}
