#!/usr/bin/env node
import process from 'node:process';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

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

render(<App />, {
	stdin: process.stdin,
	stdout: process.stdout,
});
