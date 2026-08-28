import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {type ChangedFile, fileStatusLabel} from '../git/parse-status.js';
import {windowedSlice} from '../lib/windowed.js';

type Props = {
	files: ChangedFile[];
	focusedPath: string | undefined;
	marked: string[];
	isActive: boolean;
	windowSize?: number;
};

export default function FileList({
	files,
	focusedPath,
	marked,
	isActive,
	windowSize = 12,
}: Props) {
	const markedSet = useMemo(() => new Set(marked), [marked]);
	const focusedIndex = Math.max(
		0,
		files.findIndex(file => file.path === focusedPath),
	);
	const visible = windowedSlice(files, focusedIndex, windowSize);

	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			borderStyle="single"
			borderColor={isActive ? 'cyan' : 'gray'}
			paddingX={1}
		>
			<Text bold>
				Changes{isActive ? ' *' : ''}{' '}
				<Text dimColor>
					{files.length === 0 ? 'none' : `${focusedIndex + 1}/${files.length}`}
				</Text>
			</Text>
			{files.length === 0 ? (
				<Text dimColor>Working tree clean</Text>
			) : (
				visible.items.map(file => {
					const focused = file.path === focusedPath;
					return (
						<Text
							key={file.path}
							wrap="truncate"
							inverse={focused && isActive}
							color={focused ? 'cyan' : undefined}
						>
							{markedSet.has(file.path) ? '[x]' : '[ ]'} {fileStatusLabel(file)}{' '}
							{file.path}
						</Text>
					);
				})
			)}
			<Text dimColor>d diff e editor space mark</Text>
		</Box>
	);
}
