import { expect, test } from "bun:test";
import { type BranchFacts, createBranchStatusState } from "./branchStatusState";
import { startBranchStatusSync, supportsBranchStatus } from "./useBranchStatus";

const sampleFacts = (aheadOfBase = 1): BranchFacts => ({
	hasOrigin: true,
	pushesElsewhere: false,
	published: true,
	ahead: 0,
	behind: 0,
	aheadOfBase,
	onBase: false,
});

test("supportsBranchStatus is true once protocolVersion is known", () => {
	expect(supportsBranchStatus(null)).toBe(false);
	expect(supportsBranchStatus(94)).toBe(true);
});

test("activation opts into cache reuse while focus performs a fresh read", async () => {
	const state = createBranchStatusState();
	const focusTarget = new EventTarget();
	const calls: Array<{ workspaceId: string; allowCached?: true }> = [];
	const releases: Array<(status: BranchFacts | null) => void> = [];
	const controller = startBranchStatusSync({
		workspaceId: "w1",
		key: "w1\0feature",
		state,
		focusTarget,
		connected: true,
		request: (params) => {
			calls.push(params);
			return new Promise((resolve) => releases.push(resolve));
		},
	});

	expect(calls).toEqual([{ workspaceId: "w1", allowCached: true }]);
	focusTarget.dispatchEvent(new Event("focus"));
	expect(calls).toEqual([{ workspaceId: "w1", allowCached: true }, { workspaceId: "w1" }]);
	releases[0]?.(sampleFacts(1));
	releases[1]?.(sampleFacts(2));
	await Promise.resolve();
	await Promise.resolve();
	expect(state.getSnapshot("w1\0feature")?.status).toEqual(sampleFacts(2));

	controller.setConnected(false);
	focusTarget.dispatchEvent(new Event("focus"));
	expect(calls).toHaveLength(2);
	controller.setConnected(true);
	expect(calls).toEqual([
		{ workspaceId: "w1", allowCached: true },
		{ workspaceId: "w1" },
		{ workspaceId: "w1" },
	]);

	controller.stop();
	focusTarget.dispatchEvent(new Event("focus"));
	expect(calls).toHaveLength(3);
});

test("reload re-reads cache-eligible and is dropped while disconnected", () => {
	const calls: Array<{ workspaceId: string; allowCached?: true }> = [];
	const controller = startBranchStatusSync({
		workspaceId: "w1",
		key: "w1\0feature",
		state: createBranchStatusState(),
		focusTarget: new EventTarget(),
		connected: true,
		request: (params) => {
			calls.push(params);
			return new Promise(() => {});
		},
	});

	controller.reload();
	expect(calls).toEqual([
		{ workspaceId: "w1", allowCached: true },
		{ workspaceId: "w1", allowCached: true },
	]);
	controller.setConnected(false);
	controller.reload();
	controller.setConnected(true);
	expect(calls).toEqual([
		{ workspaceId: "w1", allowCached: true },
		{ workspaceId: "w1", allowCached: true },
		{ workspaceId: "w1", allowCached: true },
	]);
	controller.stop();
});
