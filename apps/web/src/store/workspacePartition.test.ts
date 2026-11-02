import { expect, test } from "bun:test";
import type { Workspace } from "@realthing/contracts";
import { selectProjectWorkspaces } from "./selectors.js";

function ws(over: Partial<Workspace> = {}): Workspace {
	return {
		id: "w1",
		projectId: "p1",
		name: "feature",
		branch: "feature",
		worktreePath: "/wt/w1",
		baseBranch: "main",
		...over,
	};
}

test("default workspace stays first; other rows follow in reverse creation order", () => {
	const def = ws({ id: "def", kind: "default", name: "Default" });
	const w1 = ws({ id: "w1", name: "w1" });
	const w2 = ws({ id: "w2", name: "w2" });
	const workspaces = { p1: [def, w1, w2] };

	const rows = selectProjectWorkspaces(workspaces, "p1");
	expect(rows.map((row) => row.id)).toEqual(["def", "w2", "w1"]);
});
