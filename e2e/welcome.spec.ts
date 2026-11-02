import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	defaultWorkspaceRow,
	openAppFresh,
	openFixtureProject,
	stagePlainFolder,
	worktreeRows,
} from "./fixtures/app";
import { E2E_PLAIN_DIR } from "./fixtures/paths";

test("opens a clean RealThing with no projects imported", async ({ page }) => {
	await openAppFresh(page);

	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
	await expect(page.getByTestId("right-panel")).toHaveCount(0);
	await expect(page.getByTestId("terminal-panel")).toHaveCount(0);

	await expect(page.getByTestId("welcome-title")).toHaveText("RealThing");
	await expect(page.getByTestId("welcome-cta")).toContainText("Start a new project");
	await expect(page.getByTestId("welcome-action")).toHaveCount(1);

	await page.getByTestId("welcome-action").filter({ hasText: "Open project" }).click();
	await expect(page.getByTestId("menu-open-project")).toBeVisible();
});

test("an open project offers Start building beside the project-folder fork", async ({ page }) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("welcome-title")).toHaveText("sample-project");
	const scope = page.getByTestId("scope-context");
	await expect(scope).toHaveAttribute("data-context", "project-home");
	await expect(scope).toContainText("sample-project");
	await expect(scope).toContainText("Project home");
	await expect(page.getByTestId("welcome-cta")).toContainText("Start building");
	await expect(page.getByTestId("welcome-action")).toHaveCount(1);
	await expect(
		page.getByTestId("welcome-action").filter({ hasText: "Work in project folder" }),
	).toBeVisible();
	await expect(page.getByTestId("welcome").getByText("Open project")).toHaveCount(0);

	await page.getByTestId("welcome-cta").click();
	const dialog = page.getByTestId("new-workspace-dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId("ws-target-worktree")).toHaveAttribute("data-active", "true");
	await expect(dialog.getByRole("heading", { name: "Create workspace" })).toBeVisible();
	await expect(dialog.getByTestId("ws-branch-picker")).toBeVisible();

	await dialog.getByTestId("ws-target-default").click();
	await expect(dialog.getByRole("heading", { name: "Work in project folder" })).toBeVisible();
	await expect(dialog).toContainText("no isolation");
	await expect(dialog.getByTestId("ws-branch-picker")).toHaveCount(0);

	await expect(page.getByTestId("create-workspace")).toHaveText(/Start/);
	await page.getByTestId("create-workspace").click();
	await expect(dialog).toBeHidden();
	await expect(page.getByTestId("welcome")).toHaveCount(0);
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.getByTestId("right-panel")).toBeVisible();
	await expect(page.getByTestId("terminal-panel")).toBeVisible();
	await expect(defaultWorkspaceRow(page)).toHaveAttribute("data-active", "true");
	await expect(worktreeRows(page)).toHaveCount(0);
});

test("opening a non-git folder from the Welcome screen offers to initialise a repo", async ({
	page,
}) => {
	await stagePlainFolder(page);
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.getByTestId("welcome")).toBeVisible();

	await page.getByTestId("welcome-action").filter({ hasText: "Open project" }).click();
	await page.getByTestId("menu-open-project").click();

	const confirmInit = page.getByTestId("confirm-init-repo");
	await expect(confirmInit).toBeVisible();
	await confirmInit.click();

	const projectRow = page.getByTestId("project-item").filter({ hasText: basename(E2E_PLAIN_DIR) });
	await expect(projectRow).toBeVisible();
	await expect(defaultWorkspaceRow(page)).toHaveAttribute("data-active", "true");
	await projectRow.getByText(basename(E2E_PLAIN_DIR)).click();
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
	await expect(page.getByTestId("welcome-title")).toHaveText(basename(E2E_PLAIN_DIR));
	await expect(page.getByTestId("welcome-cta")).toContainText("Start building");
	await expect(
		page.getByTestId("welcome-action").filter({ hasText: "Work in project folder" }),
	).toBeVisible();
});

test("clicking a project returns to its Welcome, deselecting the active workspace", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.locator('[data-testid="workspace-item"][data-active="true"]')).toHaveCount(1);

	await page.getByTestId("project-item").first().getByText("sample-project").click();
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
	await expect(page.locator('[data-testid="workspace-item"][data-active="true"]')).toHaveCount(0);

	await worktreeRows(page).first().getByRole("button").first().click();
	await expect(page.getByTestId("center-tabs")).toBeVisible();
});
