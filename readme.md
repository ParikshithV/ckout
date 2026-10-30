<div align="center">

# ckout

**A tiny Git control room for your terminal.**

Review changes, write a commit, push, and open a PR — all from one keyboard friendly card.

[![npm version](https://img.shields.io/npm/v/ckout?style=flat-square)](https://www.npmjs.com/package/ckout)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

</div>

```text
┌─ main · 3 files changed ──────────────────────┐
│  ✦  Add a useful commit message               │
│                                               │
│  ↵ commit & push   b new branch   p open PR   │
└───────────────────────────────────────────────┘
```

## Get started

```bash
npm install --global ckout
cd your-git-repo
ckout
```

Requires **Node.js 18+** and **Git**. PR actions also use [GitHub CLI](https://cli.github.com/).

## At a glance

| Key | Action |
|:---:|---|
| `↵` | Commit and push on this branch |
| `b` | Create a branch, commit and push |
| `p` | Create a branch, commit, push and open a PR |
| `e` · `g` · `f` · `d` | Edit message · regenerate · choose files · view diff |

```bash
ckout -m "Fix typo"   # supply your own message
ckout -y              # run without confirmation
ckout pr              # manage this branch's PR
ckout b                # switch or manage branches
ckout config           # choose an AI provider (optional)
```

AI is off by default. Bring your own provider or command; ckout sends nothing until you configure it. Run `ckout config` to get started.

## Build

```bash
npm install
npm run build
npm test
```

MIT licensed · Contributions welcome.
