import { devices, type PlaywrightTestConfig } from "@playwright/test";
import { toolHomeEnv } from "@realthing/shared/toolHomes";
import { hermeticE2ePath, hermeticE2eShell } from "./fixtures/executables";
import {
	E2E_DATA_DIR,
	E2E_EDITOR_LOG,
	E2E_FAKE_BIN_DIR,
	E2E_HOME_DIR,
	E2E_PICK_DIR_POINTER,
} from "./fixtures/paths";

export function artifactHostEnvironment(cacheDir: string): Record<string, string> {
	const hostPath = hermeticE2ePath(E2E_FAKE_BIN_DIR);
	return {
		REALTHING_DATA_DIR: E2E_DATA_DIR,
		XDG_CACHE_HOME: cacheDir,
		REALTHING_PICK_DIR: E2E_PICK_DIR_POINTER,
		REALTHING_GH_OFFLINE: "1",
		...toolHomeEnv(E2E_HOME_DIR),
		PATH: hostPath,
		SHELL: hermeticE2eShell(E2E_FAKE_BIN_DIR),
		REALTHING_E2E_EDITOR_LOG: E2E_EDITOR_LOG,
		CI: "1",
	};
}

export function artifactPlaywrightConfig(
	name: "binary" | "desktop",
	baseURL: string,
	managedFixtures: boolean,
): PlaywrightTestConfig {
	return {
		testDir: "./e2e",
		grepInvert: /@dev-seam/,
		fullyParallel: true,
		workers: 1,
		forbidOnly: !!process.env.CI,
		retries: process.env.CI ? 1 : 0,
		timeout: 30_000,
		reporter: process.env.CI
			? [["github"], ["html", { open: "never", outputFolder: `playwright-report-${name}` }]]
			: "list",
		outputDir: `test-results-${name}`,
		...(managedFixtures
			? {
					globalSetup: "./e2e/global-setup.ts",
					globalTeardown: "./e2e/global-teardown.ts",
				}
			: {}),
		use: {
			baseURL,
			trace: "on-first-retry",
		},
		projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	};
}
