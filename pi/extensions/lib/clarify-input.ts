export function getSuggestionIndex(
	data: string,
	suggestions: readonly string[],
	editorText: string,
): number | null {
	if (suggestions.length === 0 || editorText.length > 0) return null;

	const num = Number(data);
	if (Number.isInteger(num) && num >= 1 && num <= suggestions.length) {
		return num;
	}

	return null;
}
