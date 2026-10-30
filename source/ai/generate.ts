import {type AiSettings} from './config.js';
import {type CommitContext, type PrContext} from './context.js';
import {
	parseCommitSuggestion,
	parsePrSuggestion,
	type CommitSuggestion,
	type PrSuggestion,
} from './parse.js';
import {buildCommitPrompt, buildPrPrompt} from './prompt.js';
import {generateText} from './providers.js';

export async function suggestCommit(
	settings: AiSettings,
	context: CommitContext,
	signal: AbortSignal,
): Promise<CommitSuggestion> {
	const spec = buildCommitPrompt({
		branch: context.branch,
		summary: context.summary,
		patch: context.patch,
		// Always ask for a branch: `b` and `p` need one and it costs a few tokens.
		includeBranch: true,
		style: settings.style,
		instructions: settings.instructions,
		recentSubjects: context.recentSubjects,
		repoInstructions: context.repoInstructions,
	});
	return parseCommitSuggestion(await generateText(settings, spec, signal));
}

export async function suggestPr(
	settings: AiSettings,
	context: PrContext & {baseBranch: string; headBranch: string},
	fallbackTitle: string,
	signal: AbortSignal,
): Promise<PrSuggestion> {
	const spec = buildPrPrompt({
		...context,
		style: settings.style,
		instructions: settings.instructions,
	});
	return parsePrSuggestion(
		await generateText(settings, spec, signal),
		fallbackTitle,
	);
}
