import test from 'ava';
import {sanitizeSingleLine, sanitizeText} from '../source/lib/sanitize.js';

test('sanitizeText strips ANSI CSI and color escape codes', t => {
	t.is(sanitizeText('\u001B[31;1mRed text\u001B[0m'), 'Red text');
	t.is(
		sanitizeText('\u001B[2J\u001B[3J\u001B[HClear screen\u001B[K'),
		'Clear screen',
	);
});

test('sanitizeText strips OSC sequences including clipboard OSC 52 and hyperlink OSC 8', t => {
	t.is(sanitizeText('hello\u001B]52;c;YWJj\u0007world'), 'helloworld');
	t.is(
		sanitizeText(
			'link\u001B]8;;https://example.com\u001B\\target\u001B]8;;\u001B\\end',
		),
		'linktargetend',
	);
});

test('sanitizeText removes unsafe control characters while preserving newlines and tabs', t => {
	t.is(
		sanitizeText('Line 1\nLine 2\tTabbed\u0000Null\u0007Bell\u0008BS'),
		'Line 1\nLine 2\tTabbedNullBellBS',
	);
});

test('sanitizeSingleLine collapses newlines and tabs', t => {
	t.is(
		sanitizeSingleLine('Heading\n\tSubheading\r\nDetail'),
		'Heading Subheading Detail',
	);
});
