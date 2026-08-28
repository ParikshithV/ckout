#!/usr/bin/env node
import process from 'node:process';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

meow(
	`
	Usage
	  $ gittux

	Git TUI. Branches and changed files on one screen. Diff is opt-in.

	Keys
	  tab       Switch branches / files (prompt mode while typing)
	  enter     Checkout the selected branch, or open a file diff
	  n         New branch (prompt)
	  c         Commit (prompt)
	  f / u / p Fetch / pull / push
	  d / e     Full-screen diff / open in editor
	  esc       Back / cancel
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
