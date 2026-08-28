import React, {useMemo} from 'react';
import {Box, Text} from 'ink';

type Props = {
	filePath: string | undefined;
	diff: string;
	offset: number;
	visibleCount: number;
	fullscreen?: boolean;
};

export function diffLines(diff: string): string[] {
	return diff.length === 0
		? ['(no diff)']
		: diff.replace(/\n$/, '').split('\n');
}

function lineColor(line: string): string | undefined {
	if (line.startsWith('+') && !line.startsWith('+++')) {
		return 'green';
	}

	if (line.startsWith('-') && !line.startsWith('---')) {
		return 'red';
	}

	if (line.startsWith('@@')) {
		return 'cyan';
	}

	if (
		line.startsWith('diff ') ||
		line.startsWith('index ') ||
		line.startsWith('+++') ||
		line.startsWith('---')
	) {
		return 'yellow';
	}

	return undefined;
}

export default function DiffView({
	filePath,
	diff,
	offset,
	visibleCount,
	fullscreen = false,
}: Props) {
	const lines = useMemo(() => diffLines(diff), [diff]);
	const count = Math.max(1, visibleCount);
	const start = Math.min(offset, Math.max(0, lines.length - 1));
	const visible = lines.slice(start, start + count);
	const end = Math.min(lines.length, start + visible.length);

	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			borderStyle="single"
			borderColor={fullscreen ? 'cyan' : 'gray'}
			paddingX={1}
		>
			<Text bold>
				{fullscreen ? 'Diff (full) ' : 'Diff '}
				{filePath ?? ''}
			</Text>
			<Text dimColor>
				{start + 1}–{end} / {lines.length}
				{fullscreen
					? ' · ↑↓ scroll · e editor · c commit · esc close'
					: ' · d full · e editor'}
			</Text>
			{visible.map((line, index) => (
				<Text
					key={`${start + index}:${line}`}
					wrap="truncate"
					color={lineColor(line)}
				>
					{line.length === 0 ? ' ' : line}
				</Text>
			))}
		</Box>
	);
}
