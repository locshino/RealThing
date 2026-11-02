import { expect, test } from "bun:test";
import { type BranchFacts, createBranchStatusState } from "./branchStatusState";

const sampleFacts = (aheadOfBase = 1): BranchFacts => ({
	hasOrigin: true,
	pushesElsewhere: false,
	published: true,
	ahead: 0,
	behind: 0,
	aheadOfBase,
	onBase: false,
});

test("one keyed snapshot is shared by every subscriber", () => {
	const state = createBranchStatusState();
	let first = 0;
	let second = 0;
	const stopFirst = state.subscribe("w\0feature", () => {
		first += 1;
	});
	const stopSecond = state.subscribe("w\0feature", () => {
		second += 1;
	});

	const gen1 = state.beginRequest("w\0feature");
	state.resolveRequest("w\0feature", gen1, sampleFacts(2));
	expect(state.getSnapshot("w\0feature")).toEqual({
		status: sampleFacts(2),
	});
	expect(first).toBe(1);
	expect(second).toBe(1);

	stopFirst();
	const gen2 = state.beginRequest("w\0feature");
	state.resolveRequest("w\0feature", gen2, sampleFacts(3));
	expect(first).toBe(1);
	expect(second).toBe(2);
	stopSecond();
});

test("only the newest request generation may update a key", () => {
	const state = createBranchStatusState();
	const stale = state.beginRequest("w\0feature");
	const fresh = state.beginRequest("w\0feature");

	expect(state.resolveRequest("w\0feature", stale, sampleFacts(1))).toBe(false);
	expect(state.resolveRequest("w\0feature", fresh, sampleFacts(2))).toBe(true);
	expect(state.getSnapshot("w\0feature")?.status).toEqual(sampleFacts(2));
});

test("resolving with null clears status for the matching generation", () => {
	const state = createBranchStatusState();
	const gen1 = state.beginRequest("w\0feature");
	state.resolveRequest("w\0feature", gen1, sampleFacts(3));
	expect(state.getSnapshot("w\0feature")).toEqual({ status: sampleFacts(3) });

	const gen2 = state.beginRequest("w\0feature");
	expect(state.resolveRequest("w\0feature", gen2, null)).toBe(true);
	expect(state.getSnapshot("w\0feature")).toEqual({ status: null });
});
