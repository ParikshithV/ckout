import process from 'node:process';
import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {Spinner} from '@inkjs/ui';
import {
	configPath,
	defaultKeyEnv,
	defaultModels,
	readStoredConfig,
	resolveSettings,
	writeStoredConfig,
	type ProviderId,
	type Settings,
	type StoredConfig,
	type WritingStyle,
} from '../ai/config.js';
import {useStableInput} from '../hooks/use-stable-input.js';
import {commandExists} from '../lib/process.js';
import {type ViewProps} from '../types.js';
import {LineInput, useLineInput} from './line-input.js';

type Choice = {value: string; label: string; note?: string};

type Field =
	| {id: string; kind: 'choice'; label: string; choices: Choice[]}
	| {id: string; kind: 'input' | 'secret'; label: string; initial: string};

const providerChoices: Choice[] = [
	{value: 'anthropic', label: 'Anthropic API key'},
	{
		value: 'openai',
		label: 'OpenAI-compatible',
		note: 'OpenAI, OpenRouter, Groq, Ollama, LM Studio',
	},
	{value: 'gemini', label: 'Gemini API key'},
	{value: 'claude-cli', label: 'Claude Code CLI', note: 'uses its sign-in'},
	{value: 'codex-cli', label: 'Codex CLI', note: 'uses its sign-in'},
	{value: 'command', label: 'Custom command', note: 'prompt on stdin'},
	{value: 'off', label: 'Off'},
];

const styleChoices: Choice[] = [
	{value: 'repo', label: 'Match this repo', note: 'recent commits, AGENTS.md'},
	{value: 'conventional', label: 'Conventional Commits'},
	{value: 'custom', label: 'Custom instructions'},
];

export function fieldsFor(
	provider: ProviderId,
	stored: StoredConfig,
	env: NodeJS.ProcessEnv,
): Field[] {
	const fields: Field[] = [];
	const sameProvider = stored.provider === provider;
	const model =
		(sameProvider ? stored.model : undefined) ?? defaultModels[provider];

	if (provider === 'off') {
		return fields;
	}

	if (provider === 'command') {
		fields.push({
			id: 'command',
			kind: 'input',
			label: 'command',
			initial: stored.command ?? 'llm -m gpt-4o-mini',
		});
	} else {
		if (provider === 'openai') {
			fields.push({
				id: 'baseUrl',
				kind: 'input',
				label: 'base URL (blank for OpenAI)',
				initial: (sameProvider ? stored.baseUrl : undefined) ?? '',
			});
		}

		fields.push({id: 'model', kind: 'input', label: 'model', initial: model});

		const keyEnv = defaultKeyEnv[provider];
		if (keyEnv && !env[keyEnv]) {
			fields.push({
				id: 'apiKey',
				kind: 'secret',
				label: `API key (or set ${keyEnv}; blank to skip)`,
				initial: '',
			});
		}
	}

	fields.push({
		id: 'style',
		kind: 'choice',
		label: 'style',
		choices: styleChoices,
	});
	return fields;
}

export default function ConfigView({
	onDone,
	onSaved,
}: ViewProps & {onSaved: (settings: Settings) => void}) {
	const [stored, setStored] = useState<StoredConfig | undefined>();
	const [installed, setInstalled] = useState<Record<string, boolean>>({});
	const [provider, setProvider] = useState<ProviderId | undefined>();
	const [fields, setFields] = useState<Field[]>([]);
	const [step, setStep] = useState(0);
	const [choiceIndex, setChoiceIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const input = useLineInput();

	useEffect(() => {
		void (async () => {
			const [config, claude, codex] = await Promise.all([
				readStoredConfig(),
				commandExists('claude'),
				commandExists('codex'),
			]);
			setStored(config);
			setInstalled({'claude-cli': claude, 'codex-cli': codex});
			const current = providerChoices.findIndex(
				choice => choice.value === config.provider,
			);
			setChoiceIndex(Math.max(0, current));
		})();
	}, []);

	const save = async (
		chosen: ProviderId,
		values: Record<string, string>,
	): Promise<void> => {
		const base = stored ?? {};
		const next: StoredConfig = {...base, provider: chosen};
		for (const key of [
			'model',
			'baseUrl',
			'command',
			'instructions',
		] as const) {
			if (key in values) {
				next[key] = values[key] === '' ? undefined : values[key];
			}
		}

		if (values['apiKey']) {
			next.apiKey = values['apiKey'];
		}

		if (values['style']) {
			next.style = values['style'] as WritingStyle;
		}

		if (chosen !== base.provider) {
			delete next.apiKeyEnv;
			if (!values['apiKey']) {
				delete next.apiKey;
			}
		}

		await writeStoredConfig(next);
		const settings = resolveSettings(next);
		onSaved(settings);
		onDone(`✓ ai: ${settings.ai.tag} · saved ${configPath()}`);
	};

	const advance = (id: string, value: string) => {
		const nextAnswers = {...answers, [id]: value};
		let nextFields = fields;
		if (id === 'style' && value === 'custom') {
			nextFields = [
				...fields,
				{
					id: 'instructions',
					kind: 'input',
					label: 'instructions',
					initial: stored?.instructions ?? '',
				},
			];
			setFields(nextFields);
		}

		setAnswers(nextAnswers);
		const nextStep = step + 1;
		if (!provider || nextStep >= nextFields.length) {
			void save(provider ?? 'off', nextAnswers);
			return;
		}

		setStep(nextStep);
		const field = nextFields[nextStep];
		if (field?.kind === 'choice') {
			setChoiceIndex(0);
		} else if (field) {
			input.set(field.initial);
		}
	};

	const chooseProvider = (value: ProviderId) => {
		const nextFields = fieldsFor(value, stored ?? {}, process.env);
		setProvider(value);
		setFields(nextFields);
		setStep(0);
		if (nextFields.length === 0) {
			void save(value, {});
			return;
		}

		const first = nextFields[0];
		if (first?.kind === 'choice') {
			setChoiceIndex(0);
		} else if (first) {
			input.set(first.initial);
		}
	};

	const field = provider ? fields[step] : undefined;
	const choices = provider
		? field?.kind === 'choice'
			? field.choices
			: []
		: providerChoices;

	useStableInput((value, key) => {
		if ((key.ctrl && value === 'c') || key.escape) {
			onDone('');
			return;
		}

		if (choices.length > 0 && (!provider || field?.kind === 'choice')) {
			if (key.upArrow || key.downArrow) {
				const delta = key.downArrow ? 1 : -1;
				setChoiceIndex(
					current => (current + delta + choices.length) % choices.length,
				);
				return;
			}

			if (key.return) {
				const choice = choices[choiceIndex];
				if (!choice) return;
				if (provider) {
					advance(field!.id, choice.value);
				} else {
					chooseProvider(choice.value as ProviderId);
				}
			}

			return;
		}

		if (key.return && field) {
			advance(field.id, input.value.trim());
			return;
		}

		input.handle(value, key);
	});

	if (!stored) {
		return <Spinner label="reading config" />;
	}

	const current = resolveSettings(stored).ai.tag;

	return (
		<Box flexDirection="column">
			<Text>
				<Text bold>ai</Text>
				<Text dimColor>
					{' '}
					·{' '}
					{provider
						? providerChoices.find(c => c.value === provider)?.label
						: `now ${current}`}
					{field ? ` · ${field.label}` : ''}
				</Text>
			</Text>
			{choices.length > 0 && (!provider || field?.kind === 'choice') ? (
				choices.map((choice, index) => {
					const envKey = defaultKeyEnv[choice.value as ProviderId];
					const note =
						envKey && process.env[envKey]
							? `${envKey} found`
							: installed[choice.value] === false
							? 'not installed'
							: installed[choice.value]
							? 'installed'
							: choice.note;
					return (
						<Text
							key={choice.value}
							color={index === choiceIndex ? 'cyan' : undefined}
						>
							{index === choiceIndex ? '› ' : '  '}
							{choice.label}
							{note ? <Text dimColor> · {note}</Text> : ''}
						</Text>
					);
				})
			) : field ? (
				<Text>
					<Text color="cyan">› </Text>
					<LineInput
						active
						value={
							field.kind === 'secret'
								? '•'.repeat(input.value.length)
								: input.value
						}
						cursor={input.cursor}
						placeholder={field.label}
					/>
				</Text>
			) : undefined}
			<Text dimColor>⏎ next · esc cancel</Text>
		</Box>
	);
}
