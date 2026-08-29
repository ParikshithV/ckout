import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {type ChangedFile, fileStatusLabel} from '../git/parse-status.js';
import {windowedSlice} from '../lib/windowed.js';
import {sanitizeSingleLine} from '../lib/sanitize.js';

type Props = {
	files: ChangedFile[];
	focusedPath: string | undefined;
	marked: string[];
	isActive: boolean;
	windowSize?: number;
	filterQuery?: string;
	totalFilesCount?: number;
};

export default function FileList({
	files,
	focusedPath,
	marked,
	isActive,
	windowSize = 12,
	filterQuery,
	totalFilesCount,
}: Props) {
	const markedSet = useMemo(() => new Set(marked), [marked]);
	const focusedIndex = Math.max(
		0,
		files.findIndex(file => file.path === focusedPath),
	);
	const visible = windowedSlice(files, focusedIndex, windowSize);
	const isFiltered = Boolean(filterQuery && filterQuery.trim().length > 0);

	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			borderStyle="single"
			borderColor={isActive ? 'cyan' : 'gray'}
			paddingX={1}
		>
			<Box gap={1}>
				<Text bold>
					Changes{isActive ? ' *' : ''}{' '}
					<Text dimColor>
						{files.length === 0
							? isFiltered
								? `0/${totalFilesCount ?? 0}`
								: 'none'
							: isFiltered
							? `${focusedIndex + 1}/${files.length} (${files.length} of ${
									totalFilesCount ?? files.length
							  })`
							: `${focusedIndex + 1}/${files.length}`}
					</Text>
				</Text>
			</Box>
			{files.length === 0 ? (
				<Text dimColor>
					{isFiltered
						? `No files match "${sanitizeSingleLine(filterQuery ?? '')}"`
						: 'Working tree clean'}
				</Text>
			) : (
				visible.items.map(file => {
					const focused = file.path === focusedPath;
					const sanitizedPath = sanitizeSingleLine(file.path);
					return (
						<Text
							key={file.path}
							wrap="truncate"
							inverse={focused && isActive}
							color={focused ? 'cyan' : undefined}
						>
							{markedSet.has(file.path) ? '[x]' : '[ ]'} {fileStatusLabel(file)}{' '}
							{sanitizedPath}
						</Text>
					);
				})
			)}
			<Text dimColor>d diff · e editor · space mark · s stage</Text>
		</Box>
	);
}
