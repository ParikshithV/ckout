import process from 'node:process';
import React, {useEffect, useMemo, useState} from 'react';
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
import {listModels, type ModelOption} from '../ai/models.js';
import {useStableInput} from '../hooks/use-stable-input.js';
import {commandExists} from '../lib/process.js';
import {windowedSlice} from '../lib/windowed.js';
import {type ViewProps} from '../types.js';
import {fuzzyMatch} from './branch-picker.js';
import {LineInput, useLineInput} from './line-input.js';

type Choice = {value: string; label: string; note?: string};

export type Field =
	| {
			id: string;
			kind: 'choice';
			label: string;
			question?: string;
			choices: Choice[];
			initial: string;
	  }
	| {
			id: string;
			kind: 'model';
			label: string;
			question?: string;
			initial: string;
	  }
	| {
			id: string;
			kind: 'input' | 'secret';
			label: string;
			question?: string;
			initial: string;
			placeholder?: string;
	  };

const providerChoices: Choice[] = [
	{value: 'anthropic', label: 'Anthropic API'},
	{
		value: 'openai',
		label: 'OpenAI-compatible',
		note: 'OpenAI, OpenRouter, Groq, Ollama, LM Studio',
	},
	{value: 'gemini', label: 'Gemini API'},
	{value: 'claude-cli', label: 'Claude Code CLI'},
	{value: 'codex-cli', label: 'Codex CLI'},
	{value: 'command', label: 'Custom command', note: 'prompt on stdin'},
	{value: 'off', label: 'Off'},
];

const styleChoices: Choice[] = [
	{
		value: 'repo',
		label: 'Match this repo',
		note: 'copies recent commit subjects, follows AGENTS.md / CLAUDE.md',
	},
	{
		value: 'conventional',
		label: 'Conventional Commits',
		note: 'feat(scope): …, fix: …',
	},
	{value: 'custom', label: 'Custom instructions', note: 'write your own rules'},
];

const visibleRows = 8;

/** The steps after picking a provider. Depends on earlier answers (custom style adds one). */
export function fieldsFor(
	provider: ProviderId,
	stored: StoredConfig,
	env: NodeJS.ProcessEnv,
	answers: Record<string, string> = {},
): Field[] {
	if (provider === 'off') {
		return [];
	}

	const same = stored.provider === provider;
	const fields: Field[] = [];

	if (provider === 'command') {
		fields.push({
			id: 'command',
			kind: 'input',
			label: 'command',
			question:
				'Command that reads the prompt on stdin and prints the message.',
			initial: stored.command ?? '',
			placeholder: 'e.g. llm -m gpt-4o-mini',
		});
	} else {
		if (provider === 'openai') {
			fields.push({
				id: 'baseUrl',
				kind: 'input',
				label: 'base URL',
				question: 'Where the OpenAI-compatible API lives.',
				initial: (same ? stored.baseUrl : undefined) ?? '',
				placeholder: 'blank for OpenAI · http://localhost:11434/v1 for Ollama',
			});
		}

		// Ask for the key before the model, so the model list can load with it.
		const keyEnv = defaultKeyEnv[provider];
		if (keyEnv && !env[keyEnv]) {
			const saved = same && Boolean(stored.apiKey);
			fields.push({
				id: 'apiKey',
				kind: 'secret',
				label: 'API key',
				question: `Saved to ${configPath()}.`,
				initial: '',
				placeholder: saved
					? 'blank keeps the saved key'
					: `blank to skip and set ${keyEnv} later`,
			});
		}

		fields.push({
			id: 'model',
			kind: 'model',
			label: 'model',
			question: 'Which model writes your commit messages and PR text.',
			initial: (same ? stored.model : undefined) ?? defaultModels[provider],
		});
	}

	fields.push({
		id: 'style',
		kind: 'choice',
		label: 'commit style',
		question: 'How should AI-written commit messages be worded?',
		choices: styleChoices,
		initial: stored.style ?? 'repo',
	});

	if (answers['style'] === 'custom') {
		fields.push({
			id: 'instructions',
			kind: 'input',
			label: 'instructions',
			question: 'Rules the AI follows when writing commit messages.',
			initial: stored.instructions ?? '',
			placeholder: 'e.g. lowercase subjects, mention the ticket id',
		});
	}

	return fields;
}

/** Model rows for the current filter, with a "use what I typed" row when nothing matches exactly. */
export function modelRows(
	models: ModelOption[],
	query: string,
): Array<ModelOption & {typed?: boolean}> {
	const needle = query.trim();
	const matches = models.filter(
		model =>
			fuzzyMatch(model.id || 'default', needle) ||
			fuzzyMatch(model.note ?? '', needle),
	);
	if (needle && !models.some(model => model.id === needle)) {
		return [{id: needle, note: 'use this name', typed: true}, ...matches];
	}

	return matches;
}

export default function ConfigView({
	onDone,
	onSaved,
}: ViewProps & {onSaved: (settings: Settings) => void}) {
	const [stored, setStored] = useState<StoredConfig | undefined>();
	const [installed, setInstalled] = useState<Record<string, boolean>>({});
	const [provider, setProvider] = useState<ProviderId | undefined>();
	const [step, setStep] = useState(0);
	const [index, setIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [models, setModels] = useState<ModelOption[] | undefined>();
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
				choice => choice.value === (config.provider ?? 'off'),
			);
			setIndex(Math.max(0, current));
		})();
	}, []);

	const fields = useMemo(
		() =>
			provider && stored
				? fieldsFor(provider, stored, process.env, answers)
				: [],
		[answers, provider, stored],
	);
	const field = provider ? fields[step] : undefined;

	// Load models when the model step opens.
	useEffect(() => {
		if (field?.kind !== 'model' || !provider || !stored) {
			return;
		}

		let cancelled = false;
		setModels(undefined);
		const keyEnv = defaultKeyEnv[provider];
		const apiKey =
			answers['apiKey'] ??
			(keyEnv ? process.env[keyEnv] : undefined) ??
			(stored.provider === provider ? stored.apiKey : undefined);
		void listModels({
			provider,
			apiKey: apiKey === '' ? undefined : apiKey,
			baseUrl: answers['baseUrl'] === '' ? undefined : answers['baseUrl'],
		}).then(list => {
			if (cancelled) return;
			setModels(list);
			const wanted = answers[field.id] ?? field.initial;
			const at = list.findIndex(model => model.id === wanted);
			setIndex(Math.max(0, at));
		});
		return () => {
			cancelled = true;
		};
	}, [field?.id, provider]);

	const enterStep = (
		nextFields: Field[],
		nextStep: number,
		nextAnswers: Record<string, string>,
	) => {
		const next = nextFields[nextStep];
		setStep(nextStep);
		if (!next) return;
		const previous = nextAnswers[next.id];
		if (next.kind === 'choice') {
			const at = next.choices.findIndex(
				choice => choice.value === (previous ?? next.initial),
			);
			setIndex(Math.max(0, at));
		} else if (next.kind === 'model') {
			input.set('');
		} else {
			input.set(next.kind === 'secret' ? '' : previous ?? next.initial);
		}
	};

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

		if (values['style']) {
			next.style = values['style'] as WritingStyle;
		}

		if (chosen !== base.provider) {
			delete next.apiKeyEnv;
			delete next.apiKey;
		}

		if (values['apiKey']) {
			next.apiKey = values['apiKey'];
		}

		await writeStoredConfig(next);
		const settings = resolveSettings(next);
		onSaved(settings);
		onDone(`✓ ai: ${settings.ai.tag} · saved ${configPath()}`);
	};

	const answer = (value: string) => {
		if (!field || !provider || !stored) return;
		const nextAnswers = {...answers, [field.id]: value};
		setAnswers(nextAnswers);
		const nextFields = fieldsFor(provider, stored, process.env, nextAnswers);
		if (step + 1 >= nextFields.length) {
			void save(provider, nextAnswers);
			return;
		}

		enterStep(nextFields, step + 1, nextAnswers);
	};

	const chooseProvider = (value: ProviderId) => {
		if (!stored) return;
		const nextFields = fieldsFor(value, stored, process.env);
		setProvider(value);
		setAnswers({});
		if (nextFields.length === 0) {
			void save(value, {});
			return;
		}

		enterStep(nextFields, 0, {});
	};

	const back = () => {
		if (!provider) {
			onDone('');
			return;
		}

		if (step === 0) {
			setProvider(undefined);
			setIndex(
				Math.max(
					0,
					providerChoices.findIndex(choice => choice.value === provider),
				),
			);
			return;
		}

		enterStep(fields, step - 1, answers);
	};

	const rows = useMemo(() => {
		if (!provider) return providerChoices;
		if (field?.kind === 'choice') return field.choices;
		if (field?.kind === 'model' && models) {
			return modelRows(models, input.value).map(model => ({
				value: model.id,
				label: model.id || 'default',
				note: model.note,
			}));
		}

		return [];
	}, [field, input.value, models, provider]);
	const isList =
		!provider || field?.kind === 'choice' || field?.kind === 'model';

	useStableInput((value, key) => {
		if (key.ctrl && value === 'c') {
			onDone('');
			return;
		}

		if (key.escape) {
			back();
			return;
		}

		if (isList && (key.upArrow || key.downArrow)) {
			const delta = key.downArrow ? 1 : -1;
			setIndex(
				current => (current + delta + rows.length) % Math.max(1, rows.length),
			);
			return;
		}

		if (key.return) {
			if (!provider) {
				const choice = rows[index];
				if (choice) chooseProvider(choice.value as ProviderId);
				return;
			}

			if (field?.kind === 'choice') {
				const choice = rows[index];
				if (choice) answer(choice.value);
				return;
			}

			if (field?.kind === 'model') {
				if (!models) return;
				const row = rows[Math.min(index, rows.length - 1)];
				answer(row ? row.value : input.value.trim());
				return;
			}

			answer(input.value.trim());
			return;
		}

		// Typing filters the model list; it does nothing on plain choice lists.
		if (
			(field?.kind === 'model' ||
				field?.kind === 'input' ||
				field?.kind === 'secret') &&
			input.handle(value, key)
		) {
			setIndex(0);
		}
	});

	if (!stored) {
		return <Spinner label="reading config" />;
	}

	const currentTag = resolveSettings(stored).ai.tag;
	const providerLabel = providerChoices.find(c => c.value === provider)?.label;
	const progress =
		provider && fields.length > 1 ? ` ${step + 1}/${fields.length}` : '';

	const noteFor = (choice: Choice): {text?: string; dim: boolean} => {
		if (provider) return {text: choice.note, dim: false};
		const parts: string[] = [];
		const envKey = defaultKeyEnv[choice.value as ProviderId];
		let unavailable = false;
		if (envKey) {
			parts.push(process.env[envKey] ? `${envKey} found` : `needs ${envKey}`);
		} else if (choice.value in installed) {
			unavailable = !installed[choice.value];
			parts.push(
				unavailable ? 'not installed' : 'installed · uses its sign-in',
			);
		} else if (choice.note) {
			parts.push(choice.note);
		}

		if ((stored.provider ?? 'off') === choice.value) parts.push('current');
		return {text: parts.join(' · '), dim: unavailable};
	};

	let hint = '⏎ next · esc back';
	if (field?.kind === 'model') {
		hint = 'type to filter or name any model · ↑↓ · ⏎ pick · esc back';
	} else if (isList) {
		hint = `↑↓ choose · ⏎ ${provider ? 'next' : 'select'} · esc ${
			provider ? 'back' : 'cancel'
		}`;
	}

	const window = windowedSlice(rows, index, visibleRows);

	return (
		<Box flexDirection="column">
			<Text>
				<Text bold>ai</Text>
				<Text dimColor>
					{' · '}
					{provider ? providerLabel : `now ${currentTag}`}
					{field ? ` · ${field.label}` : ''}
					{progress}
				</Text>
			</Text>

			{field?.question ? <Text>{field.question}</Text> : undefined}

			{field?.kind === 'model' ? (
				<Text>
					<Text color="cyan">› </Text>
					<LineInput
						active
						value={input.value}
						cursor={input.cursor}
						placeholder={`filter · now ${field.initial || 'default'}`}
					/>
				</Text>
			) : undefined}

			{field?.kind === 'model' && !models ? (
				<Spinner label="loading models" />
			) : isList ? (
				window.items.map((choice, offset) => {
					const focused = window.start + offset === index;
					const note = noteFor(choice);
					// Only a saved choice is "current"; the preselected default isn't.
					const isCurrent =
						field?.kind === 'model' &&
						stored.provider === provider &&
						choice.value === (stored.model ?? '');
					return (
						<Text
							key={`${choice.value}:${choice.label}`}
							color={focused ? 'cyan' : undefined}
							dimColor={!focused && note.dim}
							wrap="truncate-end"
						>
							{focused ? '› ' : '  '}
							{choice.label}
							{note.text ? <Text dimColor> · {note.text}</Text> : ''}
							{isCurrent ? <Text dimColor> · current</Text> : ''}
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
						placeholder={field.placeholder ?? field.label}
					/>
				</Text>
			) : undefined}

			{isList && rows.length > visibleRows ? (
				<Text dimColor>
					{'  '}
					{index + 1}/{rows.length}
				</Text>
			) : undefined}

			<Text dimColor>{hint}</Text>
		</Box>
	);
}
