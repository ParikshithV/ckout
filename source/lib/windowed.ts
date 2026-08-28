export function windowedSlice<T>(
	items: readonly T[],
	index: number,
	size: number,
): {items: T[]; start: number} {
	if (items.length === 0 || size <= 0) {
		return {items: [], start: 0};
	}

	if (items.length <= size) {
		return {items: [...items], start: 0};
	}

	const half = Math.floor(size / 2);
	const start = Math.min(Math.max(0, index - half), items.length - size);

	return {items: items.slice(start, start + size), start};
}
