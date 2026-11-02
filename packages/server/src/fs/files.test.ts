import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { CodedError } from "@realthing/shared/codedError";
import { readDir, readFile, workspaceRelativePath, writeFile } from "./files";

let dataDir: string;
let root: string;
const savedDataDir = process.env.REALTHING_DATA_DIR;

beforeEach(() => {
	dataDir = mkdtempSync(join(tmpdir(), "trpi-fs-test-"));
	process.env.REALTHING_DATA_DIR = dataDir;
	root = join(dataDir, "worktree");
	mkdirSync(join(root, "src", "auth"), { recursive: true });
	writeFileSync(join(root, "src", "auth", "login.ts"), "export {};\n");
	writeFileSync(
		join(dataDir, "workspaces.json"),
		JSON.stringify([{ id: "w1", projectId: "p1", name: "w1", worktreePath: root, createdAt: 1 }]),
	);
});

afterEach(() => {
	rmSync(dataDir, { recursive: true, force: true });
	if (savedDataDir === undefined) delete process.env.REALTHING_DATA_DIR;
	else process.env.REALTHING_DATA_DIR = savedDataDir;
});

test("readDir reports worktree-relative paths with forward slashes on every platform", () => {
	expect(readDir("w1", ".").map((node) => node.path)).toEqual(["src"]);
	expect(readDir("w1", "src").map((node) => node.path)).toEqual(["src/auth"]);
	expect(readDir("w1", "src/auth").map((node) => node.path)).toEqual(["src/auth/login.ts"]);
});

test("readDir honors filesExclude, filesShowHidden (keeping .realthing visible), and explorerSortOrder", () => {
	mkdirSync(join(root, ".git"), { recursive: true });
	mkdirSync(join(root, ".realthing"), { recursive: true });
	mkdirSync(join(root, "node_modules"), { recursive: true });
	mkdirSync(join(root, "dist"), { recursive: true });
	writeFileSync(join(root, ".env"), "SECRET=1\n");
	writeFileSync(join(root, "b.ts"), "export {};\n");
	writeFileSync(join(root, "a.json"), "{}\n");

	expect(readDir("w1", ".").map((node) => node.name)).toEqual([
		".realthing",
		"dist",
		"src",
		".env",
		"a.json",
		"b.ts",
	]);

	writeFileSync(
		join(root, ".realthing", "settings.json"),
		JSON.stringify({
			filesExclude: ["node_modules", "dist"],
			filesShowHidden: false,
			explorerSortOrder: "filesFirst",
		}),
	);
	expect(readDir("w1", ".").map((node) => node.name)).toEqual([
		"a.json",
		"b.ts",
		".realthing",
		"src",
	]);

	writeFileSync(
		join(root, ".realthing", "settings.json"),
		JSON.stringify({
			filesExclude: ["node_modules", "dist"],
			filesShowHidden: false,
			explorerSortOrder: "mixed",
		}),
	);
	expect(readDir("w1", ".").map((node) => node.name)).toEqual([
		".realthing",
		"a.json",
		"b.ts",
		"src",
	]);

	writeFileSync(
		join(root, ".realthing", "settings.json"),
		JSON.stringify({
			filesExclude: ["node_modules", "dist"],
			filesShowHidden: false,
			explorerSortOrder: "type",
		}),
	);
	writeFileSync(join(root, "z.md"), "# Z\n");
	expect(readDir("w1", ".").map((node) => node.name)).toEqual([
		".realthing",
		"src",
		"a.json",
		"z.md",
		"b.ts",
	]);
});

test("workspaceRelativePath names a contained path worktree-relative with / separators", () => {
	expect(workspaceRelativePath(root, join(root, "src", "auth", "login.ts"))).toBe(
		"src/auth/login.ts",
	);
	expect(workspaceRelativePath(root, join("src", "auth", "login.ts"))).toBe("src/auth/login.ts");
	expect(workspaceRelativePath(root, "./src/../src/auth")).toBe("src/auth");
	expect(workspaceRelativePath(`${root}${sep}.`, "src")).toBe("src");
	expect(workspaceRelativePath(root, "..env")).toBe("..env");
	expect(workspaceRelativePath(root, ".")).toBe("");
});

test("workspaceRelativePath rejects a path outside the worktree", () => {
	expect(workspaceRelativePath(root, "../worktree-sibling/a.ts")).toBeNull();
	expect(workspaceRelativePath(root, join(dataDir, "elsewhere"))).toBeNull();
});

describe("writeFile", () => {
	test("Happy Case: writes a new file and updates an existing file, preserving permissions and returning accurate SHA-256 meta", () => {
		const newContent = "# Readme\nHello RealThing!\n";
		const expectedNewSha = createHash("sha256").update(newContent, "utf8").digest("hex");
		const created = writeFile("w1", "README.md", newContent);

		expect(created.meta).toEqual({
			hash: expectedNewSha,
			byteLength: Buffer.byteLength(newContent, "utf8"),
			text: true,
			mime: "text/markdown",
		});
		expect(readFileSync(join(root, "README.md"), "utf8")).toBe(newContent);

		const scriptPath = join(root, "src", "auth", "login.ts");
		chmodSync(scriptPath, 0o755);
		const initialRead = readFile("w1", "src/auth/login.ts");
		expect(initialRead.meta.hash).toBeTruthy();

		const updatedContent = "export const loggedIn = true;\n";
		const expectedUpdatedSha = createHash("sha256").update(updatedContent, "utf8").digest("hex");
		const updated = writeFile(
			"w1",
			"src/auth/login.ts",
			updatedContent,
			initialRead.meta.hash ?? undefined,
		);

		expect(updated.meta.hash).toBe(expectedUpdatedSha);
		expect(updated.meta.byteLength).toBe(Buffer.byteLength(updatedContent, "utf8"));
		expect(updated.meta.text).toBe(true);
		expect(readFileSync(scriptPath, "utf8")).toBe(updatedContent);
		if (process.platform !== "win32") {
			expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
		}
	});

	test("Exception Case: throws STALE_VIEW when expectedHash mismatches and rejects directories or empty/root paths", () => {
		expect(() => writeFile("w1", "src/auth/login.ts", "updated\n", "0".repeat(64))).toThrow(
			CodedError,
		);
		try {
			writeFile("w1", "src/auth/login.ts", "updated\n", "0".repeat(64));
		} catch (error) {
			expect(error).toBeInstanceOf(CodedError);
			expect((error as CodedError).code).toBe("STALE_VIEW");
		}
		expect(readFileSync(join(root, "src", "auth", "login.ts"), "utf8")).toBe("export {};\n");

		// Passing expectedHash when file does not exist on disk also throws STALE_VIEW
		expect(() => writeFile("w1", "src/missing.ts", "new\n", "0".repeat(64))).toThrow(CodedError);

		// Writing to an existing directory
		expect(() => writeFile("w1", "src/auth", "not a dir")).toThrow("Cannot overwrite a directory");

		// Writing to empty or worktree root path
		expect(() => writeFile("w1", "", "root")).toThrow("Invalid file path");
		expect(() => writeFile("w1", "   ", "root")).toThrow("Invalid file path");
		expect(() => writeFile("w1", ".", "root")).toThrow("Invalid file path");
	});

	test("Hacking Case: blocks path traversal, .git writes, and writing through symlinks", () => {
		expect(() => writeFile("w1", "../../etc/passwd", "hacked")).toThrow(
			"Path escapes the worktree",
		);

		mkdirSync(join(root, ".git"), { recursive: true });
		expect(() => writeFile("w1", ".git/config", "[core]\n")).toThrow(
			"The .git directory is not readable",
		);
		expect(() => writeFile("w1", "src/../../.git/hooks/pre-commit", "#!/bin/sh\n")).toThrow(
			"Path escapes the worktree",
		);

		const outsideTarget = join(dataDir, "outside-secret.txt");
		writeFileSync(outsideTarget, "original secret");
		const symlinkPath = join(root, "src", "evil-link.txt");
		symlinkSync(outsideTarget, symlinkPath);

		try {
			writeFile("w1", "src/evil-link.txt", "overwritten secret");
			expect.unreachable("Should have refused writing through a symlink");
		} catch (error) {
			expect(error).toBeInstanceOf(CodedError);
			expect((error as CodedError).code).toBe("UNSUPPORTED_CHANGE");
		}
		expect(readFileSync(outsideTarget, "utf8")).toBe("original secret");
	});

	test("403 / Access Control Case: rejects unknown workspaceId and unauthorized paths outside the workspace root", () => {
		expect(() => writeFile("unknown-ws", "src/auth/login.ts", "export {};")).toThrow(
			"Unknown workspace: unknown-ws",
		);

		const unauthorizedFile = join(dataDir, "other-workspace", "secret.ts");
		mkdirSync(join(dataDir, "other-workspace"), { recursive: true });
		writeFileSync(unauthorizedFile, "secret");

		expect(() => writeFile("w1", unauthorizedFile, "tampered")).toThrow(
			"Path escapes the worktree",
		);
		expect(readFileSync(unauthorizedFile, "utf8")).toBe("secret");
	});
});
