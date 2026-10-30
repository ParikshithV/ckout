#!/usr/bin/env node
import process from 'node:process';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import {hasStoredConfig, loadSettings} from './ai/config.js';
import {resolveRepoRoot, runGit} from './git/run.js';
import {type Flags, type View} from './types.js';
import Root from './ui/root.js';

const cli = meow(
	`
	Usage
	  $ ckout              Review changes, then commit & push
	  $ ckout pr [number]  Current branch's PR (merge, ready, close…), or check one out
	  $ ckout b            Switch, create, merge or delete branches
	  $ ckout config       Pick an AI backend for commit messages and PRs

	On the card
	  ⏎   commit & push here
	  b   same, on a new branch
	  p   same, on a new branch, then open a PR
	  e   edit message · g regenerate · f pick files · d diff · : more · ? plan

	Options
	  -m, --message   Use this commit message (skips AI)
	  -y, --yes       Run ⏎ without asking
	  --no-push       Commit only
	  --verbose       Print the git commands that ran
`,
	{
		importMeta: import.meta,
		autoHelp: true,
		autoVersion: true,
		flags: {
			message: {type: 'string', alias: 'm'},
			yes: {type: 'boolean', alias: 'y', default: false},
			push: {type: 'boolean', default: true},
			verbose: {type: 'boolean', default: false},
		},
	},
);

const [command, argument] = cli.input;
const views: Record<string, View> = {
	pr: 'pr',
	b: 'branch',
	branch: 'branch',
	config: 'config',
};
const view: View = command ? views[command] ?? 'commit' : 'commit';

if (command && !views[command]) {
	console.error(`Unknown command: ${command}\nRun ckout --help`);
	process.exit(2);
}

// `ckout pr 123` is a one-shot checkout; no UI needed.
if (view === 'pr' && argument) {
	const {runProcess} = await import('./lib/process.js');
	const result = await runProcess('gh', ['pr', 'checkout', argument], {
		timeoutMs: 120_000,
	}).catch(() => ({stdout: '', stderr: 'gh is not installed', code: 127}));
	const branch = (
		await runGit(process.cwd(), ['branch', '--show-current'])
	).stdout.trim();
	console.log(
		result.code === 0
			? `✓ PR #${argument} → ${branch}`
			: `✗ ${result.stderr.trim().split('\n')[0] ?? 'gh pr checkout failed'}`,
	);
	process.exit(result.code === 0 ? 0 : 1);
}

const root = await resolveRepoRoot(process.cwd());
if (!root && view !== 'config') {
	console.error(`✗ not a git repo: ${process.cwd()}`);
	process.exit(1);
}

if (!process.stdin.isTTY && !(view === 'commit' && cli.flags.yes)) {
	console.error('✗ not a terminal · use ckout -y (with -m or AI set up)');
	process.exit(2);
}

const flags: Flags = {
	yes: cli.flags.yes,
	noPush: !cli.flags.push,
	verbose: cli.flags.verbose,
	message: cli.flags.message,
};

// First run: set up AI before the first commit card, unless the env already picks it.
const firstRun =
	view === 'commit' &&
	!flags.yes &&
	!flags.message &&
	!process.env['CKOUT_AI_PROVIDER'] &&
	!process.env['CKOUT_AI_COMMAND'] &&
	!(await hasStoredConfig());

const ink = render(
	<Root
		root={root ?? process.cwd()}
		settings={await loadSettings()}
		flags={flags}
		initialView={firstRun ? 'config' : view}
		firstRun={firstRun}
	/>,
	{exitOnCtrlC: false},
);

await ink.waitUntilExit();
