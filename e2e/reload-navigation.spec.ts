import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
	activeWorktreeRow,
	createWorkspaceViaDialog,
	enterDefaultWorkspace,
	openFixtureProject,
	revealWorkbenchTool,
	worktreeRows,
} from "./fixtures/app";
import { E2E_DATA_DIR } from "./fixtures/paths";

const activeTab = (page: Page) => page.locator('[data-testid="editor-tab"][data-active="true"]');
const currentHash = (page: Page) => page.evaluate(() => window.location.hash);

function fixtureProjectId(): string {
	const projects = JSON.parse(readFileSync(join(E2E_DATA_DIR, "projects.json"), "utf8")) as {
		id: string;
	}[];
	const id = projects[0]?.id;
	if (!id) throw new Error("no fixture project persisted");
	return id;
}

async function coldOpen(page: Page, fragment: string): Promise<void> {
	await page.goto("about:blank");
	await page.goto(`/${fragment}`);
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
}

test("missing workspace and project fall back to the nearest valid location", async ({ page }) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	const projectId = fixtureProjectId();

	await coldOpen(page, `#/v1/projects/${projectId}/workspaces/gone`);
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(activeWorktreeRow(page)).toHaveCount(0);
	await expect.poll(() => currentHash(page)).toBe(`#/v1/projects/${projectId}`);

	await coldOpen(page, "#/v1/projects/gone/workspaces/w");
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect.poll(() => currentHash(page)).toBe("#/v1");
});

test("a transient workspace read failure preserves the URL and restores after reconnect", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	const hash = await currentHash(page);

	let injected = false;
	await page.routeWebSocket(/\/ws(\?|$)/, (ws) => {
		const server = ws.connectToServer();
		ws.onMessage((message) => {
			const raw = typeof message === "string" ? message : message.toString();
			let frame: { id?: string; method?: string; params?: { includeDiffStats?: boolean } };
			try {
				frame = JSON.parse(raw) as typeof frame;
			} catch {
				server.send(message);
				return;
			}
			if (
				!injected &&
				frame.id &&
				frame.method === "workspace.list" &&
				frame.params?.includeDiffStats === false
			) {
				injected = true;
				ws.send(JSON.stringify({ id: frame.id, ok: false, error: "injected transient failure" }));
				ws.close();
				return;
			}
			server.send(message);
		});
		server.onMessage((message) => ws.send(message));
	});

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(activeWorktreeRow(page)).toHaveCount(1);
	expect(await currentHash(page)).toBe(hash);
	expect(injected).toBe(true);
});

test("user navigation while the restore read is delayed wins over the late response", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	const projectId = fixtureProjectId();

	let heldFrame: string | null = null;
	let releaseHeld: (() => void) | null = null;
	await page.routeWebSocket(/\/ws(\?|$)/, (ws) => {
		const server = ws.connectToServer();
		releaseHeld = () => {
			if (heldFrame) server.send(heldFrame);
			heldFrame = null;
		};
		ws.onMessage((message) => {
			const raw = typeof message === "string" ? message : message.toString();
			let frame: { method?: string; params?: { includeDiffStats?: boolean } };
			try {
				frame = JSON.parse(raw) as typeof frame;
			} catch {
				server.send(message);
				return;
			}
			if (
				heldFrame === null &&
				releaseHeld !== null &&
				frame.method === "workspace.list" &&
				frame.params?.includeDiffStats === false
			) {
				heldFrame = raw;
				return;
			}
			server.send(message);
		});
		server.onMessage((message) => ws.send(message));
	});

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await page.getByTestId("project-item").first().getByText("sample-project").click();
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect.poll(() => currentHash(page)).toBe(`#/v1/projects/${projectId}`);

	releaseHeld?.();
	await page.waitForTimeout(500);
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(activeWorktreeRow(page)).toHaveCount(0);
	expect(await currentHash(page)).toBe(`#/v1/projects/${projectId}`);
});

test("reload from a file tab restores its shared placement under the workspace route", async ({
	page,
}) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	const projectId = fixtureProjectId();

	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "README.md" }).click();
	await expect(page.locator('[data-testid="editor-tab"][data-kind="file"]')).toHaveCount(1);
	const hash = await currentHash(page);
	expect(hash).toContain(`#/v1/projects/${projectId}/workspaces/`);

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.locator('[data-testid="workspace-item"][data-kind="default"]')).toHaveAttribute(
		"data-active",
		"true",
	);
	await expect(page.locator('[data-testid="editor-tab"][data-kind="file"]')).toHaveCount(1);
	await expect(activeTab(page)).toContainText("README.md");
	expect(await currentHash(page)).toBe(hash);
});

test("workspace rows still list after a reload restore (the light list is complete)", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(activeWorktreeRow(page)).toHaveCount(1);
	await expect(page.locator('[data-testid="workspace-item"][data-kind="default"]')).toBeVisible();
	await expect(worktreeRows(page)).toHaveCount(1);
});
