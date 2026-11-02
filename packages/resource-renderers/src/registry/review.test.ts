import { expect, test } from "bun:test";
import { currentTranslator } from "@realthing/locales/react";
import { outdatedReason } from "./review";
import type { ReviewAnchor } from "./types";

test("an outdated anchor explains itself by what it could have re-found", () => {
	const anchor = (selectors: ReviewAnchor["selectors"]) => ({
		path: "a.png",
		side: "worktree" as const,
		contentHash: "h",
		selectors,
	});
	expect(
		outdatedReason(
			currentTranslator(),
			anchor([
				{ kind: "textQuote", exact: "x", prefix: "", suffix: "" },
				{ kind: "lineRange", startLine: 1, endLine: 1 },
			]),
		),
	).toMatch(/changed or is gone.*text was not found again/);
	expect(
		outdatedReason(
			currentTranslator(),
			anchor([{ kind: "region", x: 0, y: 0, width: 1, height: 1 }]),
		),
	).toMatch(/bytes changed or it is gone.*cannot be re-verified/);
	expect(outdatedReason(currentTranslator(), anchor([]))).toMatch(/is gone/);
	expect(outdatedReason(currentTranslator(), null)).toMatch(/is gone/);
});
