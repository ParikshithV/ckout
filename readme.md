# ckout

A small git card for your terminal. Run `ckout`, glance at what's about to happen, press one key. Commit messages and PR descriptions can be written by an AI you bring yourself (API key, local model, or an agent CLI you already use).

ckout is MIT-licensed. Contributions are welcome.

Requires **Node.js 18+** and **git** on your `PATH`. PR features use the [GitHub CLI](https://cli.github.com) (`gh`).

## Install

```bash
npm install --global ckout
```

## The card

```
$ ckout
main · 3 files +42 −7
✦ Add AI commit message generation          claude-haiku · key
⏎ push   b branch   p PR   ?
```

| Key | Does                                                          |
| --- | ------------------------------------------------------------- |
| `⏎` | Commit everything and push here                               |
| `b` | Same, on a new branch named from the message (`push -u`)      |
| `p` | Same, then open a PR (on a feature branch: commit, push, PR)  |
| `e` | Edit the message · `g` regenerate · `f` pick files · `d` diff |
| `?` | Show the exact commands each key will run                     |
| `:` | `f` fetch · `u` pull · `b` branches · `r` PR · `c` config     |

When it's done the card collapses to one line:

```
✓ feat/ai-commit-messages · 3f2a91c → origin/feat/ai-commit-messages · PR #42 https://…
```

`⏎` follows the repo's state: **pull** when behind, **push** when ahead, **publish** for a new branch, **PR** when a pushed branch has none yet, and a notice when the branch has diverged. On the default branch (or any `protectedBranches`), `b` and `p` are listed first. With nothing to do, ckout prints `✓ clean` and exits.

```bash
ckout -m "Fix typo"   # use this message, skip AI
ckout -y              # run ⏎ without asking (works in scripts)
ckout --no-push       # commit only
ckout --verbose       # print the commands that ran
```

## AI, on your terms

AI is off until you turn it on. ckout never ships a key and sends nothing unless you've picked a backend.

```bash
ckout config
```

Pick a backend, then a model from a list: live from the provider's API (Anthropic, OpenAI-compatible including Ollama, Gemini), aliases for Claude Code, and your account's models for Codex (from `~/.codex/models_cache.json`). Type to filter, or type any model name. `esc` goes back a step; your current choices are preselected.

| Backend           | Uses                                                                              | Tag                      |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------ |
| Anthropic         | `ANTHROPIC_API_KEY` (default model `claude-haiku-5-5`)                            | `claude-haiku · key`     |
| OpenAI-compatible | `OPENAI_API_KEY` + optional base URL: OpenAI, OpenRouter, Groq, Ollama, LM Studio | `llama3.2 · local`       |
| Gemini            | `GEMINI_API_KEY`                                                                  | `gemini-2.5-flash · key` |
| Claude Code CLI   | `claude -p`, with its own sign-in                                                 | `claude cli`             |
| Codex CLI         | `codex exec`, with its own sign-in                                                | `codex cli`              |
| Custom command    | any command: prompt on stdin, message on stdout (e.g. `llm`)                      | `cmd`                    |

The tag sits at the end of the message line. While the model writes, you'll see `writing…` (`esc` to cancel and type your own). If it fails, the tag says why (`ai failed · 401 bad key`) and you get an empty prompt; a commit is never blocked. Editing the draft drops the `✦`.

What gets sent: the branch name, the changed file list, the diff (lockfiles skipped, capped around 40 KB), and for the default **repo** style, your last 20 commit subjects plus `AGENTS.md` / `CLAUDE.md`. Styles: `repo`, `conventional`, `custom`.

Settings live in `~/.config/ckout/config.json` (mode `600`). Environment variables win over the file:

| Variable            | Meaning                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `CKOUT_AI_PROVIDER` | `anthropic`, `openai`, `gemini`, `claude-cli`, `codex-cli`, `command`, `off` |
| `CKOUT_AI_MODEL`    | Model name                                                                   |
| `CKOUT_AI_BASE_URL` | OpenAI-compatible endpoint                                                   |
| `CKOUT_AI_API_KEY`  | Key for the chosen provider                                                  |
| `CKOUT_AI_COMMAND`  | Command for the `command` provider (turns it on by itself)                   |

Other config keys: `mergeMethod` (`squash` · `merge` · `rebase`), `protectedBranches` (array).

## Pull requests

```bash
ckout pr        # PR for the current branch
ckout pr 123    # check out PR #123
```

```
#42 Add AI commit message generation · open · ✓ 4/4 checks · approved
⏎ merge (squash)   a auto-merge   d draft   o open   x close   s method
```

Merge, auto-merge and close ask for a second press. Merging deletes the branch and puts you back on the base branch. New PRs reuse an open one if it exists, follow `.github/pull_request_template.md` when present, and fall back to `gh pr create --fill` when AI is off.

## Branches

```bash
ckout b
```

Type to filter (fuzzy), `⏎` switch (remote branches get a tracking branch), `^n` create from what you typed, `^o` merge into the current branch, `^x` delete (asks again; offers a force delete for unmerged branches).

## Development

```bash
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
