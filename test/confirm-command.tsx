import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import ConfirmCommand from '../source/components/confirm-command.js';

test('confirm overlay shows the exact command and cwd', t => {
	const {lastFrame} = render(
		<ConfirmCommand
			title="Push"
			cwd="/tmp/demo-repo"
			command="git push"
			onConfirm={() => {
				/* unused */
			}}
			onCancel={() => {
				/* unused */
			}}
		/>,
	);

	const frame = lastFrame() ?? '';
	t.true(frame.includes('git push'));
	t.true(frame.includes('/tmp/demo-repo'));
	t.true(frame.includes('Push'));
});
