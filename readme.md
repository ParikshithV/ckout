# ckout

Terminal UI for git. The home screen is **branches + changed files**. Diffs stay out of the way until you ask. Every action shows the exact `git` command before it runs.

Requires **Node.js 18+** and **git** on your `PATH`.

## Install

```bash
npm install --global ckout
```

Or run without installing:

```bash
npx ckout
```

Start it from inside a git repository.

```bash
cd path/to/repo
ckout
```

## Keys

- `tab` — branches list ↔ file list (while typing: checkout / commit / filter)
- `↑` `↓` — move the active list
- `enter` — checkout the highlighted branch, or open a full-screen diff of a file
- `n` — create/checkout a branch from the prompt
- `c` — commit all with a message
- `f` / `u` / `p` — fetch / pull / push (push asks to confirm)
- `d` / `e` — full-screen diff / open in `$CKOUT_EDITOR`, `$VISUAL`, `$EDITOR`, or `cursor`
- `space` — mark files to stage (`s` stages them)
- `m` — merge the highlighted branch into the current one (confirms)
- `esc` — leave prompt / close diff / cancel confirm
- `ctrl+c` — quit

## Development

```bash
npm install
npm test
npm run build
node dist/cli.js
```
