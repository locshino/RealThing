import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countItems, flatItems, groupStatus, storeRel, TodoStore } from "./store";

const roots: string[] = [];

function tempRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "realthing-todos-"));
	roots.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("storeRel rejects unsafe scope ids", () => {
	expect(storeRel("workspace")).toBe(".realthing/context/todos/workspace.json");
	expect(() => storeRel("../escape")).toThrow();
});

test("add, update, remove, promote, and groupStatus work for manual items", () => {
	const store = new TodoStore(tempRoot(), "workspace");
	expect(store.read()).toEqual({ todos: [], groups: [] });

	const a = store.add({ title: "  First step  ", note: "details" });
	const b = store.add({ title: "Second step", after: a.id });
	expect(store.flat().map((t) => t.title)).toEqual(["First step", "Second step"]);
	expect(a.origin).toBe("user");

	store.update(a.id, { status: "in_progress" });
	const res = store.update(b.id, { status: "in_progress" });
	expect(res?.paused.map((t) => t.id)).toEqual([a.id]);
	expect(store.get(a.id)?.status).toBe("pending");
	expect(store.get(b.id)?.status).toBe("in_progress");

	const promoted = store.promote(a.id, "Phase 1");
	expect(promoted.ok).toBe(true);
	store.add({ title: "Grouped item", group: "Phase 1" });

	const plan = store.read();
	expect(countItems(plan)).toBe(2);
	expect(flatItems(plan).length).toBe(2);
	const firstGroup = plan.groups[0];
	expect(firstGroup && groupStatus(firstGroup)).toBe("pending");

	expect(store.remove(b.id)).toBe(true);
	expect(store.remove("missing")).toBe(false);
});
