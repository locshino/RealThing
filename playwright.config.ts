import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { toolHomeEnv } from "@realthing/shared/toolHomes";
import {
	hermeticE2ePath,
	hermeticE2eShell,
	resolveBunExecutable,
} from "./e2e/fixtures/executables";
import {
	E2E_DATA_DIR,
	E2E_EDITOR_LOG,
	E2E_FAKE_BIN_DIR,
	E2E_HOME_DIR,
	E2E_PICK_DIR_POINTER,
	E2E_PORT,
} from "./e2e/fixtures/paths";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const staticDir = fileURLToPath(new URL("./apps/web/dist", import.meta.url));
const PORT = E2E_PORT;
const bunExecutable = resolveBunExecutable();
const hostPath = hermeticE2ePath(E2E_FAKE_BIN_DIR);
const isShardLane =
	process.env.REALTHING_E2E_LANE !== undefined || !!process.env.REALTHING_E2E_JOB_SHARD;
const hostCommand =
	process.env.REALTHING_E2E_SKIP_BUILD === "1"
		? `${JSON.stringify(bunExecutable)} packages/server/src/dev.ts`
		: `${JSON.stringify(bunExecutable)} run build:web && ${JSON.stringify(bunExecutable)} packages/server/src/dev.ts`;
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: isShardLane,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	timeout: 30_000,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	globalSetup: "./e2e/global-setup.ts",
	globalTeardown: "./e2e/global-teardown.ts",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: hostCommand,
		cwd: rootDir,
		url: `http://localhost:${PORT}/health`,
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			REALTHING_PORT: String(PORT),
			REALTHING_STATIC_DIR: staticDir,
			REALTHING_DATA_DIR: E2E_DATA_DIR,
			DISPLAY: "",
			WAYLAND_DISPLAY: "",
			REALTHING_PICK_DIR: E2E_PICK_DIR_POINTER,
			REALTHING_GH_OFFLINE: "1",
			...toolHomeEnv(E2E_HOME_DIR),
			PATH: hostPath,
			SHELL: hermeticE2eShell(E2E_FAKE_BIN_DIR),
			REALTHING_E2E_EDITOR_LOG: E2E_EDITOR_LOG,
			CI: "1",
		},
	},
});
