import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createWorkspaceViaDialog, openFixtureProject, revealWorkbenchTool } from "./fixtures/app";
import { installChannelHold } from "./fixtures/channelHold";
import { pierreDeletionsSide } from "./fixtures/pierre";
import { LONG_LINE } from "./fixtures/repo";

function widthControls(page: Page) {
	return {
		input: page.getByTestId("file-line-width-input"),
		bounded: page.getByTestId("file-line-width-bounded"),
	};
}

async function openFileLineWidthSettings(page: Page) {
	if (!(await page.getByTestId("settings-dialog").isVisible())) {
		await page.getByTestId("open-settings").click();
	}
	const nav = page.getByTestId("settings-nav-appearance");
	await expect(nav).toBeVisible();
	await nav.click();
	await expect(page.getByTestId("file-line-width-control")).toBeVisible();
	return widthControls(page);
}

/**
 * Widths auto-save on Enter. Escape then drops the draft back to the stored width, so the value
 * reads `value` only once the host's settings broadcast has reached this page's store.
 */
async function saveWidth(input: Locator, value: number): Promise<void> {
	await input.fill(String(value));
	await input.press("Enter");
	await input.press("Escape");
	await expect(input).toHaveValue(String(value));
}

/** Escape inside a focused width draft only resets that draft, so close the dialog by its button. */
async function closeSettings(page: Page): Promise<void> {
	const dialog = page.getByTestId("settings-dialog");
	await dialog.getByRole("button", { name: "Close" }).click();
	await expect(dialog).toBeHidden();
}

async function restoreLineWidthDefaults(page: Page): Promise<void> {
	if (page.isClosed()) return;
	if (await page.getByTestId("settings-dialog").isVisible()) await closeSettings(page);
	const controls = await openFileLineWidthSettings(page);
	if ((await controls.input.inputValue()) !== "120") await saveWidth(controls.input, 120);
	if ((await controls.bounded.getAttribute("data-active")) !== "true") {
		await controls.bounded.click();
		await expect(controls.bounded).toHaveAttribute("data-active", "true");
	}
	await closeSettings(page);
}

async function expectWrapped(viewLines: Locator): Promise<void> {
	await expect(viewLines).toBeVisible();
	await expect.poll(() => viewLines.locator(":scope > .view-line").count()).toBeGreaterThan(1);
}

test("line-width controls validate drafts, converge on broadcasts, and persist", async ({
	page,
}) => {
	const channelHold = await installChannelHold(page);
	let release = () => {};
	try {
		await page.goto("/");
		await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
		const file = await openFileLineWidthSettings(page);
		await expect(file.input).toHaveValue("120");
		await expect(file.bounded).toHaveAttribute("data-active", "true");

		await file.input.fill("90");
		await file.input.press("Escape");
		await expect(file.input).toHaveValue("120");

		await file.input.fill("39");
		await expect(file.input).toHaveAttribute("aria-invalid", "true");
		await expect(page.getByText("Enter a whole number from 40 to 240.")).toBeVisible();
		await file.input.press("Enter");
		await expect(file.input).toHaveValue("39");
		await expect(file.input).toHaveAttribute("aria-invalid", "true");

		await saveWidth(file.input, 160);
		await expect(file.input).not.toHaveAttribute("aria-invalid", "true");

		const held = channelHold.arm("settings.changed");
		release = held.release;
		await file.bounded.click();
		await held.held;
		await expect(file.bounded).toHaveAttribute("data-active", "true");
		release();
		release = () => {};
		await expect(file.bounded).toHaveAttribute("data-active", "false");

		await page.reload();
		await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
		await openFileLineWidthSettings(page);
		await expect(file.input).toHaveValue("160");
		await expect(file.bounded).toHaveAttribute("data-active", "false");
	} finally {
		release();
		await restoreLineWidthDefaults(page).catch(() => {});
	}
});

test("the file width wraps source and updates an already-mounted editor", async ({ page }) => {
	try {
		await openFixtureProject(page);
		await createWorkspaceViaDialog(page);
		await revealWorkbenchTool(page, "files");
		await page.getByTestId("file-node").filter({ hasText: "LONG_LINE.txt" }).dblclick();

		const viewLines = page.locator('[data-testid="editor-pane"]:visible .view-lines');
		await expectWrapped(viewLines);
		const defaultVisualLines = await viewLines.locator(":scope > .view-line").count();

		const file = await openFileLineWidthSettings(page);
		await saveWidth(file.input, 40);
		await closeSettings(page);
		await expect
			.poll(() => viewLines.locator(":scope > .view-line").count())
			.toBeGreaterThan(defaultVisualLines);
	} finally {
		await restoreLineWidthDefaults(page).catch(() => {});
	}
});

test("Pierre renders both sides of a long-line diff", async ({ page }) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(join(workspace.worktreePath, "LONG_LINE.txt"), `changed ${LONG_LINE}`);

	await revealWorkbenchTool(page, "changes");
	await page.getByTestId("change-item").filter({ hasText: "LONG_LINE.txt" }).dblclick();
	const diff = page.getByTestId("diff-view");
	await expect(
		pierreDeletionsSide(diff).getByText(LONG_LINE.trim(), { exact: false }).last(),
	).toBeVisible();
	await expect(
		diff
			.locator("[data-additions]")
			.getByText(`changed ${LONG_LINE}`.trim(), { exact: false })
			.last(),
	).toBeVisible();
});
