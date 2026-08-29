# ckout

Open-source terminal UI for git. Review branches and local changes without leaving the keyboard. Diffs stay out of the way until you ask. Every mutating action shows the **exact `git` command** before it runs.

ckout is MIT-licensed. Contributions are welcome.

Requires **Node.js 18+** and **git** on your `PATH`.

## Install

```bash
npm install --global ckout
```

Or run without installing:

```bash
npx ckout
```

Start it from inside a git repository:

```bash
cd path/to/repo
ckout
```

```bash
ckout --help
ckout --version
```

## Why ckout

- One screen for **local branches** (plus remotes you have not checked out yet) and **changed files**
- Keyboard starts on the **commit message**; `tab` moves to branches and files when you need diffs
- Diff is **opt-in** (full-screen pager or your editor), not the default view
- Commands are transparent: the prompt and confirm overlay print the `git` argv that will run
- Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs)

## Screen

```
ckout  my-repo  prompt · commit
[main]  3 changed  ↑1 ↓0
┌─ Branches 1/12 ───┐  ┌─ Changes ────────────┐
│ * main            │  │ [ ] M src/app.tsx    │
│   feature/login   │  │ [x] A readme.md      │
│                   │  │                      │
└───────────────────┘  └──────────────────────┘
commit   git add -A && git commit -m "…"
> █Commit message
enter commit · tab branches · esc lists · …
```

| Area     | What it shows                                                      |
| -------- | ------------------------------------------------------------------ |
| Header   | Product name, repo folder, focus (prompt / branches / files), mode |
| Status   | Current branch, dirty/clean, ahead/behind vs upstream              |
| Branches | Local branches, then remotes with no local twin; `*` = checked out |
| Changes  | Working-tree files with index/worktree status (`M`, `A`, `??`, …)  |
| Prompt   | Commit message by default; `>` means the input has keyboard focus  |
| Footer   | Context-sensitive key hints                                        |

Status refreshes about every 3 seconds after git commands, and whenever the working tree is polled.

## Features

### Branches

- Lists **local** branches first. Remote-tracking refs (`origin/foo`) appear only when there is no local `foo` (so `origin/main` is hidden if you already have `main`). Remotes are dimmed. Ahead/behind vs upstream stays in the status bar.
- `↑` `↓` move the highlight; the list scrolls so every branch is reachable
- `enter` on a **local** branch runs `git checkout <branch>` immediately
- `enter` on a **remote** branch asks to confirm, then `git checkout -B <short> <remote-ref>`
- `n` opens the prompt to **create or checkout** by name (`git checkout` or `git checkout -b`)
- `m` **merges** the highlighted branch into the current one (confirm): `git merge <ref>`

### Changes

- File list of uncommitted work; `tab` from the commit prompt focuses Branches, then Changes
- `space` marks/unmarks files (`[x]`); if none are marked, stage uses the highlighted file
- `s` stages marked files: `git add -- <files>`
- `/` filters the file list by path (prompt mode `filter`; no git)
- `c` or `i` returns to the **commit message** (the default focus when ckout starts). `enter` submits `git add -A && git commit -m "<message>"` (confirm)

### Diff (opt-in)

Diff is not shown on the home screen.

- `enter` (on a file) or `d` — full-screen unified diff (loads `git diff` / `git diff --cached`)
- `↑` `↓` / `PgUp` `PgDn` — scroll; `←` `→` — previous/next file
- `esc` — back to the home screen
- `e` — open the file in an editor; if the file is gone (deleted), opens a temporary `.diff` instead

### Sync with remotes

| Key | Command     | Confirm?        |
| --- | ----------- | --------------- |
| `f` | `git fetch` | No              |
| `u` | `git pull`  | No              |
| `p` | `git push`  | Yes (`Y` / `n`) |

### Command transparency

- Starts focused on the **commit message**. `tab` moves to branches, then files (for diffs); `shift+tab` goes the other way. `esc` from the prompt also focuses the file list without clearing the message.
- Confirm overlays (`Y` / `n`; Enter does not confirm) are used for **commit**, **push**, **merge**, and **remote checkout**
- The overlay includes the **working directory** (repo root)

ckout runs `git` with explicit argv (no shell). It does not use a high-level git library for writes.

## Keyboard reference

Focus starts on the commit message. Lists are idle until you `tab` (or `esc`) to them:

| Key         | Action                                          |
| ----------- | ----------------------------------------------- |
| `tab`       | Prompt → Branches → Changes → prompt            |
| `shift+tab` | Reverse that cycle                              |
| `↑` `↓`     | Move in the active list                         |
| `enter`     | Checkout highlighted branch, or open file diff  |
| `n`         | New / checkout branch (prompt)                  |
| `c` / `i`   | Focus the commit message (keeps typed text)     |
| `/`         | Filter files                                    |
| `f`         | Fetch                                           |
| `u`         | Pull (or unstage when Changes is focused)       |
| `p`         | Push (confirm)                                  |
| `s`         | Stage marked (or highlighted) files             |
| `m`         | Merge highlighted branch into current (confirm) |
| `d`         | Full-screen diff of the highlighted file        |
| `e`         | Open highlighted file (or patch) in editor      |
| `space`     | Mark/unmark a file (focuses Changes)            |
| `esc`       | From a list: back to the commit prompt          |
| `ctrl+c`    | Quit                                            |

While typing in the prompt:

| Key         | Action                              |
| ----------- | ----------------------------------- |
| `enter`     | Submit (commit / checkout / filter) |
| `↑` `↓`     | Prompt history                      |
| `tab`       | Focus Branches (keep the message)   |
| `shift+tab` | Focus Changes                       |
| `esc`       | Focus Changes (keep the message)    |

Full-screen diff:

| Key           | Action             |
| ------------- | ------------------ |
| `↑` `↓`       | Scroll one line    |
| `PgUp` `PgDn` | Scroll a page      |
| `←` `→`       | Other changed file |
| `e`           | Open in editor     |
| `c`           | Close diff, commit |
| `esc`         | Close diff         |

Confirm overlay:

| Key   | Action                |
| ----- | --------------------- |
| `Y`   | Run the shown command |
| `n`   | Cancel                |
| `esc` | Cancel                |

## Editor

`e` uses, in order:

1. `$CKOUT_EDITOR`
2. `$VISUAL`
3. `$EDITOR`
4. Then, if that binary is missing: `cursor`, `code`, `open -t` (macOS), `nano`, `vim`, `vi`

A missing editor no longer crashes the TUI. If none of the candidates exist, the status line asks you to set `CKOUT_EDITOR`.

GUI tools (`cursor`, `code`, `code-insiders`, `subl`, `atom`, `windsurf`, `open`) open detached so the TUI stays up. Other editors inherit the terminal.

Example:

```bash
export CKOUT_EDITOR='code -g'
ckout
```

## Development

```bash
git clone <your-fork-url>
cd ckout
npm install
npm test
npm run build
node dist/cli.js
```

| Script          | Purpose                       |
| --------------- | ----------------------------- |
| `npm test`      | Prettier, xo, Ava             |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev`   | Watch compile                 |

Stack: TypeScript, React 18, Ink 5, `@inkjs/ui`. Git is spawned as a child process.

## Contributing

ckout is open source under the [MIT License](LICENSE).

- Bug reports and ideas: open an issue on the project tracker
- Code: fork, branch, keep changes focused, run `npm test`
- Keep git commands visible in the UI when you add actions

## License

[MIT](LICENSE) © Parikshith V
