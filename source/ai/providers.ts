import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {runProcess} from '../lib/process.js';
import {type AiSettings} from './config.js';
import {type PromptSpec} from './prompt.js';

export class AiError extends Error {
	/** Few-word reason for the dim tag, e.g. `401 bad key`. */
	readonly short: string;

	constructor(short: string, detail?: string) {
		super(detail ?? short);
		this.short = short;
	}
}

const requestTimeoutMs = 90_000;

function requireKey(settings: AiSettings): string {
	if (!settings.apiKey) {
		throw new AiError('no api key', 'No API key found. Run `ckout config`.');
	}

	return settings.apiKey;
}

function httpError(status: number, detail: string): AiError {
	const reason =
		status === 401 || status === 403
			? `${status} bad key`
			: status === 404
			? '404 model not found'
			: status === 429
			? '429 rate limited'
			: `${status} error`;
	return new AiError(reason, detail);
}

async function generateAnthropic(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	const client = new Anthropic({
		apiKey: requireKey(settings),
		timeout: requestTimeoutMs,
		maxRetries: 1,
	});

	try {
		const response = await client.messages.create(
			{
				model: settings.model,
				// eslint-disable-next-line @typescript-eslint/naming-convention
				max_tokens: 4000,
				// eslint-disable-next-line @typescript-eslint/naming-convention
				output_config: {
					effort: 'low',
					format: {type: 'json_schema', schema: spec.schema},
				},
				messages: [{role: 'user', content: spec.prompt}],
			},
			{signal},
		);

		if (response.stop_reason === 'refusal') {
			throw new AiError('declined');
		}

		return response.content
			.map(block => (block.type === 'text' ? block.text : ''))
			.join('');
	} catch (error: unknown) {
		if (error instanceof AiError) {
			throw error;
		}

		if (error instanceof Anthropic.APIError && error.status) {
			throw httpError(error.status, error.message);
		}

		throw error;
	}
}

async function postJson(
	url: string,
	headers: Record<string, string>,
	body: unknown,
	signal: AbortSignal,
): Promise<unknown> {
	// AbortSignal.any needs Node 20; combine by hand to keep Node 18 working.
	const controller = new AbortController();
	const abort = () => {
		controller.abort();
	};

	const timer = setTimeout(abort, requestTimeoutMs);
	signal.addEventListener('abort', abort);
	let response: Response;
	let text: string;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {'content-type': 'application/json', ...headers},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		text = await response.text();
	} finally {
		clearTimeout(timer);
		signal.removeEventListener('abort', abort);
	}

	if (!response.ok) {
		throw httpError(response.status, text.slice(0, 500));
	}

	return JSON.parse(text) as unknown;
}

async function generateOpenAi(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	const baseUrl = (settings.baseUrl ?? 'https://api.openai.com/v1').replace(
		/\/+$/,
		'',
	);
	// Local servers (Ollama, LM Studio) take no key.
	const headers: Record<string, string> = settings.apiKey
		? {authorization: `Bearer ${settings.apiKey}`}
		: {};
	if (!settings.baseUrl) {
		requireKey(settings);
	}

	const data = (await postJson(
		`${baseUrl}/chat/completions`,
		headers,
		{
			model: settings.model,
			messages: [{role: 'user', content: spec.prompt}],
		},
		signal,
	)) as {choices?: Array<{message?: {content?: string}}>};
	return data.choices?.[0]?.message?.content ?? '';
}

async function generateGemini(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	const model = encodeURIComponent(settings.model);
	const data = (await postJson(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
		{'x-goog-api-key': requireKey(settings)},
		{
			contents: [{role: 'user', parts: [{text: spec.prompt}]}],
			generationConfig: {responseMimeType: 'application/json'},
		},
		signal,
	)) as {
		candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
	};
	return (
		data.candidates?.[0]?.content?.parts
			?.map(part => part.text ?? '')
			.join('') ?? ''
	);
}

type CliCall = {
	label: string;
	bin: string;
	args: string[];
	prompt: string;
	signal: AbortSignal;
	shell?: boolean;
};

async function runCli({
	label,
	bin,
	args,
	prompt,
	signal,
	shell = false,
}: CliCall): Promise<string> {
	let result;
	try {
		result = await runProcess(bin, args, {
			// A neutral cwd keeps agent CLIs from loading project config or tools.
			cwd: os.tmpdir(),
			input: prompt,
			signal,
			shell,
			timeoutMs: requestTimeoutMs * 2,
		});
	} catch {
		throw new AiError(`${label} not found`);
	}

	if (signal.aborted) {
		throw new AiError('cancelled');
	}

	if (result.code !== 0) {
		throw new AiError(
			`${label} exit ${result.code}`,
			result.stderr.trim() || result.stdout.trim(),
		);
	}

	return result.stdout;
}

async function generateClaudeCli(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	const args = [
		'-p',
		'--output-format',
		'text',
		'--tools',
		'',
		'--no-session-persistence',
	];
	if (settings.model) {
		args.push('--model', settings.model);
	}

	return runCli({
		label: 'claude',
		bin: 'claude',
		args,
		prompt: spec.prompt,
		signal,
	});
}

async function generateCodexCli(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ckout-'));
	const outFile = path.join(dir, 'last-message.txt');
	const args = [
		'exec',
		'--skip-git-repo-check',
		'--ephemeral',
		'--sandbox',
		'read-only',
		'--output-last-message',
		outFile,
	];
	if (settings.model) {
		args.push('--model', settings.model);
	}

	args.push('-');

	try {
		const stdout = await runCli({
			label: 'codex',
			bin: 'codex',
			args,
			prompt: spec.prompt,
			signal,
		});
		try {
			return await fs.readFile(outFile, 'utf8');
		} catch {
			return stdout;
		}
	} finally {
		await fs.rm(dir, {recursive: true, force: true});
	}
}

async function generateCommand(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	if (!settings.command) {
		throw new AiError('no command', 'Set CKOUT_AI_COMMAND or run ckout config');
	}

	return runCli({
		label: 'cmd',
		bin: settings.command,
		args: [],
		prompt: spec.prompt,
		signal,
		shell: true,
	});
}

export async function generateText(
	settings: AiSettings,
	spec: PromptSpec,
	signal: AbortSignal,
): Promise<string> {
	switch (settings.provider) {
		case 'anthropic': {
			return generateAnthropic(settings, spec, signal);
		}

		case 'openai': {
			return generateOpenAi(settings, spec, signal);
		}

		case 'gemini': {
			return generateGemini(settings, spec, signal);
		}

		case 'claude-cli': {
			return generateClaudeCli(settings, spec, signal);
		}

		case 'codex-cli': {
			return generateCodexCli(settings, spec, signal);
		}

		case 'command': {
			return generateCommand(settings, spec, signal);
		}

		case 'off': {
			throw new AiError('ai off · ckout config');
		}
	}
}

export function shortError(error: unknown): string {
	if (error instanceof AiError) {
		return error.short;
	}

	if (error instanceof Error && error.name === 'AbortError') {
		return 'cancelled';
	}

	if (error instanceof Error && error.name === 'TimeoutError') {
		return 'timed out';
	}

	return 'failed';
}
