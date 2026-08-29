import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {Badge, Spinner} from '@inkjs/ui';
import FileList from './file-list.js';
import {windowedSlice} from '../lib/windowed.js';
import {branchRef} from '../git/commands.js';
import {type GitBranch} from '../git/parse-branches.js';
import {type RepoStatus} from '../git/parse-status.js';
import {type ActiveList} from '../types.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';

type Props = {
	status: RepoStatus | undefined;
	branches: GitBranch[];
	branchIndex: number;
	files: RepoStatus['files'];
	focusedPath: string | undefined;
	marked: string[];
	activeList: ActiveList;
	listsActive?: boolean;
	isBusy: boolean;
	listHeight: number;
	filterQuery?: string;
	terminalCols?: number;
};

export default function Overview({
	status,
	branches,
	branchIndex,
	files,
	focusedPath,
	marked,
	activeList,
	listsActive = true,
	isBusy,
	listHeight,
	filterQuery,
	terminalCols = 80,
}: Props) {
	const visibleBranches = useMemo(
		() => windowedSlice(branches, branchIndex, listHeight),
		[branchIndex, branches, listHeight],
	);
	const isFiltered = Boolean(filterQuery && filterQuery.trim().length > 0);
	const isNarrow = terminalCols < 70;

	const branchPanel = (
		<Box
			flexDirection="column"
			flexGrow={1}
			borderStyle="single"
			borderColor={listsActive && activeList === 'branches' ? 'cyan' : 'gray'}
			paddingX={1}
		>
			<Text bold>
				Branches{listsActive && activeList === 'branches' ? ' *' : ''}{' '}
				<Text dimColor>
					{branches.length === 0 ? '' : `${branchIndex + 1}/${branches.length}`}
				</Text>
			</Text>
			{branches.length === 0 ? (
				<Text dimColor>No branches</Text>
			) : (
				visibleBranches.items.map((branch, offset) => {
					const index = visibleBranches.start + offset;
					const focused = index === branchIndex;
					const sanitizedName = sanitizeSingleLine(branchRef(branch));
					return (
						<Text
							key={branch.name}
							wrap="truncate"
							inverse={focused && listsActive && activeList === 'branches'}
							color={
								branch.current
									? 'green'
									: focused && listsActive
									? 'cyan'
									: branch.remote
									? 'gray'
									: undefined
							}
						>
							{branch.current ? '* ' : '  '}
							{sanitizedName}
						</Text>
					);
				})
			)}
			<Text dimColor>enter checkout · n new · m merge</Text>
		</Box>
	);

	const filePanel = (
		<FileList
			files={files}
			focusedPath={focusedPath}
			marked={marked}
			isActive={listsActive && activeList === 'files'}
			windowSize={listHeight}
			filterQuery={filterQuery}
			totalFilesCount={status?.files.length ?? 0}
		/>
	);

	return (
		<Box flexDirection="column" flexGrow={1}>
			<Box gap={1} paddingX={1}>
				{status ? (
					<>
						<Badge color="blue">{sanitizeSingleLine(status.branch)}</Badge>
						{isFiltered ? (
							<Badge color="yellow">
								{files.length}/{status.files.length} changed
							</Badge>
						) : status.dirty ? (
							<Badge color="yellow">
								{String(status.files.length)} changed
							</Badge>
						) : (
							<Badge color="green">clean</Badge>
						)}
						<Text dimColor>
							↑{status.ahead} ↓{status.behind}
						</Text>
					</>
				) : (
					<Badge color="gray">loading status...</Badge>
				)}
				{isBusy ? <Spinner label="git" /> : undefined}
			</Box>
			<Box flexGrow={1}>
				{isNarrow ? (
					activeList === 'branches' ? (
						branchPanel
					) : (
						filePanel
					)
				) : (
					<>
						{branchPanel}
						{filePanel}
					</>
				)}
			</Box>
			<Box paddingX={1}>
				<Text dimColor>
					{isNarrow
						? 'tab switch view · enter action · tab/i message · / filter'
						: 'tab prompt → branches → files · enter checkout/diff · c message · d/e diff'}
				</Text>
			</Box>
		</Box>
	);
}
