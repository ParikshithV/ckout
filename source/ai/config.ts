import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export type ProviderId =
	| 'anthropic'
	| 'openai'
	| 'gemini'
	| 'claude-cli'
	| 'codex-cli'
	| 'command'
	| 'off';

export type WritingStyle = 'repo' | 'conventional' | 'custom';

export type MergeMethod = 'squash' | 'merge' | 'rebase';

/** What lives in ~/.config/ckout/config.json. Every field is optional. */
export type StoredConfig = {
	provider?: ProviderId;
	model?: string;
	/** OpenAI-compatible endpoint (OpenRouter, Groq, Ollama, LM Studio, …). */
	baseUrl?: string;
	/** Name of the env var that holds the key; preferred over `apiKey`. */
	apiKeyEnv?: string;
	apiKey?: string;
	/** Shell command for the `command` provider: prompt on stdin, message on stdout. */
	command?: string;
	style?: WritingStyle;
	instructions?: string;
	mergeMethod?: MergeMethod;
	protectedBranches?: string[];
};

export type AiSettings = {
	provider: ProviderId;
	model: string;
	baseUrl?: string;
	apiKey?: string;
	command?: string;
	style: WritingStyle;
	instructions?: string;
	/** Short dim tag shown next to the message, e.g. `claude-haiku · key`. */
	tag: string;
};

export type Settings = {
	ai: AiSettings;
	mergeMethod: MergeMethod;
	protectedBranches: string[];
};

export const defaultModels: Record<ProviderId, string> = {
	anthropic: 'claude-haiku-5-5',
	openai: 'gpt-5-mini',
	gemini: 'gemini-2.5-flash',
	'claude-cli': 'haiku',
	'codex-cli': '',
	command: '',
	off: '',
};

export const defaultKeyEnv: Partial<Record<ProviderId, string>> = {
	anthropic: 'ANTHROPIC_API_KEY',
	openai: 'OPENAI_API_KEY',
	gemini: 'GEMINI_API_KEY',
};

const providerIds = new Set<string>(Object.keys(defaultModels));

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
	const base =
		env['XDG_CONFIG_HOME'] && env['XDG_CONFIG_HOME'].length > 0
			? env['XDG_CONFIG_HOME']
			: path.join(os.homedir(), '.config');
	return path.join(base, 'ckout', 'config.json');
}

export async function readStoredConfig(
	file = configPath(),
): Promise<StoredConfig> {
	try {
		const raw = await fs.readFile(file, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as StoredConfig) : {};
	} catch {
		return {};
	}
}

export async function writeStoredConfig(
	config: StoredConfig,
	file = configPath(),
): Promise<void> {
	await fs.mkdir(path.dirname(file), {recursive: true});
	await fs.writeFile(file, `${JSON.stringify(config, null, '\t')}\n`, {
		mode: 0o600,
	});
	// `mode` only applies on create; tighten an existing file too.
	await fs.chmod(file, 0o600);
}

function hostLabel(baseUrl: string): string {
	try {
		const {hostname} = new URL(baseUrl);
		if (
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '::1'
		) {
			return 'local';
		}

		const parts = hostname.split('.');
		return parts.length >= 2 ? parts[parts.length - 2] ?? hostname : hostname;
	} catch {
		return 'custom';
	}
}

function shortModel(model: string): string {
	return model
		.replace(/^claude-(haiku|sonnet|opus|fable)-[\d-]+$/, 'claude-$1')
		.replace(/^models\//, '');
}

export function aiTag(
	settings: Pick<AiSettings, 'provider' | 'model' | 'baseUrl'>,
): string {
	switch (settings.provider) {
		case 'off': {
			return 'ai off · ckout config';
		}

		case 'claude-cli': {
			return 'claude cli';
		}

		case 'codex-cli': {
			return 'codex cli';
		}

		case 'command': {
			return 'cmd';
		}

		case 'openai': {
			const source = settings.baseUrl ? hostLabel(settings.baseUrl) : 'key';
			return `${shortModel(settings.model)} · ${source}`;
		}

		default: {
			return `${shortModel(settings.model)} · key`;
		}
	}
}

/**
 * Merge env and the config file. AI stays off unless the user picked a provider,
 * either in the file (`ckout config`) or with CKOUT_AI_PROVIDER.
 */
export function resolveSettings(
	stored: StoredConfig,
	env: NodeJS.ProcessEnv = process.env,
): Settings {
	const envProvider = env['CKOUT_AI_PROVIDER'];
	let provider: ProviderId =
		envProvider && providerIds.has(envProvider)
			? (envProvider as ProviderId)
			: stored.provider && providerIds.has(stored.provider)
			? stored.provider
			: 'off';

	if (provider === 'off' && env['CKOUT_AI_COMMAND'] && !stored.provider) {
		provider = 'command';
	}

	const model =
		env['CKOUT_AI_MODEL'] ?? stored.model ?? defaultModels[provider];
	const baseUrl = env['CKOUT_AI_BASE_URL'] ?? stored.baseUrl;
	const keyEnv = stored.apiKeyEnv ?? defaultKeyEnv[provider];
	const apiKey =
		env['CKOUT_AI_API_KEY'] ??
		(keyEnv ? env[keyEnv] : undefined) ??
		stored.apiKey;
	const command = env['CKOUT_AI_COMMAND'] ?? stored.command;

	const ai: AiSettings = {
		provider,
		model,
		baseUrl,
		apiKey,
		command,
		style: stored.style ?? 'repo',
		instructions: stored.instructions,
		tag: '',
	};
	ai.tag = aiTag(ai);

	return {
		ai,
		mergeMethod: stored.mergeMethod ?? 'squash',
		protectedBranches: stored.protectedBranches ?? [],
	};
}

export async function loadSettings(): Promise<Settings> {
	return resolveSettings(await readStoredConfig());
}
