import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {
	aiTag,
	hasStoredConfig,
	resolveSettings,
	writeStoredConfig,
} from '../source/ai/config.js';
import {
	branchFromSubject,
	cleanSubject,
	extractJson,
	fallbackSubject,
	parseCommitSuggestion,
	parsePrSuggestion,
	sanitizeBranchName,
	uniqueBranchName,
} from '../source/ai/parse.js';
import {
	buildCommitPrompt,
	buildPrPrompt,
	limitSection,
} from '../source/ai/prompt.js';

test('AI stays off until a provider is picked', t => {
	const settings = resolveSettings({}, {ANTHROPIC_API_KEY: 'k'});
	t.is(settings.ai.provider, 'off');
	t.is(settings.ai.tag, 'ai off · ckout config');
});

test('hasStoredConfig is false until the config is written', async t => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ckout-'));
	const file = path.join(dir, 'ckout', 'config.json');
	t.false(await hasStoredConfig(file));
	await writeStoredConfig({provider: 'off'}, file);
	t.true(await hasStoredConfig(file));
	await fs.rm(dir, {recursive: true});
});

test('provider from the config file picks up its key env var', t => {
	const settings = resolveSettings(
		{provider: 'anthropic'},
		{ANTHROPIC_API_KEY: 'k'},
	);
	t.is(settings.ai.apiKey, 'k');
	t.is(settings.ai.model, 'claude-haiku-5-5');
	t.is(settings.ai.tag, 'claude-haiku · key');
});

test('env overrides the config file', t => {
	const settings = resolveSettings(
		{provider: 'anthropic', model: 'x'},
		{
			CKOUT_AI_PROVIDER: 'openai',
			CKOUT_AI_MODEL: 'llama3.2',
			CKOUT_AI_BASE_URL: 'http://localhost:11434/v1',
		},
	);
	t.is(settings.ai.provider, 'openai');
	t.is(settings.ai.tag, 'llama3.2 · local');
});

test('CKOUT_AI_COMMAND alone turns on the command provider', t => {
	const settings = resolveSettings({}, {CKOUT_AI_COMMAND: 'llm'});
	t.is(settings.ai.provider, 'command');
	t.is(settings.ai.tag, 'cmd');
});

test('tags name the source', t => {
	t.is(
		aiTag({
			provider: 'openai',
			model: 'gpt-5-mini',
			baseUrl: 'https://openrouter.ai/api/v1',
		}),
		'gpt-5-mini · openrouter',
	);
	t.is(aiTag({provider: 'claude-cli', model: 'haiku'}), 'claude cli');
	t.is(aiTag({provider: 'codex-cli', model: ''}), 'codex cli');
});

test('extractJson tolerates fences and chatter', t => {
	t.deepEqual(extractJson('```json\n{"subject":"a"}\n```'), {subject: 'a'});
	t.deepEqual(extractJson('Sure! {"subject":"b"} hope that helps'), {
		subject: 'b',
	});
	t.is(extractJson('no json'), undefined);
});

test('cleanSubject keeps one line, drops the period, caps at 72', t => {
	t.is(cleanSubject('Fix the thing.\nmore'), 'Fix the thing');
	t.is(cleanSubject('x'.repeat(100)).length, 72);
	t.is(cleanSubject('   '), fallbackSubject);
});

test('parseCommitSuggestion reads JSON or falls back to plain text', t => {
	t.deepEqual(
		parseCommitSuggestion(
			'{"subject":"Add x.","body":"- y","branch":"Feat/Add X!"}',
		),
		{
			subject: 'Add x',
			body: '- y',
			branch: 'feat/add-x',
		},
	);
	t.deepEqual(parseCommitSuggestion('Add x\n\n- y'), {
		subject: 'Add x',
		body: '- y',
	});
});

test('parsePrSuggestion falls back to the given title', t => {
	t.deepEqual(parsePrSuggestion('{"title":"","body":"b"}', 'Fallback'), {
		title: 'Fallback',
		body: 'b',
	});
});

test('branch names are git-safe and unique', t => {
	t.is(sanitizeBranchName('  Feat//Some Thing..lock '), 'feat/some-thing');
	t.is(
		branchFromSubject('feat(ui): Add the AI tag to the card'),
		'add-the-ai-tag-to',
	);
	t.is(uniqueBranchName('feat/x', ['feat/x', 'feat/x-2']), 'feat/x-3');
	t.is(uniqueBranchName('feat/y', ['feat/x']), 'feat/y');
});

test('commit prompt asks for JSON with the right keys and includes repo examples', t => {
	const spec = buildCommitPrompt({
		branch: 'main',
		summary: 'M  a.ts',
		patch: '+x',
		includeBranch: true,
		style: 'repo',
		recentSubjects: ['Fix y'],
	});
	t.deepEqual(spec.schema.required, ['subject', 'body', 'branch']);
	t.true(spec.prompt.includes('Fix y'));
	t.true(spec.prompt.includes('<= 72 chars'));
});

test('conventional style swaps repo examples for the conventional rule', t => {
	const spec = buildCommitPrompt({
		branch: 'main',
		summary: '',
		patch: '',
		includeBranch: false,
		style: 'conventional',
		recentSubjects: ['Fix y'],
	});
	t.false(spec.prompt.includes('Fix y'));
	t.true(spec.prompt.includes('Conventional Commits'));
});

test('PR prompt follows a template when there is one', t => {
	const withTemplate = buildPrPrompt({
		baseBranch: 'main',
		headBranch: 'feat/x',
		commits: '',
		diffStat: '',
		patch: '',
		template: '## What',
		style: 'repo',
	});
	t.true(withTemplate.prompt.includes('## What'));
	const without = buildPrPrompt({
		baseBranch: 'main',
		headBranch: 'x',
		commits: '',
		diffStat: '',
		patch: '',
		style: 'repo',
	});
	t.true(without.prompt.includes('## Summary'));
});

test('limitSection marks truncation', t => {
	t.is(limitSection('abcdef', 3), 'abc\n[truncated]');
	t.is(limitSection('ab', 3), 'ab');
});
