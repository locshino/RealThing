import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	enterDefaultWorkspace,
	openFixtureProject,
	pressPlatformShortcut,
	revealWorkbenchTool,
	waitTerminalReady,
} from "../fixtures/app";
import { commitFile } from "../fixtures/git";
import {
	assertProfilingReady,
	attachRenderProfiler,
	detachRenderProfiler,
	MARKDOWN_SUBTREE,
	type MainThreadCost,
	type RenderProfile,
	readRenderProfile,
	resetRenderProfile,
	startMainThreadProbe,
} from "./renderProfiler";
import { DEFAULT_SCENARIOS, SCENARIO_NAMES, type ScenarioName } from "./scenarios";

const RUNS = Number(process.env.REALTHING_PERF_RUNS ?? 5);
const OUT_DIR = process.env.REALTHING_PERF_OUT ?? join(process.cwd(), "test-results", "perf-runs");
const LIVE_EDITS = 20;
const DIFF_LINES = 3_000;
const SCROLL_STEPS = 40;
const SELECTED = new Set(process.env.REALTHING_PERF_SCENARIOS?.split(",") ?? DEFAULT_SCENARIOS);
const CPU_RATE = Number(process.env.REALTHING_PERF_CPU ?? 1);
const SUBTREE_ROOTS = {
	[MARKDOWN_SUBTREE]: (process.env.REALTHING_PERF_MARKDOWN_ROOTS ?? "Markdown").split(","),
};

interface Counters {
	[name: string]: number;
}

export interface ScenarioRun {
	scenario: string;
	run: number;
	cpuRate: number;
	wallMs: number;
	counters: Counters;
	mainThread: MainThreadCost;
	profile: RenderProfile;
}

function record(result: ScenarioRun): void {
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(join(OUT_DIR, `${result.scenario}-${result.run}.json`), JSON.stringify(result));
}

async function nextFrames(page: Page, count = 2): Promise<void> {
	await page.evaluate(async (frames) => {
		for (let frame = 0; frame < frames; frame += 1) await new Promise(requestAnimationFrame);
	}, count);
}

async function measure(
	page: Page,
	scenario: string,
	run: number,
	action: () => Promise<Counters>,
): Promise<void> {
	await nextFrames(page);
	const stopProbe = await startMainThreadProbe(page, CPU_RATE);
	await resetRenderProfile(page);
	const startedAt = performance.now();
	const counters = await action();
	await nextFrames(page);
	const wallMs = performance.now() - startedAt;
	const profile = await readRenderProfile(page);
	const mainThread = await stopProbe();
	record({ scenario, run, cpuRate: CPU_RATE, wallMs, counters, mainThread, profile });
}

function maxScrollTop(root: Locator): Promise<number> {
	return root.evaluate((element) => {
		const nodes: Element[] = [element];
		let top = 0;
		while (nodes.length > 0) {
			const node = nodes.pop();
			if (!node) break;
			top = Math.max(top, node.scrollTop);
			if (node.shadowRoot) nodes.push(...node.shadowRoot.children);
			nodes.push(...node.children);
		}
		return top;
	});
}

function numberedSource(lines: number, edit: (line: number) => string | null): string {
	return `${Array.from(
		{ length: lines },
		(_, line) => edit(line) ?? `export const value${line} = ${line} * 2; // stable line ${line}`,
	).join("\n")}\n`;
}

async function regionToggles(page: Page, run: number): Promise<void> {
	await openFixtureProject(page);
	await assertProfilingReady(page);
	await enterDefaultWorkspace(page);
	await waitTerminalReady(page);
	const files = page.getByTestId("tool-rail-files");
	await expect(files).toBeVisible();

	await measure(page, "region-toggles", run, async () => {
		await files.click();
		await files.click();
		await pressPlatformShortcut(page, "j");
		await expect(page.getByTestId("right-stack")).toHaveCount(0);
		await pressPlatformShortcut(page, "j");
		await expect(page.getByTestId("right-stack")).toBeVisible();
		await pressPlatformShortcut(page, "Shift+j");
		await expect(page.getByTestId("bottom-panel")).toHaveCount(0);
		await pressPlatformShortcut(page, "Shift+j");
		await waitTerminalReady(page);
		return {};
	});
}

async function liveFileEdits(page: Page, run: number): Promise<void> {
	await openFixtureProject(page);
	await assertProfilingReady(page);
	const workspace = await createWorkspaceViaDialog(page);
	const path = join(workspace.worktreePath, "live-edit.ts");
	writeFileSync(
		path,
		numberedSource(400, (line) => (line === 0 ? "// revision 0" : null)),
	);
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "live-edit.ts" }).dblclick();
	const editor = page.getByTestId("editor-pane");
	await expect(editor).toContainText("revision 0");

	await measure(page, "live-file-edits", run, async () => {
		for (let revision = 1; revision <= LIVE_EDITS; revision += 1) {
			writeFileSync(
				path,
				numberedSource(400 + revision * 5, (line) =>
					line === 0
						? `// revision ${revision}`
						: line % 25 === revision % 25
							? `export const edited${line} = ${revision};`
							: null,
				),
			);
			await expect(editor).toContainText(`revision ${revision}`, { timeout: 10_000 });
		}
		return {};
	});
}

async function largeDiff(page: Page, run: number): Promise<void> {
	await openFixtureProject(page);
	await assertProfilingReady(page);
	const workspace = await createWorkspaceViaDialog(page);
	commitFile(
		workspace.worktreePath,
		"large-diff.ts",
		numberedSource(DIFF_LINES, () => null),
		"add large diff base",
	);
	writeFileSync(
		join(workspace.worktreePath, "large-diff.ts"),
		numberedSource(DIFF_LINES, (line) =>
			line % 7 === 0 ? `export const changed${line} = "${line}"; // changed line ${line}` : null,
		),
	);
	await revealWorkbenchTool(page, "changes");
	await page.getByTestId("changes-scope-trigger").click();
	await page.getByTestId("changes-scope-uncommitted").click();
	const change = page.getByTestId("change-item").filter({ hasText: "large-diff.ts" });
	await expect(change).toBeVisible();

	await measure(page, "large-diff", run, async () => {
		await change.dblclick();
		const diff = page.getByTestId("diff-view");
		await expect(diff.getByText("changed line 0", { exact: false }).first()).toBeVisible({
			timeout: 20_000,
		});
		const box = await diff.boundingBox();
		if (!box) throw new Error("diff view has no layout box");
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		for (let step = 0; step < SCROLL_STEPS; step += 1) {
			await page.mouse.wheel(0, 600);
			await nextFrames(page);
		}
		expect(await maxScrollTop(diff)).toBeGreaterThan(SCROLL_STEPS * 300);
		return {};
	});
}

const SCENARIOS: Record<ScenarioName, (page: Page, run: number) => Promise<void>> = {
	"region-toggles": regionToggles,
	"live-file-edits": liveFileEdits,
	"large-diff": largeDiff,
};

test.beforeEach(async ({ page, baseURL }) => {
	if (!baseURL) throw new Error("perf runs need a baseURL");
	await attachRenderProfiler(page, baseURL, SUBTREE_ROOTS);
});

test.afterEach(async ({ page }) => {
	await detachRenderProfiler(page);
});

for (let run = 1; run <= RUNS; run += 1) {
	for (const name of SCENARIO_NAMES) {
		if (!SELECTED.has(name)) continue;
		const scenario = SCENARIOS[name];
		test(`${name} run ${run}`, async ({ page }) => {
			await scenario(page, run);
		});
	}
}
