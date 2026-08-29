import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {sanitizeSingleLine, sanitizeText} from '../lib/sanitize.js';

type Props = {
	filePath: string | undefined;
	diff: string;
	offset: number;
	visibleCount: number;
	loading?: boolean;
	error?: string;
	horizontalOffset?: number;
	wrapMode?: 'truncate' | 'wrap';
	contentWidth?: number;
	fullscreen?: boolean;
};

export function diffLines(diff: string): string[] {
	if (diff.length === 0) {
		return ['(no diff)'];
	}

	const sanitized = sanitizeText(diff);
	return sanitized.replace(/\r/g, '').replace(/\n$/, '').split('\n');
}

export function displayDiffLines(
	diff: string,
	wrapMode: 'truncate' | 'wrap',
	contentWidth: number,
): string[] {
	const lines = diffLines(diff);
	if (wrapMode === 'truncate') {
		return lines;
	}

	const width = Math.max(1, contentWidth);
	return lines.flatMap(line => {
		const characters = [...line];
		if (characters.length === 0) {
			return [''];
		}

		const chunks: string[] = [];
		while (characters.length > 0) {
			chunks.push(characters.splice(0, width).join(''));
		}

		return chunks;
	});
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
	loading = false,
	error,
	horizontalOffset = 0,
	wrapMode = 'truncate',
	contentWidth = 80,
	fullscreen = false,
}: Props) {
	const lines = useMemo(
		() => displayDiffLines(diff, wrapMode, contentWidth),
		[contentWidth, diff, wrapMode],
	);
	const count = Math.max(1, visibleCount);
	const maxOffset = Math.max(0, lines.length - count);
	const start = Math.min(Math.max(0, offset), maxOffset);
	const visible = lines.slice(start, start + count);
	const end = Math.min(lines.length, start + visible.length);

	const scrollInfo = useMemo(() => {
		const parts: string[] = [];
		if (lines.length > 0) {
			parts.push(`${start + 1}–${end} / ${lines.length}`);
		}

		if (horizontalOffset > 0 && wrapMode === 'truncate') {
			parts.push(`col ${horizontalOffset + 1}`);
		}

		if (wrapMode === 'wrap') {
			parts.push('wrapped');
		}

		if (fullscreen) {
			parts.push('↑↓ scroll · h/l pan · w wrap · e edit · c commit · esc back');
		} else {
			parts.push('d full · e editor');
		}

		return parts.join(' · ');
	}, [end, fullscreen, horizontalOffset, lines.length, start, wrapMode]);

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
				{filePath ? sanitizeSingleLine(filePath) : ''}
			</Text>
			<Text dimColor>{scrollInfo}</Text>
			{loading ? (
				<Text dimColor>Loading diff...</Text>
			) : error ? (
				<Text color="red">Failed to load diff: {sanitizeText(error)}</Text>
			) : (
				visible.map((rawLine, index) => {
					const line =
						wrapMode === 'truncate' && horizontalOffset > 0
							? [...rawLine].slice(horizontalOffset).join('')
							: rawLine;
					return (
						<Text
							key={`${start + index}:${rawLine}`}
							wrap="truncate"
							color={lineColor(rawLine)}
						>
							{line.length === 0 ? ' ' : line}
						</Text>
					);
				})
			)}
		</Box>
	);
}
