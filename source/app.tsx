import React, {useCallback, useEffect, useMemo, useState} from 'react';
import path from 'node:path';
import {Box, Text, useApp, useStdout} from 'ink';
import {Alert, Spinner, StatusMessage} from '@inkjs/ui';
import Overview from './components/overview.js';
import ConfirmCommand from './components/confirm-command.js';
import DiffView, {diffLines} from './components/diff-view.js';
import PromptBar from './components/prompt-bar.js';
import Footer from './components/footer.js';
import {
	buildChangeActions,
	branchRef,
	checkoutPending,
	requestFromAction,
} from './git/commands.js';
import {formatCommand} from './git/format-command.js';
import {parseBranches, type GitBranch} from './git/parse-branches.js';
import {parseStatus, type RepoStatus} from './git/parse-status.js';
import {resolveRepoRoot, runGit, runGitPipeline} from './git/run.js';
import {openChangeInEditor} from './editor.js';
import {useStableInput} from './hooks/use-stable-input.js';
import {isPrintable, nextPromptMode} from './prompt.js';
import {
	type ActiveList,
	type LastCommand,
	type PendingCommand,
	type PromptMode,
} from './types.js';

function repoLabel(repoPath: string): string {
	return path.basename(repoPath);
}

function moveIndex(current: number, delta: number, length: number): number {
	if (length <= 0) {
		return 0;
	}

	return (current + delta + length) % length;
}

async function loadStatus(
	cwd: string,
	signal: AbortSignal,
): Promise<RepoStatus> {
	const result = await runGit(cwd, ['status', '--porcelain=v1', '-b'], {
		signal,
	});
	if (result.code !== 0) {
		throw new Error(result.stderr || result.stdout || 'git status failed');
	}

	return parseStatus(result.stdout);
}

async function loadBranches(
	cwd: string,
	signal: AbortSignal,
): Promise<GitBranch[]> {
	const result = await runGit(cwd, ['branch', '-a'], {signal});
	if (result.code !== 0) {
		throw new Error(result.stderr || result.stdout || 'git branch failed');
	}

	return parseBranches(result.stdout);
}

async function loadDiff(
	cwd: string,
	file:
		| {path: string; untracked: boolean; staged: boolean; unstaged: boolean}
		| undefined,
	signal: AbortSignal,
): Promise<string> {
	if (!file) {
		return '';
	}

	if (file.untracked) {
		return `(untracked) ${file.path}`;
	}

	const args = file.unstaged
		? ['diff', '--', file.path]
		: ['diff', '--cached', '--', file.path];
	const result = await runGit(cwd, args, {signal});
	return result.stdout || result.stderr || '(empty diff)';
}

export default function App() {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const [promptMode, setPromptMode] = useState<PromptMode>('checkout');
	const [activeList, setActiveList] = useState<ActiveList>('branches');
	const [insertMode, setInsertMode] = useState(false);
	const [prompt, setPrompt] = useState('');
	const [promptKey, setPromptKey] = useState(0);
	const [history, setHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [repoPath, setRepoPath] = useState<string | undefined>();
	const [status, setStatus] = useState<RepoStatus | undefined>();
	const [branches, setBranches] = useState<GitBranch[]>([]);
	const [branchIndex, setBranchIndex] = useState(0);
	const [fileIndex, setFileIndex] = useState(0);
	const [marked, setMarked] = useState<string[]>([]);
	const [diff, setDiff] = useState('');
	const [diffOffset, setDiffOffset] = useState(0);
	const [diffOpen, setDiffOpen] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [pending, setPending] = useState<PendingCommand | undefined>();
	const [busy, setBusy] = useState(false);
	const [lastCommand, setLastCommand] = useState<LastCommand | undefined>();
	const [reloadTick, setReloadTick] = useState(0);

	const files = useMemo(() => {
		const all = status?.files ?? [];
		if (promptMode !== 'filter' || prompt.trim().length === 0) {
			return all;
		}

		const needle = prompt.trim().toLowerCase();
		return all.filter(file => file.path.toLowerCase().includes(needle));
	}, [prompt, promptMode, status?.files]);

	const focusedPath = files[fileIndex]?.path;
	const selectedBranch = branches[branchIndex];
	const markedOrFocused =
		marked.length > 0 ? marked : focusedPath ? [focusedPath] : [];

	const changeActions = useMemo(
		() =>
			buildChangeActions({
				markedFiles: markedOrFocused,
				commitMessage: promptMode === 'commit' ? prompt : '',
				fileCount: status?.files.length ?? 0,
			}),
		[markedOrFocused, prompt, promptMode, status?.files.length],
	);

	const commandHint = useMemo(() => {
		if (promptMode === 'commit') {
			return changeActions[0]?.command ?? formatCommand(['commit']);
		}

		if (promptMode === 'filter') {
			return 'filter files — no git';
		}

		const typed = prompt.trim();
		if (typed.length > 0) {
			const exists = branches.some(
				branch => !branch.remote && branch.name === typed,
			);
			return exists
				? formatCommand(['checkout', typed])
				: formatCommand(['checkout', '-b', typed]);
		}

		if (selectedBranch) {
			return checkoutPending(repoPath ?? '.', selectedBranch).display;
		}

		return formatCommand(['checkout', 'branch']);
	}, [branches, changeActions, prompt, promptMode, repoPath, selectedBranch]);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const cwdRoot = await resolveRepoRoot(process.cwd());
			if (cancelled) {
				return;
			}

			if (!cwdRoot) {
				setError(`Not a git repo: ${process.cwd()}`);
				return;
			}

			setRepoPath(cwdRoot);
		})().catch((caught: unknown) => {
			if (!cancelled) {
				setError(caught instanceof Error ? caught.message : String(caught));
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!repoPath) {
			return;
		}

		const controller = new AbortController();

		(async () => {
			setError(undefined);
			const nextStatus = await loadStatus(repoPath, controller.signal);
			const nextBranches = await loadBranches(repoPath, controller.signal);
			if (controller.signal.aborted) {
				return;
			}

			setStatus(nextStatus);
			setBranches(nextBranches);
			setMarked(current =>
				current.filter(item =>
					nextStatus.files.some(file => file.path === item),
				),
			);
		})().catch((caught: unknown) => {
			if (!controller.signal.aborted) {
				setError(caught instanceof Error ? caught.message : String(caught));
			}
		});

		return () => {
			controller.abort();
		};
	}, [repoPath, reloadTick]);

	useEffect(() => {
		setFileIndex(0);
		setDiffOffset(0);
		setMarked([]);
		setDiffOpen(false);
		setActiveList('branches');
	}, [repoPath]);

	useEffect(() => {
		const current = branches.findIndex(branch => branch.current);
		if (current >= 0) {
			setBranchIndex(current);
		}
	}, [repoPath, status?.branch]);

	useEffect(() => {
		if (files.length === 0) {
			setFileIndex(0);
			return;
		}

		if (fileIndex >= files.length) {
			setFileIndex(files.length - 1);
		}
	}, [fileIndex, files.length]);

	useEffect(() => {
		if (!repoPath) {
			return;
		}

		const timer = setInterval(() => {
			setReloadTick(tick => tick + 1);
		}, 3000);

		return () => {
			clearInterval(timer);
		};
	}, [repoPath]);

	useEffect(() => {
		if (!diffOpen || !repoPath || !status) {
			return;
		}

		const file = status.files.find(item => item.path === focusedPath);
		const controller = new AbortController();

		loadDiff(repoPath, file, controller.signal)
			.then(text => {
				if (!controller.signal.aborted) {
					setDiff(text);
					setDiffOffset(0);
				}
			})
			.catch((caught: unknown) => {
				if (!controller.signal.aborted) {
					setDiff(caught instanceof Error ? caught.message : String(caught));
				}
			});

		return () => {
			controller.abort();
		};
	}, [diffOpen, focusedPath, repoPath, status]);

	const execute = useCallback(async (command: PendingCommand) => {
		setBusy(true);
		setPending(undefined);
		setLastCommand(undefined);
		try {
			const result = await runGitPipeline(command.cwd, command.steps);
			setLastCommand({
				ok: result.code === 0,
				command: command.display,
				detail: (
					result.stderr ||
					result.stdout ||
					`exit ${result.code}`
				).trim(),
			});
			setReloadTick(tick => tick + 1);
		} catch (caught: unknown) {
			setLastCommand({
				ok: false,
				command: command.display,
				detail: caught instanceof Error ? caught.message : String(caught),
			});
		} finally {
			setBusy(false);
		}
	}, []);

	const onRequest = useCallback(
		(command: PendingCommand) => {
			if (command.confirm) {
				setPending(command);
				setInsertMode(false);
				return;
			}

			void execute(command);
		},
		[execute],
	);

	const rememberPrompt = useCallback((value: string) => {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return;
		}

		setHistory(current =>
			[trimmed, ...current.filter(item => item !== trimmed)].slice(0, 50),
		);
		setHistoryIndex(-1);
	}, []);

	const exitInsert = useCallback(() => {
		setInsertMode(false);
		setPrompt('');
		setPromptKey(key => key + 1);
		setHistoryIndex(-1);
	}, []);

	const enterInsert = useCallback((seed = '') => {
		setInsertMode(true);
		setPrompt(seed);
		setPromptKey(key => key + 1);
		setHistoryIndex(-1);
	}, []);

	const runActionId = useCallback(
		(id: string) => {
			if (!repoPath) {
				return;
			}

			const action = changeActions.find(item => item.id === id);
			if (!action || action.disabled) {
				return;
			}

			onRequest(requestFromAction(repoPath, action));
		},
		[changeActions, onRequest, repoPath],
	);

	const checkoutSelected = useCallback(() => {
		if (!repoPath || !selectedBranch || selectedBranch.current) {
			return;
		}

		onRequest(checkoutPending(repoPath, selectedBranch));
	}, [onRequest, repoPath, selectedBranch]);

	const openEditor = useCallback(() => {
		if (!repoPath || !focusedPath) {
			return;
		}

		const file = status?.files.find(item => item.path === focusedPath);
		void (async () => {
			const text =
				diff.length > 0
					? diff
					: await loadDiff(repoPath, file, new AbortController().signal);
			await openChangeInEditor({
				repoPath,
				relativePath: focusedPath,
				diff: text,
			});
		})().catch((caught: unknown) => {
			setError(caught instanceof Error ? caught.message : String(caught));
		});
	}, [diff, focusedPath, repoPath, status?.files]);

	const scrollDiff = useCallback(
		(delta: number) => {
			const total = diffLines(diff).length;
			setDiffOffset(current =>
				Math.max(0, Math.min(Math.max(0, total - 1), current + delta)),
			);
		},
		[diff],
	);

	const openFullDiff = useCallback(() => {
		if (!focusedPath) {
			return;
		}

		setInsertMode(false);
		setActiveList('files');
		setDiffOpen(true);
	}, [focusedPath]);

	const submitPrompt = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			rememberPrompt(value);

			if (promptMode === 'filter') {
				exitInsert();
				return;
			}

			if (!repoPath) {
				return;
			}

			if (promptMode === 'commit') {
				const action = buildChangeActions({
					markedFiles: markedOrFocused,
					commitMessage: trimmed,
					fileCount: status?.files.length ?? 0,
				})[0];
				if (action && !action.disabled) {
					onRequest(requestFromAction(repoPath, action));
				}

				exitInsert();
				return;
			}

			if (promptMode === 'checkout') {
				const name = trimmed || selectedBranch?.name;
				if (!name) {
					return;
				}

				const exists = branches.some(
					branch => !branch.remote && branch.name === name,
				);
				onRequest({
					title: exists ? 'Checkout' : 'Create and checkout',
					cwd: repoPath,
					display: exists
						? formatCommand(['checkout', name])
						: formatCommand(['checkout', '-b', name]),
					steps: exists ? [['checkout', name]] : [['checkout', '-b', name]],
					confirm: false,
				});
				exitInsert();
			}
		},
		[
			branches,
			exitInsert,
			markedOrFocused,
			onRequest,
			promptMode,
			rememberPrompt,
			repoPath,
			selectedBranch,
			status?.files.length,
		],
	);

	useStableInput((input, key) => {
		if (key.ctrl && input === 'c') {
			exit();
			return;
		}

		if (pending) {
			if (key.escape) {
				setPending(undefined);
			}

			return;
		}

		if (busy) {
			return;
		}

		if (diffOpen) {
			if (key.escape) {
				stdout.write('\u001B[2J\u001B[3J\u001B[H');
				setDiffOpen(false);
				return;
			}

			if (input === 'e') {
				openEditor();
				return;
			}

			if (key.leftArrow) {
				setFileIndex(index => moveIndex(index, -1, files.length));
				setDiffOffset(0);
				return;
			}

			if (key.rightArrow) {
				setFileIndex(index => moveIndex(index, 1, files.length));
				setDiffOffset(0);
				return;
			}

			if (key.upArrow || key.pageUp) {
				scrollDiff(key.pageUp ? -20 : -1);
				return;
			}

			if (key.downArrow || key.pageDown) {
				scrollDiff(key.pageDown ? 20 : 1);
				return;
			}

			return;
		}

		if (key.tab && !key.shift) {
			if (insertMode) {
				setPromptMode(current => nextPromptMode(current));
				return;
			}

			setActiveList(current => (current === 'branches' ? 'files' : 'branches'));
			return;
		}

		if (insertMode) {
			if (key.escape) {
				exitInsert();
				return;
			}

			if (key.upArrow && history.length > 0) {
				const next = Math.min(history.length - 1, historyIndex + 1);
				const value = history[next] ?? '';
				setHistoryIndex(next);
				setPrompt(value);
				setPromptKey(current => current + 1);
			}

			if (key.downArrow) {
				const next = historyIndex - 1;
				if (next < 0) {
					setHistoryIndex(-1);
					setPrompt('');
					setPromptKey(current => current + 1);
					return;
				}

				setHistoryIndex(next);
				setPrompt(history[next] ?? '');
				setPromptKey(current => current + 1);
			}

			return;
		}

		if (key.escape) {
			setPrompt('');
			setError(undefined);
			setDiffOpen(false);
			return;
		}

		if (input === 'c') {
			setPromptMode('commit');
			setActiveList('files');
			enterInsert();
			return;
		}

		if (input === 'n') {
			setPromptMode('checkout');
			setActiveList('branches');
			enterInsert();
			return;
		}

		if (input === '/') {
			setPromptMode('filter');
			setActiveList('files');
			enterInsert();
			return;
		}

		if (input === 'f') {
			runActionId('fetch');
			return;
		}

		if (input === 'u') {
			runActionId('pull');
			return;
		}

		if (input === 'p') {
			runActionId('push');
			return;
		}

		if (input === 's') {
			runActionId('stage');
			return;
		}

		if (input === 'm' && selectedBranch && repoPath) {
			const ref = branchRef(selectedBranch);
			onRequest({
				title: 'Merge into current',
				cwd: repoPath,
				display: formatCommand(['merge', ref]),
				steps: [['merge', ref]],
				confirm: true,
			});
			return;
		}

		if (input === 'i') {
			enterInsert();
			return;
		}

		if (input === 'd') {
			openFullDiff();
			return;
		}

		if (input === 'e') {
			openEditor();
			return;
		}

		if (key.return) {
			if (activeList === 'branches') {
				checkoutSelected();
				return;
			}

			openFullDiff();
			return;
		}

		if (input === ' ' && focusedPath) {
			setActiveList('files');
			setMarked(current =>
				current.includes(focusedPath)
					? current.filter(item => item !== focusedPath)
					: [...current, focusedPath],
			);
			return;
		}

		if (key.upArrow || key.downArrow) {
			const delta = key.downArrow ? 1 : -1;
			if (activeList === 'files') {
				setFileIndex(index => moveIndex(index, delta, files.length));
				return;
			}

			setBranchIndex(index => moveIndex(index, delta, branches.length));
			return;
		}

		if (isPrintable(input, key) && input !== ' ') {
			enterInsert(input);
		}
	}, true);

	const cwd = repoPath ?? process.cwd();
	const terminalRows = Math.max(12, (stdout.rows ?? 24) - 1);
	const fullDiffRows = Math.max(8, terminalRows - 3);

	if (diffOpen) {
		return (
			<Box flexDirection="column" width="100%" height={terminalRows}>
				<DiffView
					filePath={focusedPath}
					diff={diff}
					offset={diffOffset}
					visibleCount={fullDiffRows}
					fullscreen
				/>
				<Footer insertMode={false} diffOpen />
			</Box>
		);
	}

	return (
		<Box flexDirection="column" width="100%" height={terminalRows}>
			<Box gap={1} paddingX={1}>
				<Text bold color="green">
					ckout
				</Text>
				<Text>{repoPath ? repoLabel(repoPath) : 'no repo'}</Text>
				<Text dimColor>
					{activeList} · {promptMode}
				</Text>
			</Box>
			{error ? <Alert variant="error">{error}</Alert> : undefined}
			{lastCommand ? (
				<StatusMessage variant={lastCommand.ok ? 'success' : 'error'}>
					{lastCommand.command}
					{lastCommand.detail ? ` — ${lastCommand.detail.slice(0, 180)}` : ''}
				</StatusMessage>
			) : undefined}
			<Box flexGrow={1}>
				<Overview
					status={status ? {...status, files} : undefined}
					branches={branches}
					branchIndex={branchIndex}
					files={files}
					focusedPath={focusedPath}
					marked={marked}
					activeList={activeList}
					isBusy={busy}
					listHeight={Math.max(8, terminalRows - 14)}
				/>
			</Box>
			{busy ? (
				<Box paddingX={1}>
					<Spinner label="Running git" />
				</Box>
			) : undefined}
			{pending ? (
				<ConfirmCommand
					title={pending.title}
					cwd={pending.cwd}
					command={pending.display}
					onConfirm={() => {
						void execute(pending);
					}}
					onCancel={() => {
						setPending(undefined);
					}}
				/>
			) : (
				<PromptBar
					mode={promptMode}
					commandHint={commandHint}
					insertMode={insertMode}
					inputKey={promptKey}
					defaultValue={prompt}
					onChange={setPrompt}
					onSubmit={submitPrompt}
				/>
			)}
			<Footer
				insertMode={insertMode}
				diffOpen={diffOpen}
				activeList={activeList}
			/>
			<Text dimColor> cwd {cwd}</Text>
		</Box>
	);
}
