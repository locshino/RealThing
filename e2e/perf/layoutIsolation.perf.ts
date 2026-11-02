import { expect, type Locator, type Page, test } from "@playwright/test";
import { enterDefaultWorkspace, openFixtureProject, revealWorkbenchTool } from "../fixtures/app";
import {
	assertProfilingReady,
	attachRenderProfiler,
	detachRenderProfiler,
	MARKDOWN_SUBTREE,
	type RenderProfile,
	readRenderProfile,
	resetRenderProfile,
} from "./renderProfiler";

const SUBTREE_ROOTS = { [MARKDOWN_SUBTREE]: ["Markdown"] };

function renders(profile: RenderProfile, component: string): number {
	return profile.components[component]?.renders ?? 0;
}

function bodyIsolated(profile: RenderProfile): void {
	expect(profile.subtrees[MARKDOWN_SUBTREE]?.rootRenders ?? 0).toBe(0);
	expect(renders(profile, "GroupTabBody")).toBe(0);
}

async function openCenterEditor(page: Page): Promise<void> {
	await openFixtureProject(page);
	await assertProfilingReady(page);
	await enterDefaultWorkspace(page);
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "README.md" }).dblclick();
	await expect(page.getByTestId("editor-pane")).toBeVisible();
}

async function nextFrames(page: Page, count = 2): Promise<void> {
	await page.evaluate(async (frames) => {
		for (let frame = 0; frame < frames; frame += 1) await new Promise(requestAnimationFrame);
	}, count);
}

async function profileResizeMoves(page: Page, handle: Locator): Promise<RenderProfile> {
	const box = await handle.boundingBox();
	if (!box) throw new Error("resize handle has no bounding box");
	const startX = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(startX, y);
	await page.mouse.down();
	await resetRenderProfile(page);
	for (let step = 1; step <= 8; step += 1) {
		await page.mouse.move(startX - step * 10, y, { steps: 2 });
		await nextFrames(page, 1);
	}
	const profile = await readRenderProfile(page);
	await page.mouse.up();
	return profile;
}

test.beforeEach(async ({ page, baseURL }) => {
	if (!baseURL) throw new Error("isolation proof needs a baseURL");
	await attachRenderProfiler(page, baseURL, SUBTREE_ROOTS);
});

test.afterEach(async ({ page }) => {
	await detachRenderProfiler(page);
});

test("resizing a side panel does not re-render the center editor body", async ({ page }) => {
	await openCenterEditor(page);
	const handle = page.getByTestId("resize-right");
	await expect(handle).toBeVisible();

	const profile = await profileResizeMoves(page, handle);

	expect(profile.commits).toBeGreaterThan(0);
	bodyIsolated(profile);
});

test("focusing another region does not re-render the center editor body", async ({ page }) => {
	await openCenterEditor(page);
	const editor = page.getByTestId("editor-pane");
	const projects = page.getByTestId("left-nav");
	await expect(projects).toBeVisible();

	await editor.click();
	await nextFrames(page);
	await resetRenderProfile(page);
	await projects.click();
	await nextFrames(page);
	const profile = await readRenderProfile(page);

	bodyIsolated(profile);
	expect(renders(profile, "CenterGroupView")).toBe(0);
});
