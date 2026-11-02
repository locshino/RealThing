import { structuredPatch } from "diff";
import type { editor } from "monaco-editor/editor/editor.api.js";

export type GitGutterChangeType = "added" | "modified" | "deleted" | "deleted-bottom";

export interface GitGutterChange {
	type: GitGutterChangeType;
	startLine: number;
	endLine: number;
}

export function computeGitGutterChanges(
	original: string | null,
	modified: string,
): GitGutterChange[] {
	if (original === null || original === modified) {
		return [];
	}

	const modifiedLines = modified.split(/\r?\n/);
	const totalLines = Math.max(1, modifiedLines.length);

	if (original === "") {
		return [{ type: "added", startLine: 1, endLine: totalLines }];
	}

	const patch = structuredPatch("original", "modified", original, modified, undefined, undefined, {
		context: 0,
	});

	const changes: GitGutterChange[] = [];

	for (const hunk of patch.hunks) {
		const { oldLines, newLines, newStart } = hunk;

		if (oldLines === 0 && newLines > 0) {
			const startLine = Math.max(1, Math.min(newStart, totalLines));
			const endLine = Math.max(startLine, Math.min(newStart + newLines - 1, totalLines));
			changes.push({ type: "added", startLine, endLine });
		} else if (oldLines > 0 && newLines > 0) {
			const startLine = Math.max(1, Math.min(newStart, totalLines));
			const endLine = Math.max(startLine, Math.min(newStart + newLines - 1, totalLines));
			changes.push({ type: "modified", startLine, endLine });
		} else if (oldLines > 0 && newLines === 0) {
			if (newStart > totalLines) {
				changes.push({ type: "deleted-bottom", startLine: totalLines, endLine: totalLines });
			} else {
				const startLine = Math.max(1, Math.min(newStart, totalLines));
				changes.push({ type: "deleted", startLine, endLine: startLine });
			}
		}
	}

	return changes;
}

function resolveCssColor(variableName: string, fallback: string): string {
	if (typeof document === "undefined") return fallback;
	const val = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
	if (!val) return fallback;
	if (val.startsWith("#") || val.startsWith("rgb") || val.startsWith("hsl")) {
		return val;
	}
	const match = /^var\((--[a-zA-Z0-9_-]+)\)$/.exec(val);
	if (match?.[1]) {
		const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
		if (resolved.startsWith("#") || resolved.startsWith("rgb") || resolved.startsWith("hsl")) {
			return resolved;
		}
	}
	return fallback;
}

export function gitGutterOverviewColor(type: GitGutterChangeType): string {
	switch (type) {
		case "added":
			return resolveCssColor("--feedback-success", ["rgb", "a(46, 160, 67, 0.85)"].join(""));
		case "modified":
			return resolveCssColor("--feedback-info", ["rgb", "a(9, 105, 218, 0.85)"].join(""));
		case "deleted":
		case "deleted-bottom":
			return resolveCssColor("--feedback-error", ["rgb", "a(207, 34, 46, 0.85)"].join(""));
	}
}

export function gitGutterDecorations(
	changes: readonly GitGutterChange[],
): editor.IModelDeltaDecoration[] {
	return changes.map((change) => ({
		range: {
			startLineNumber: change.startLine,
			startColumn: 1,
			endLineNumber: change.endLine,
			endColumn: 1,
		},
		options: {
			isWholeLine: true,
			linesDecorationsClassName:
				change.type === "added"
					? "git-gutter-added"
					: change.type === "modified"
						? "git-gutter-modified"
						: change.type === "deleted-bottom"
							? "git-gutter-deleted-bottom"
							: "git-gutter-deleted",
			overviewRuler: {
				color: gitGutterOverviewColor(change.type),
				position: 7,
			},
		},
	}));
}

export function applyGitGutterDecorations(
	codeEditor: editor.ICodeEditor,
	previous: string[],
	changes: readonly GitGutterChange[],
): string[] {
	return codeEditor.deltaDecorations(previous, gitGutterDecorations(changes));
}
