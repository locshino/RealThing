import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullConfig } from "@playwright/test";
import { E2E_BASE_CONFIG, seedAnalyticsConsent } from "./fixtures/analyticsConsent";
import { writeFakeGh, writeHermeticE2eShell } from "./fixtures/executables";
import {
	E2E_DATA_DIR,
	E2E_FAKE_BIN_DIR,
	E2E_FIXTURE_REPO,
	E2E_GH_LOG,
	E2E_GH_SCENARIO,
	E2E_HOME_DIR,
	E2E_PICK_DIR_POINTER,
} from "./fixtures/paths";
import { seedFixtureRepo } from "./fixtures/repo";

export default function globalSetup(config?: FullConfig): void | Promise<void> {
	rmSync(E2E_DATA_DIR, { recursive: true, force: true });
	mkdirSync(E2E_DATA_DIR, { recursive: true });
	writeFileSync(join(E2E_DATA_DIR, "config.json"), JSON.stringify(E2E_BASE_CONFIG));
	writeFileSync(
		join(E2E_DATA_DIR, "feedback.json"),
		JSON.stringify({ acceptedMessages: 0, nextInvitationAt: 10, dismissed: true }),
	);
	mkdirSync(E2E_HOME_DIR, { recursive: true });
	for (const rc of [".zshrc", ".bashrc"]) writeFileSync(join(E2E_HOME_DIR, rc), "");

	mkdirSync(E2E_FAKE_BIN_DIR, { recursive: true });
	for (const command of ["code", "github-ssh"]) {
		const target = join(E2E_FAKE_BIN_DIR, command);
		copyFileSync(new URL(`./fixtures/bin/${command}`, import.meta.url), target);
		chmodSync(target, 0o755);
	}
	writeHermeticE2eShell(E2E_FAKE_BIN_DIR, process.env.SHELL ?? "/bin/bash");
	writeFakeGh(E2E_FAKE_BIN_DIR, E2E_GH_SCENARIO, E2E_GH_LOG);

	seedFixtureRepo();
	writeFileSync(E2E_PICK_DIR_POINTER, E2E_FIXTURE_REPO);

	const baseURL = config?.projects[0]?.use.baseURL;
	if (!baseURL) return undefined;
	return seedAnalyticsConsent(baseURL, false, true).then(() => undefined);
}
