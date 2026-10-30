import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {type ProviderId} from './config.js';

export type ModelOption = {
	/** Empty string means "let the tool pick its own default". */
	id: string;
	note?: string;
};

export type ModelQuery = {
	provider: ProviderId;
	apiKey?: string;
	baseUrl?: string;
	/** Override for tests. */
	codexHome?: string;
};

const listTimeoutMs = 6000;

// Used when a live list is unavailable (no key yet, offline, endpoint without /models).
const fallbacks: Partial<Record<ProviderId, ModelOption[]>> = {
	anthropic: [
		{id: 'claude-haiku-5-5', note: 'fast, cheapest'},
		{id: 'claude-sonnet-5-5', note: 'balanced'},
		{id: 'claude-opus-5-5', note: 'most capable'},
	],
	'claude-cli': [
		{id: '', note: "Claude Code's default"},
		{id: 'haiku', note: 'fast, cheapest'},
		{id: 'sonnet', note: 'balanced'},
		{id: 'opus', note: 'most capable'},
	],
};

// OpenAI's /models also lists embeddings, speech and image models.
const nonChat =
	/embed|tts|whisper|dall-e|image|audio|moderation|realtime|transcribe|search|babbage|davinci/i;

async function fetchJson(
	url: string,
	headers: Record<string, string>,
): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, listTimeoutMs);
	try {
		const response = await fetch(url, {headers, signal: controller.signal});
		if (!response.ok) {
			throw new Error(`${response.status}`);
		}

		return (await response.json()) as unknown;
	} finally {
		clearTimeout(timer);
	}
}

async function anthropicModels(apiKey: string): Promise<ModelOption[]> {
	const client = new Anthropic({apiKey, timeout: listTimeoutMs, maxRetries: 0});
	const models: ModelOption[] = [];
	for await (const model of client.models.list()) {
		models.push({id: model.id, note: model.display_name});
	}

	return models;
}

async function openAiModels(
	baseUrl: string | undefined,
	apiKey: string | undefined,
): Promise<ModelOption[]> {
	const base = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
	const data = (await fetchJson(
		`${base}/models`,
		apiKey ? {authorization: `Bearer ${apiKey}`} : {},
	)) as {data?: Array<{id?: string}>};
	return (data.data ?? [])
		.map(model => model.id ?? '')
		.filter(id => id.length > 0 && !nonChat.test(id))
		.sort((a, b) => a.localeCompare(b))
		.map(id => ({id}));
}

async function geminiModels(apiKey: string): Promise<ModelOption[]> {
	const data = (await fetchJson(
		'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
		{'x-goog-api-key': apiKey},
	)) as {
		models?: Array<{
			name?: string;
			displayName?: string;
			supportedGenerationMethods?: string[];
		}>;
	};
	return (data.models ?? [])
		.filter(model =>
			model.supportedGenerationMethods?.includes('generateContent'),
		)
		.map(model => ({
			id: (model.name ?? '').replace(/^models\//, ''),
			note: model.displayName,
		}))
		.filter(model => model.id.length > 0);
}

/** Codex caches the models your account can use in ~/.codex/models_cache.json. */
export async function codexModels(codexHome?: string): Promise<ModelOption[]> {
	const home = codexHome ?? path.join(os.homedir(), '.codex');
	const options: ModelOption[] = [{id: '', note: "Codex's default"}];
	try {
		const raw = await fs.readFile(path.join(home, 'models_cache.json'), 'utf8');
		const cache = JSON.parse(raw) as {
			models?: Array<{
				slug?: string;
				description?: string;
				visibility?: string;
				priority?: number;
			}>;
		};
		const listed = (cache.models ?? [])
			.filter(model => model.slug && model.visibility !== 'hide')
			.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
		for (const model of listed) {
			options.push({id: model.slug!, note: model.description});
		}
	} catch {
		// No cache yet; the default still works.
	}

	return options;
}

/**
 * Models to offer in `ckout config`. Live lists where the provider has one,
 * otherwise a short fallback. Never throws.
 */
export async function listModels(query: ModelQuery): Promise<ModelOption[]> {
	try {
		switch (query.provider) {
			case 'anthropic': {
				if (query.apiKey) {
					const live = await anthropicModels(query.apiKey);
					if (live.length > 0) return live;
				}

				break;
			}

			case 'openai': {
				// Local servers need no key; hosted ones do.
				if (query.apiKey ?? query.baseUrl) {
					const live = await openAiModels(query.baseUrl, query.apiKey);
					if (live.length > 0) return live;
				}

				break;
			}

			case 'gemini': {
				if (query.apiKey) {
					const live = await geminiModels(query.apiKey);
					if (live.length > 0) return live;
				}

				break;
			}

			case 'codex-cli': {
				return await codexModels(query.codexHome);
			}

			default: {
				break;
			}
		}
	} catch {
		// Fall through to the static list.
	}

	return fallbacks[query.provider] ?? [];
}
