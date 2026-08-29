#!/usr/bin/env node
import process from 'node:process';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import {enterAppScreen, leaveAppScreen} from './lib/terminal.js';

meow(
	`
	Usage
	  $ ckout

	ckout: branches and changed files on one screen. Diff is opt-in.

	Keys
	  tab       Prompt → branches → files (shift+tab reverse)
	  enter     Commit from the prompt, or checkout / open a diff from a list
	  n         New branch (prompt)
	  c / i     Back to the commit message
	  f / u / p Fetch / pull / push
	  d / e     Full-screen diff / open in editor
	  esc       Lists ↔ prompt
	  ctrl+c    Quit
`,
	{
		importMeta: import.meta,
		autoHelp: true,
		autoVersion: true,
	},
);

if (process.stdin.isTTY) {
	process.stdin.resume();
}

enterAppScreen(process.stdout);

const ink = render(<App />, {
	stdin: process.stdin,
	stdout: process.stdout,
});

const dismissUi = (): void => {
	try {
		ink.clear();
	} catch {
		// Ink may already have unmounted.
	}

	leaveAppScreen(process.stdout);
};

process.once('exit', dismissUi);
await ink.waitUntilExit();
dismissUi();
