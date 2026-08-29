import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import FileList from '../source/components/file-list.js';
import DiffView, {displayDiffLines} from '../source/components/diff-view.js';

test('FileList renders clean working tree when no files and not filtered', t => {
	const {lastFrame} = render(
		<FileList files={[]} focusedPath={undefined} marked={[]} isActive />,
	);

	const frame = lastFrame() ?? '';
	t.true(frame.includes('Working tree clean'));
});

test('FileList renders filter message when filtered to 0 matches', t => {
	const {lastFrame} = render(
		<FileList
			files={[]}
			focusedPath={undefined}
			marked={[]}
			isActive
			filterQuery="nonexistent"
			totalFilesCount={5}
		/>,
	);

	const frame = lastFrame() ?? '';
	t.true(frame.includes('No files match "nonexistent"'));
	t.true(frame.includes('0/5'));
});

test('DiffView renders loading and error states properly', t => {
	const loadingRender = render(
		<DiffView
			filePath="src/app.tsx"
			diff=""
			loading
			offset={0}
			visibleCount={10}
		/>,
	);
	t.true((loadingRender.lastFrame() ?? '').includes('Loading diff...'));

	const errorRender = render(
		<DiffView
			filePath="src/app.tsx"
			diff=""
			error="fatal: bad object"
			offset={0}
			visibleCount={10}
		/>,
	);
	t.true(
		(errorRender.lastFrame() ?? '').includes(
			'Failed to load diff: fatal: bad object',
		),
	);
});

test('DiffView sanitizes untrusted ANSI characters in diff content', t => {
	const maliciousDiff =
		'+\u001B[31;1mInjected ANSI\u001B[0m\n+\u001B]52;c;evil\u0007Malicious';
	const {lastFrame} = render(
		<DiffView
			filePath="secret.txt"
			diff={maliciousDiff}
			offset={0}
			visibleCount={10}
		/>,
	);

	const frame = lastFrame() ?? '';
	t.true(frame.includes('+Injected ANSI'));
	t.true(frame.includes('+Malicious'));
	t.false(frame.includes('\u001B]52'));
});

test('displayDiffLines fits wrapped content into physical rows', t => {
	t.deepEqual(displayDiffLines('123456789\nabc', 'wrap', 4), [
		'1234',
		'5678',
		'9',
		'abc',
	]);
});
