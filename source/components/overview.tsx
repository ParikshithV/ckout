import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {Badge, Spinner} from '@inkjs/ui';
import FileList from './file-list.js';
import {windowedSlice} from '../lib/windowed.js';
import {branchRef} from '../git/commands.js';
import {type GitBranch} from '../git/parse-branches.js';
import {type RepoStatus} from '../git/parse-status.js';
import {type ActiveList} from '../types.js';

type Props = {
	status: RepoStatus | undefined;
	branches: GitBranch[];
	branchIndex: number;
	files: RepoStatus['files'];
	focusedPath: string | undefined;
	marked: string[];
	activeList: ActiveList;
	isBusy: boolean;
	listHeight: number;
};

export default function Overview({
	status,
	branches,
	branchIndex,
	files,
	focusedPath,
	marked,
	activeList,
	isBusy,
	listHeight,
}: Props) {
	const visibleBranches = useMemo(
		() => windowedSlice(branches, branchIndex, listHeight),
		[branchIndex, branches, listHeight],
	);

	return (
		<Box flexDirection="column" flexGrow={1}>
			<Box gap={1} paddingX={1}>
				<Badge color="blue">{status?.branch ?? '—'}</Badge>
				{status?.dirty ? (
					<Badge color="yellow">{String(files.length)} changed</Badge>
				) : (
					<Badge color="green">clean</Badge>
				)}
				<Text dimColor>
					↑{status?.ahead ?? 0} ↓{status?.behind ?? 0}
				</Text>
				{isBusy ? <Spinner label="git" /> : undefined}
			</Box>
			<Box flexGrow={1}>
				<Box
					flexDirection="column"
					flexGrow={1}
					borderStyle="single"
					borderColor={activeList === 'branches' ? 'cyan' : 'gray'}
					paddingX={1}
				>
					<Text bold>
						Branches{activeList === 'branches' ? ' *' : ''}{' '}
						<Text dimColor>
							{branches.length === 0
								? ''
								: `${branchIndex + 1}/${branches.length}`}
						</Text>
					</Text>
					{branches.length === 0 ? (
						<Text dimColor>No branches</Text>
					) : (
						visibleBranches.items.map((branch, offset) => {
							const index = visibleBranches.start + offset;
							const focused = index === branchIndex;
							return (
								<Text
									key={branch.name}
									wrap="truncate"
									inverse={focused && activeList === 'branches'}
									color={
										branch.current
											? 'green'
											: focused
											? 'cyan'
											: branch.remote
											? 'gray'
											: undefined
									}
								>
									{branch.current ? '* ' : '  '}
									{branchRef(branch)}
								</Text>
							);
						})
					)}
				</Box>
				<FileList
					files={files}
					focusedPath={focusedPath}
					marked={marked}
					isActive={activeList === 'files'}
					windowSize={listHeight}
				/>
			</Box>
			<Box paddingX={1}>
				<Text dimColor>
					enter checkout/diff · tab switch list · f fetch · u pull · p push · c
					commit · d/e diff
				</Text>
			</Box>
		</Box>
	);
}
