const safeArg = /^[\w./:@+=,-]+$/;

export function shellQuote(value: string): string {
	if (value.length === 0) {
		return `''`;
	}

	if (safeArg.test(value)) {
		return value;
	}

	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(args: readonly string[]): string {
	return `git ${args.map(value => shellQuote(value)).join(' ')}`;
}

export function formatPipeline(steps: readonly string[][]): string {
	return steps.map(step => formatCommand(step)).join(' && ');
}
