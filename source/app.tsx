import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import path from 'node:path';
import {Box, Text, useApp, useStdout} from 'ink';
import {Alert, Spinner, StatusMessage} from '@inkjs/ui';
import Overview from './components/overview.js';
import ConfirmCommand from './components/confirm-command.js';
import DiffView, {displayDiffLines} from './components/diff-view.js';
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
import {
	type ChangedFile,
	parseStatus,
	type RepoStatus,
} from './git/parse-status.js';
import {resolveRepoRoot, runGit, runGitPipeline} from './git/run.js';
import {openChangeInEditor} from './editor.js';
import {useStableInput} from './hooks/use-stable-input.js';
import {
	deleteBeforeCursor,
	deleteToStart,
	deleteWordBeforeCursor,
	insertAtCursor,
	isBackwardDeleteKey,
	isPrintable,
	textLength,
} from './prompt.js';
import {
	type ActiveList,
	type LastCommand,
	type PendingCommand,
	type PromptMode,
} from './types.js';
import {sanitizeSingleLine, sanitizeText} from './lib/sanitize.js';

function repoLabel(repoPath: string): string {
	return sanitizeSingleLine(path.basename(repoPath));
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
	const result = await runGit(cwd, ['status', '--porcelain=v1', '-z', '-b'], {
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
	file: ChangedFile | undefined,
	signal: AbortSignal,
): Promise<string> {
	if (!file) {
		return '';
	}

	if (file.untracked) {
		const result = await runGit(
			cwd,
			['diff', '--no-index', '--', '/dev/null', file.path],
			{signal},
		);
		if (result.code !== 0 && result.code !== 1) {
			throw new Error(
				result.stderr || `git diff exited with code ${result.code}`,
			);
		}

		if (result.stdout.trim().length > 0) {
			return result.stdout;
		}

		return `(untracked) ${file.path}`;
	}

	if (file.staged && file.unstaged) {
		const [cachedResult, unstagedResult] = await Promise.all([
			runGit(cwd, ['diff', '--cached', '--', file.path], {signal}),
			runGit(cwd, ['diff', '--', file.path], {signal}),
		]);
		for (const result of [cachedResult, unstagedResult]) {
			if (result.code !== 0) {
				throw new Error(
					result.stderr || `git diff exited with code ${result.code}`,
				);
			}
		}

		const parts: string[] = [];
		if (cachedResult.stdout.trim().length > 0) {
			parts.push(
				`--- Staged changes (cached) ---\n${cachedResult.stdout.trim()}`,
			);
		}

		if (unstagedResult.stdout.trim().length > 0) {
			parts.push(
				`--- Unstaged changes (worktree) ---\n${unstagedResult.stdout.trim()}`,
			);
		}

		return parts.join('\n\n') || '(empty diff)';
	}

	const args = file.staged
		? ['diff', '--cached', '--', file.path]
		: ['diff', '--', file.path];
	const result = await runGit(cwd, args, {signal});
	if (result.code !== 0 && result.code !== 1) {
		throw new Error(
			result.stderr || `git diff exited with code ${result.code}`,
		);
	}

	return result.stdout || result.stderr || '(empty diff)';
}

type DiffState = {
	filePath: string;
	text: string;
	loading: boolean;
	error?: string;
};

export default function App() {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const [promptMode, setPromptMode] = useState<PromptMode>('commit');
	const [activeList, setActiveList] = useState<ActiveList>('files');
	const [insertMode, setInsertMode] = useState(true);
	const [prompt, setPrompt] = useState('');
	const [cursorPos, setCursorPos] = useState(0);
	const [promptError, setPromptError] = useState<string | undefined>();
	const [filterQuery, setFilterQuery] = useState('');
	const [history, setHistory] = useState<string[]>([]);
	const insertModeRef = useRef(true);
	const promptRef = useRef('');
	const cursorPosRef = useRef(0);
	const historyRef = useRef<string[]>([]);
	const historyIndexRef = useRef(-1);
	historyRef.current = history;
	const [repoPath, setRepoPath] = useState<string | undefined>();
	const [status, setStatus] = useState<RepoStatus | undefined>();
	const [branches, setBranches] = useState<GitBranch[]>([]);
	const [branchIndex, setBranchIndex] = useState(0);
	const [fileIndex, setFileIndex] = useState(0);
	const [marked, setMarked] = useState<string[]>([]);
	const [diffState, setDiffState] = useState<DiffState>({
		filePath: '',
		text: '',
		loading: false,
	});
	const [diffOffset, setDiffOffset] = useState(0);
	const [diffHorizontalOffset, setDiffHorizontalOffset] = useState(0);
	const [diffWrapMode, setDiffWrapMode] = useState<'truncate' | 'wrap'>(
		'truncate',
	);
	const [diffOpen, setDiffOpen] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [notice, setNotice] = useState<string | undefined>();
	const [pending, setPending] = useState<PendingCommand | undefined>();
	const [busy, setBusy] = useState(false);
	const [isEditorActive, setIsEditorActive] = useState(false);
	const [lastCommand, setLastCommand] = useState<LastCommand | undefined>();
	const [reloadTick, setReloadTick] = useState(0);
	const diffPathRef = useRef('');

	const activeFilter =
		insertMode && promptMode === 'filter' ? prompt.trim() : filterQuery;

	const files = useMemo(() => {
		const all = status?.files ?? [];
		if (activeFilter.length === 0) {
			return all;
		}

		const needle = activeFilter.toLowerCase();
		return all.filter(file => file.path.toLowerCase().includes(needle));
	}, [activeFilter, status?.files]);

	const focusedPath = files[fileIndex]?.path;
	const selectedBranch = branches[branchIndex];
	const visibleMarked = marked.filter(item =>
		files.some(file => file.path === item),
	);
	const markedOrFocused =
		visibleMarked.length > 0 ? visibleMarked : focusedPath ? [focusedPath] : [];

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
		if (!repoPath || isEditorActive) {
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
	}, [repoPath, reloadTick, isEditorActive]);

	useEffect(() => {
		setFileIndex(0);
		setDiffOffset(0);
		setDiffHorizontalOffset(0);
		setMarked([]);
		setDiffOpen(false);
		setActiveList('branches');
		setFilterQuery('');
	}, [repoPath]);

	useEffect(() => {
		const current = branches.findIndex(branch => branch.current);
		if (current >= 0) {
			setBranchIndex(current);
		} else if (branchIndex >= branches.length && branches.length > 0) {
			setBranchIndex(branches.length - 1);
		}
	}, [repoPath, status?.branch, branches.length]);

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
		if (!repoPath || isEditorActive) {
			return;
		}

		const timer = setInterval(() => {
			setReloadTick(tick => tick + 1);
		}, 3000);

		return () => {
			clearInterval(timer);
		};
	}, [repoPath, isEditorActive]);

	useEffect(() => {
		if (!diffOpen || !repoPath || !status || !focusedPath) {
			return;
		}

		const pathChanged = diffPathRef.current !== focusedPath;
		diffPathRef.current = focusedPath;
		setDiffState(current => ({
			filePath: focusedPath,
			text: pathChanged ? '' : current.text,
			loading: pathChanged,
		}));
		if (pathChanged) {
			setDiffOffset(0);
			setDiffHorizontalOffset(0);
		}

		const file = status.files.find(item => item.path === focusedPath);
		const controller = new AbortController();

		loadDiff(repoPath, file, controller.signal)
			.then(text => {
				if (!controller.signal.aborted) {
					setDiffState({
						filePath: focusedPath,
						text,
						loading: false,
					});
				}
			})
			.catch((caught: unknown) => {
				if (!controller.signal.aborted) {
					setDiffState({
						filePath: focusedPath,
						text: '',
						loading: false,
						error: caught instanceof Error ? caught.message : String(caught),
					});
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
		setNotice(undefined);
		try {
			const result = await runGitPipeline(command.cwd, command.steps);
			setLastCommand({
				ok: result.code === 0,
				command: sanitizeSingleLine(command.display),
				detail: sanitizeSingleLine(
					(result.stderr || result.stdout || `exit ${result.code}`).trim(),
				),
			});
			setReloadTick(tick => tick + 1);
			if (command.title === 'Commit all') {
				if (result.code === 0) {
					insertModeRef.current = true;
					promptRef.current = '';
					cursorPosRef.current = 0;
					setInsertMode(true);
					setPrompt('');
					setCursorPos(0);
					setPromptMode('commit');
				} else {
					insertModeRef.current = true;
					setInsertMode(true);
				}
			}
		} catch (caught: unknown) {
			setLastCommand({
				ok: false,
				command: sanitizeSingleLine(command.display),
				detail: sanitizeSingleLine(
					caught instanceof Error ? caught.message : String(caught),
				),
			});
		} finally {
			setBusy(false);
		}
	}, []);

	const onRequest = useCallback(
		(command: PendingCommand) => {
			if (command.confirm) {
				insertModeRef.current = false;
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
		historyIndexRef.current = -1;
	}, []);

	const exitInsert = useCallback(() => {
		insertModeRef.current = false;
		promptRef.current = '';
		cursorPosRef.current = 0;
		historyIndexRef.current = -1;
		setInsertMode(false);
		setPrompt('');
		setCursorPos(0);
		setPromptError(undefined);
	}, []);

	const resumeInsert = useCallback(() => {
		insertModeRef.current = true;
		setInsertMode(true);
		setPromptError(undefined);
	}, []);

	const blurInsert = useCallback((list: ActiveList) => {
		insertModeRef.current = false;
		setInsertMode(false);
		setActiveList(list);
		setPromptError(undefined);
	}, []);

	const enterInsert = useCallback((seed = '') => {
		insertModeRef.current = true;
		promptRef.current = seed;
		cursorPosRef.current = textLength(seed);
		historyIndexRef.current = -1;
		setInsertMode(true);
		setPrompt(seed);
		setCursorPos(textLength(seed));
		setPromptError(undefined);
	}, []);

	const setPromptValue = useCallback((value: string, cursor?: number) => {
		promptRef.current = value;
		const length = textLength(value);
		const nextCursor =
			cursor === undefined ? length : Math.max(0, Math.min(length, cursor));
		cursorPosRef.current = nextCursor;
		setPrompt(value);
		setCursorPos(nextCursor);
		setPromptError(undefined);
	}, []);

	const runActionId = useCallback(
		(id: string) => {
			if (!repoPath) {
				return;
			}

			const action = changeActions.find(item => item.id === id);
			if (!action) {
				return;
			}

			if (action.disabled) {
				if (id === 'stage') {
					setNotice('No changed files to stage');
				} else if (id === 'unstage') {
					setNotice('No staged files to unstage');
				}

				return;
			}

			onRequest(requestFromAction(repoPath, action));
		},
		[changeActions, onRequest, repoPath],
	);

	const checkoutSelected = useCallback(() => {
		if (!repoPath || !selectedBranch) {
			return;
		}

		if (selectedBranch.current) {
			setNotice(`Already on branch '${selectedBranch.name}'`);
			return;
		}

		onRequest(checkoutPending(repoPath, selectedBranch));
	}, [onRequest, repoPath, selectedBranch]);

	const openEditor = useCallback(() => {
		if (!repoPath || !focusedPath) {
			setNotice('No file selected to open');
			return;
		}

		const file = status?.files.find(item => item.path === focusedPath);
		setIsEditorActive(true);
		void (async () => {
			const text =
				diffState.filePath === focusedPath && !diffState.loading
					? diffState.text
					: await loadDiff(repoPath, file, new AbortController().signal);

			await openChangeInEditor(
				{
					repoPath,
					relativePath: focusedPath,
					diff: text,
				},
				{
					onBeforeSpawn() {
						if (process.stdin.isTTY && process.stdin.setRawMode) {
							process.stdin.setRawMode(false);
						}

						stdout.write('\u001B[2J\u001B[3J\u001B[H');
					},
					onAfterExit() {
						if (process.stdin.isTTY && process.stdin.setRawMode) {
							process.stdin.setRawMode(true);
						}

						stdout.write('\u001B[2J\u001B[3J\u001B[H');
					},
				},
			);
			setReloadTick(tick => tick + 1);
		})()
			.catch((caught: unknown) => {
				setError(caught instanceof Error ? caught.message : String(caught));
			})
			.finally(() => {
				setIsEditorActive(false);
			});
	}, [diffState, focusedPath, repoPath, status?.files, stdout]);

	const rawTerminalRows = (stdout.rows ?? 24) - 1;
	const rawTerminalCols = stdout.columns ?? 80;
	const terminalRows = Math.max(8, rawTerminalRows);
	const terminalCols = Math.max(20, rawTerminalCols);
	const fullDiffRows = Math.max(3, terminalRows - 6);

	const scrollDiff = useCallback(
		(delta: number) => {
			const total = displayDiffLines(
				diffState.text,
				diffWrapMode,
				Math.max(1, terminalCols - 4),
			).length;
			const maxOffset = Math.max(0, total - fullDiffRows);
			setDiffOffset(current =>
				Math.max(0, Math.min(maxOffset, current + delta)),
			);
		},
		[diffState.text, diffWrapMode, fullDiffRows, terminalCols],
	);

	const openFullDiff = useCallback(() => {
		if (!focusedPath) {
			setNotice('No file selected to view diff');
			return;
		}

		insertModeRef.current = false;
		setInsertMode(false);
		setActiveList('files');
		setDiffOpen(true);
	}, [focusedPath]);

	const submitPrompt = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			rememberPrompt(value);

			if (promptMode === 'filter') {
				setFilterQuery(trimmed);
				setMarked([]);
				setActiveList('files');
				setFileIndex(0);
				insertModeRef.current = false;
				setInsertMode(false);
				setPrompt(trimmed);
				return;
			}

			if (!repoPath) {
				return;
			}

			if (promptMode === 'commit') {
				if (trimmed.length === 0) {
					setPromptError('Commit message cannot be empty');
					return;
				}

				const action = buildChangeActions({
					markedFiles: markedOrFocused,
					commitMessage: trimmed,
					fileCount: status?.files.length ?? 0,
				})[0];
				if (!action || action.disabled) {
					setPromptError('Nothing to commit');
					return;
				}

				onRequest(requestFromAction(repoPath, action));
				return;
			}

			if (promptMode === 'checkout') {
				if (trimmed.length > 0) {
					const exists = branches.some(
						branch => !branch.remote && branch.name === trimmed,
					);
					onRequest({
						title: exists ? 'Checkout' : 'Create and checkout',
						cwd: repoPath,
						display: exists
							? formatCommand(['checkout', trimmed])
							: formatCommand(['checkout', '-b', trimmed]),
						steps: exists
							? [['checkout', trimmed]]
							: [['checkout', '-b', trimmed]],
						confirm: false,
					});
				} else if (selectedBranch) {
					if (selectedBranch.current) {
						setNotice(`Already on branch '${selectedBranch.name}'`);
						setPromptMode('commit');
						enterInsert();
						return;
					}

					onRequest(checkoutPending(repoPath, selectedBranch));
				}

				exitInsert();
				setPromptMode('commit');
				enterInsert();
			}
		},
		[
			branches,
			enterInsert,
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
				const title = pending.title;
				setPending(undefined);
				if (title === 'Commit all') {
					resumeInsert();
				}
			}

			return;
		}

		if (busy || isEditorActive) {
			return;
		}

		if (diffOpen) {
			if (key.escape) {
				stdout.write('\u001B[2J\u001B[3J\u001B[H');
				setDiffOpen(false);
				return;
			}

			if (input === 'c') {
				stdout.write('\u001B[2J\u001B[3J\u001B[H');
				setDiffOpen(false);
				setPromptMode('commit');
				resumeInsert();
				return;
			}

			if (input === 'e') {
				openEditor();
				return;
			}

			if (input === 'w') {
				setDiffWrapMode(mode => (mode === 'truncate' ? 'wrap' : 'truncate'));
				return;
			}

			if (input === 'h' || (key.leftArrow && key.shift)) {
				setDiffHorizontalOffset(offset => Math.max(0, offset - 10));
				return;
			}

			if (input === 'l' || (key.rightArrow && key.shift)) {
				setDiffHorizontalOffset(offset => offset + 10);
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

		if (key.tab) {
			if (insertModeRef.current) {
				blurInsert(key.shift ? 'files' : 'branches');
				return;
			}

			if (key.shift) {
				if (activeList === 'files') {
					setActiveList('branches');
					return;
				}

				resumeInsert();
				return;
			}

			if (activeList === 'branches') {
				setActiveList('files');
				return;
			}

			resumeInsert();
			return;
		}

		if (insertModeRef.current) {
			if (key.escape) {
				blurInsert('files');
				return;
			}

			if (key.return) {
				submitPrompt(promptRef.current);
				return;
			}

			if (key.leftArrow) {
				setCursorPos(pos => Math.max(0, pos - 1));
				cursorPosRef.current = Math.max(0, cursorPosRef.current - 1);
				return;
			}

			if (key.rightArrow) {
				const nextPos = Math.min(
					textLength(promptRef.current),
					cursorPosRef.current + 1,
				);
				setCursorPos(nextPos);
				cursorPosRef.current = nextPos;
				return;
			}

			if (key.ctrl && input === 'a') {
				setCursorPos(0);
				cursorPosRef.current = 0;
				return;
			}

			if (key.ctrl && input === 'e') {
				const end = textLength(promptRef.current);
				setCursorPos(end);
				cursorPosRef.current = end;
				return;
			}

			if (key.ctrl && input === 'u') {
				const {value, cursor} = deleteToStart(
					promptRef.current,
					cursorPosRef.current,
				);
				setPromptValue(value, cursor);
				return;
			}

			if (key.ctrl && input === 'w') {
				const {value, cursor} = deleteWordBeforeCursor(
					promptRef.current,
					cursorPosRef.current,
				);
				setPromptValue(value, cursor);
				return;
			}

			if (key.upArrow && historyRef.current.length > 0) {
				const next = Math.min(
					historyRef.current.length - 1,
					historyIndexRef.current + 1,
				);
				historyIndexRef.current = next;
				const item = historyRef.current[next] ?? '';
				setPromptValue(item, textLength(item));
				return;
			}

			if (key.downArrow) {
				const next = historyIndexRef.current - 1;
				if (next < 0) {
					historyIndexRef.current = -1;
					setPromptValue('', 0);
					return;
				}

				historyIndexRef.current = next;
				const item = historyRef.current[next] ?? '';
				setPromptValue(item, textLength(item));
				return;
			}

			// Ink 5 reports the common DEL byte (0x7f) as `delete`, even when
			// terminals send it for Backspace. Treat both names as backward delete.
			if (isBackwardDeleteKey(key)) {
				const {value, cursor} = deleteBeforeCursor(
					promptRef.current,
					cursorPosRef.current,
				);
				setPromptValue(value, cursor);
				return;
			}

			if (isPrintable(input, key)) {
				const {value, cursor} = insertAtCursor(
					promptRef.current,
					cursorPosRef.current,
					input,
				);
				setPromptValue(value, cursor);
			}

			return;
		}

		if (key.escape) {
			resumeInsert();
			setError(undefined);
			setNotice(undefined);
			setDiffOpen(false);
			return;
		}

		if (input === 'c') {
			setPromptMode('commit');
			resumeInsert();
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
			enterInsert(filterQuery);
			return;
		}

		if (input === 'f') {
			runActionId('fetch');
			return;
		}

		if (input === 'u') {
			if (activeList === 'files') {
				runActionId('unstage');
			} else {
				runActionId('pull');
			}

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

		if (input === 'm') {
			if (!selectedBranch) {
				setNotice('No branch selected to merge');
				return;
			}

			if (selectedBranch.current) {
				setNotice('Cannot merge current branch into itself');
				return;
			}

			if (repoPath) {
				const ref = branchRef(selectedBranch);
				onRequest({
					title: `Merge ${selectedBranch.name} into current`,
					cwd: repoPath,
					display: formatCommand(['merge', ref]),
					steps: [['merge', ref]],
					confirm: true,
				});
			}

			return;
		}

		if (input === 'i') {
			resumeInsert();
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
		}
	}, !pending && !busy && !isEditorActive);

	if (rawTerminalRows < 8 || rawTerminalCols < 20) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">
					Terminal size ({rawTerminalCols}x{rawTerminalRows}) is too small for
					ckout.
				</Text>
			</Box>
		);
	}

	const rawCwd = repoPath ?? process.cwd();
	const sanitizedCwd = sanitizeSingleLine(rawCwd);
	const cwdDisplay =
		sanitizedCwd.length > terminalCols - 8
			? '...' + sanitizedCwd.slice(-(terminalCols - 12))
			: sanitizedCwd;

	if (diffOpen) {
		return (
			<Box flexDirection="column" width="100%" height={terminalRows}>
				<DiffView
					filePath={focusedPath}
					diff={diffState.text}
					loading={diffState.loading}
					error={diffState.error}
					offset={diffOffset}
					horizontalOffset={diffHorizontalOffset}
					wrapMode={diffWrapMode}
					contentWidth={Math.max(1, terminalCols - 4)}
					visibleCount={fullDiffRows}
					fullscreen
				/>
				<Footer insertMode={false} diffOpen />
			</Box>
		);
	}

	const listHeight = Math.max(3, Math.min(20, terminalRows - 13));

	return (
		<Box flexDirection="column" width="100%" height={terminalRows}>
			<Box gap={1} paddingX={1}>
				<Text bold color="green">
					ckout
				</Text>
				<Text>{repoPath ? repoLabel(repoPath) : 'no repo'}</Text>
				<Text dimColor>
					{insertMode ? 'prompt' : activeList} · {promptMode}
				</Text>
			</Box>
			{error ? <Alert variant="error">{sanitizeText(error)}</Alert> : undefined}
			{notice ? (
				<Alert variant="info">{sanitizeText(notice)}</Alert>
			) : undefined}
			{lastCommand ? (
				<StatusMessage variant={lastCommand.ok ? 'success' : 'error'}>
					{lastCommand.command}
					{lastCommand.detail ? ` — ${lastCommand.detail.slice(0, 180)}` : ''}
				</StatusMessage>
			) : undefined}
			<Box flexGrow={1}>
				<Overview
					status={status}
					branches={branches}
					branchIndex={branchIndex}
					files={files}
					focusedPath={focusedPath}
					marked={visibleMarked}
					activeList={activeList}
					listsActive={!insertMode}
					isBusy={busy}
					listHeight={listHeight}
					filterQuery={activeFilter}
					terminalCols={terminalCols}
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
						if (pending.title === 'Commit all') {
							resumeInsert();
						}
					}}
				/>
			) : (
				<PromptBar
					mode={promptMode}
					commandHint={commandHint}
					insertMode={insertMode}
					value={prompt}
					cursorPos={cursorPos}
					error={promptError}
				/>
			)}
			<Footer
				insertMode={insertMode}
				diffOpen={diffOpen}
				activeList={activeList}
			/>
			<Text dimColor> cwd {cwdDisplay}</Text>
		</Box>
	);
}
