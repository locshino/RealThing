import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	installConfigDir,
	installMetaFile,
	normalizeWindowsInstallPrefix,
	readInstallMeta,
	sameWindowsPath,
} from "./paths";

test("installMetaFile is where both installers write install.json", () => {
	expect(installMetaFile("/home/u")).toBe(join("/home/u", ".config", "realthing", "install.json"));
	expect(installConfigDir("/home/u")).toBe(join("/home/u", ".config", "realthing"));
});

test("normalizes native and legacy Windows install prefixes", () => {
	expect(normalizeWindowsInstallPrefix("C:\\tools\\realthing")).toBe("C:/tools/realthing");
	expect(normalizeWindowsInstallPrefix("/c/tools/realthing")).toBe("C:/tools/realthing");
	expect(normalizeWindowsInstallPrefix("/cygdrive/c/tools/realthing")).toBe("C:/tools/realthing");
	expect(normalizeWindowsInstallPrefix("//nas/share/realthing")).toBe("//nas/share/realthing");
	expect(normalizeWindowsInstallPrefix("/home/u/.local")).toBeUndefined();
	expect(sameWindowsPath("c:/TOOLS/realthing/", "C:\\tools\\realthing")).toBe(true);
});

test("readInstallMeta reads the installers' file and degrades to {} on anything else", () => {
	const home = mkdtempSync(join(tmpdir(), "realthing-paths-"));
	try {
		expect(readInstallMeta(home)).toEqual({});

		mkdirSync(installConfigDir(home), { recursive: true });
		writeFileSync(
			installMetaFile(home),
			JSON.stringify({ channel: "nightly", prefix: "/opt/tr", version: "1.2.3" }),
		);
		expect(readInstallMeta(home)).toEqual({
			channel: "nightly",
			prefix: "/opt/tr",
			version: "1.2.3",
		});

		writeFileSync(installMetaFile(home), "{not json");
		expect(readInstallMeta(home)).toEqual({});
		writeFileSync(installMetaFile(home), '"a string"');
		expect(readInstallMeta(home)).toEqual({});
		writeFileSync(installMetaFile(home), "null");
		expect(readInstallMeta(home)).toEqual({});
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
