# GitTux

Terminal UI for git. The home screen is **branches + changed files**. Diffs stay out of the way until you ask.

## Run

```bash
npm install
npm run build
node dist/cli.js
```

Launch from a git repository (the current working directory).

## Keys

- `tab` — branches list ↔ file list (while typing: checkout / commit / filter)
- `↑` `↓` — move the active list
- `enter` — checkout the highlighted branch, or open a full-screen diff of a file
- `n` — create/checkout a branch from the prompt
- `c` — commit all with a message
- `f` / `u` / `p` — fetch / pull / push (push asks to confirm)
- `d` / `e` — full-screen diff / open in `$GITTUX_EDITOR` / `$VISUAL` / `$EDITOR` / `cursor`
- `space` — mark files to stage (`s` stages them)
- `m` — merge the highlighted branch into the current one (confirms)
- `esc` — leave prompt / close diff / cancel confirm
- `ctrl+c` — quit

The prompt always shows the exact `git` command that will run.
