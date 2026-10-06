import { getSuggestionIndex } from "../extensions/lib/clarify-input.ts";

function assertEqual(actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
	}
}

assertEqual(getSuggestionIndex("2", ["One", "Two"], "draft 1"), null);
assertEqual(getSuggestionIndex("2", ["One", "Two"], ""), 2);
assertEqual(getSuggestionIndex("x", ["One", "Two"], ""), null);

console.log("clarify input tests passed");
