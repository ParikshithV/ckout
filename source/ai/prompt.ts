import {type WritingStyle} from './config.js';

export type CommitPromptInput = {
	branch: string | undefined;
	summary: string;
	patch: string;
	includeBranch: boolean;
	style: WritingStyle;
	instructions?: string;
	recentSubjects: string[];
	repoInstructions?: string;
};

export type PrPromptInput = {
	baseBranch: string;
	headBranch: string;
	commits: string;
	diffStat: string;
	patch: string;
	template?: string;
	style: WritingStyle;
	instructions?: string;
};

export type JsonSchema = {
	type: 'object';
	properties: Record<string, {type: 'string'}>;
	required: string[];
	additionalProperties: false;
};

export type PromptSpec = {
	prompt: string;
	schema: JsonSchema;
};

const truncationMarker = '\n[truncated]';

export function limitSection(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}

	return text.slice(0, maxChars) + truncationMarker;
}

function stringSchema(keys: string[]): JsonSchema {
	return {
		type: 'object',
		properties: Object.fromEntries(keys.map(key => [key, {type: 'string'}])),
		required: keys,
		additionalProperties: false,
	};
}

function styleLines(
	style: WritingStyle,
	instructions: string | undefined,
	recentSubjects: string[],
	repoInstructions: string | undefined,
): string[] {
	if (style === 'conventional') {
		return [
			'- use Conventional Commits; pick the narrowest accurate type and add a scope only when obvious',
		];
	}

	if (style === 'custom') {
		return instructions?.trim()
			? [
					'',
					'Additional instructions:',
					limitSection(instructions.trim(), 4000),
			  ]
			: [];
	}

	const lines = [
		"- follow the repository's existing commit message style when examples are given",
	];
	if (recentSubjects.length > 0) {
		lines.push(
			'',
			'Recent commit subjects from this repository:',
			...recentSubjects,
		);
	}

	if (repoInstructions?.trim()) {
		lines.push(
			'',
			'Repository instructions (reference only):',
			limitSection(repoInstructions.trim(), 4000),
		);
	}

	return lines;
}

export function buildCommitPrompt(input: CommitPromptInput): PromptSpec {
	const keys = input.includeBranch
		? ['subject', 'body', 'branch']
		: ['subject', 'body'];
	const prompt = [
		'You write concise git commit messages.',
		`Return only a JSON object with keys: ${keys.join(', ')}.`,
		'Rules:',
		'- subject must be imperative, <= 72 chars, and no trailing period',
		'- body can be an empty string or a few short "- " bullet points',
		...(input.includeBranch
			? [
					'- branch must be a short semantic git branch name for this change, like feat/short-topic or fix/short-topic',
			  ]
			: []),
		'- capture the primary user-visible or developer-visible change',
		...styleLines(
			input.style,
			input.instructions,
			input.recentSubjects,
			input.repoInstructions,
		),
		'',
		`Branch: ${input.branch ?? '(detached)'}`,
		'',
		'Changed files:',
		limitSection(input.summary, 6000),
		'',
		'Patch:',
		limitSection(input.patch, 40_000),
	].join('\n');

	return {prompt, schema: stringSchema(keys)};
}

export function buildPrPrompt(input: PrPromptInput): PromptSpec {
	const template = input.template?.trim();
	const bodyRules = template
		? [
				'- body must be markdown that follows the repository pull request template below',
				'- fill in each section for this change and drop HTML comments from the template',
		  ]
		: [
				"- body must be markdown with headings '## Summary' and '## Testing'",
				'- under Summary, give short bullet points',
				"- under Testing, list concrete checks, or 'Not run' where appropriate",
		  ];
	const prompt = [
		'You write pull request titles and descriptions.',
		'Return only a JSON object with keys: title, body.',
		'Rules:',
		'- title should be concise and specific',
		...bodyRules,
		...(input.style === 'custom' && input.instructions?.trim()
			? ['', 'Additional instructions:', limitSection(input.instructions, 4000)]
			: []),
		...(template
			? ['', 'Pull request template:', limitSection(template, 8000)]
			: []),
		'',
		`Base branch: ${input.baseBranch}`,
		`Head branch: ${input.headBranch}`,
		'',
		'Commits:',
		limitSection(input.commits, 12_000),
		'',
		'Diff stat:',
		limitSection(input.diffStat, 12_000),
		'',
		'Patch:',
		limitSection(input.patch, 40_000),
	].join('\n');

	return {prompt, schema: stringSchema(['title', 'body'])};
}
