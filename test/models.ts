import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {codexModels, listModels} from '../source/ai/models.js';

test('codexModels reads the visible models from the Codex cache, by priority', async t => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ckout-codex-'));
	await fs.writeFile(
		path.join(home, 'models_cache.json'),
		JSON.stringify({
			models: [
				{slug: 'b', priority: 9, visibility: 'list', description: 'older'},
				{slug: 'hidden', priority: 1, visibility: 'hide'},
				{slug: 'a', priority: 5, visibility: 'list', description: 'fast'},
			],
		}),
	);
	const models = await codexModels(home);
	t.deepEqual(
		models.map(model => model.id),
		['', 'a', 'b'],
	);
	t.is(models[1]?.note, 'fast');
});

test('codexModels still offers the default without a cache', async t => {
	const models = await codexModels(path.join(os.tmpdir(), 'ckout-missing'));
	t.deepEqual(
		models.map(model => model.id),
		[''],
	);
});

test('listModels falls back without a key', async t => {
	const anthropic = await listModels({provider: 'anthropic'});
	t.true(anthropic.some(model => model.id === 'claude-haiku-5-5'));
	const cli = await listModels({provider: 'claude-cli'});
	t.deepEqual(
		cli.map(model => model.id),
		['', 'haiku', 'sonnet', 'opus'],
	);
	t.deepEqual(await listModels({provider: 'command'}), []);
});
