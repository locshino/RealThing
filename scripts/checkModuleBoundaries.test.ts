import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moduleBoundaryViolations } from "./check-module-boundaries";

const roots: string[] = [];

const modules = {
	"packages/artifact-tests": "@realthing/artifact-tests",
	"packages/contracts": "@realthing/contracts",
	"packages/shared": "@realthing/shared",
	"packages/server": "@realthing/server",
	"apps/web": "@realthing/web",
	"apps/cli": "@realthing/cli",
	"apps/desktop": "@realthing/desktop",
} as const;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root: string, path: string, content: string): void {
	const target = join(root, path);
	mkdirSync(join(target, ".."), { recursive: true });
	writeFileSync(target, content);
}

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "realthing-module-boundaries-"));
	roots.push(root);
	const dependencies: Record<string, Record<string, string>> = {
		"packages/artifact-tests": {
			"@realthing/cli": "workspace:*",
			"@realthing/server": "workspace:*",
			"@realthing/shared": "workspace:*",
		},
		"packages/shared": { "@realthing/contracts": "workspace:*" },
		"packages/server": {
			"@realthing/contracts": "workspace:*",
			"@realthing/shared": "workspace:*",
		},
		"apps/web": { "@realthing/contracts": "workspace:*" },
		"apps/cli": {
			"@realthing/server": "workspace:*",
			"@realthing/shared": "workspace:*",
		},
		"apps/desktop": {
			"@realthing/server": "workspace:*",
			"@realthing/shared": "workspace:*",
		},
	};
	for (const [moduleRoot, name] of Object.entries(modules)) {
		write(
			root,
			`${moduleRoot}/package.json`,
			JSON.stringify({ name, dependencies: dependencies[moduleRoot] ?? {} }),
		);
	}
	return root;
}

test("accepts the declared package rings and thin launcher edges", () => {
	const root = fixture();
	write(
		root,
		"packages/shared/src/value.ts",
		'import type { Project } from "@realthing/contracts";',
	);
	write(root, "packages/server/src/value.ts", 'export * from "@realthing/contracts";');
	write(root, "apps/web/src/value.tsx", 'import type { Project } from "@realthing/contracts";');
	write(root, "apps/cli/src/value.ts", 'import { bootHost } from "@realthing/server";');
	write(root, "packages/artifact-tests/src/value.ts", 'import "@realthing/cli/artifact";');
	write(
		root,
		"apps/desktop/src/value.ts",
		'const host = import("@realthing/server/build-support");',
	);

	expect(moduleBoundaryViolations(root)).toEqual([]);
});

test("keeps artifact test infrastructure out of product code", () => {
	const root = fixture();
	write(root, "apps/desktop/src/testLeak.ts", 'import "@realthing/artifact-tests";');
	write(root, "packages/server/src/testLeak.ts", 'import "@realthing/artifact-tests";');
	write(root, "packages/artifact-tests/src/webLeak.ts", 'import "@realthing/web";');
	expect(moduleBoundaryViolations(root)).toEqual([
		'apps/desktop/src/testLeak.ts: import "@realthing/artifact-tests" creates forbidden apps/desktop -> packages/artifact-tests edge',
		'packages/artifact-tests/src/webLeak.ts: import "@realthing/web" creates forbidden packages/artifact-tests -> apps/web edge',
		'packages/server/src/testLeak.ts: import "@realthing/artifact-tests" creates forbidden packages/server -> packages/artifact-tests edge',
	]);
});

test("ignores generated framework files without excluding desktop source", () => {
	const root = fixture();
	write(root, "apps/desktop/.hutch/devkit/api/example.ts", 'import "@realthing/web";');
	write(root, "apps/desktop/.cottontail-tmp/loader.mjs", 'import "@realthing/web";');
	write(root, "apps/desktop/src/example.ts", 'import "@realthing/web";');

	expect(moduleBoundaryViolations(root)).toEqual([
		'apps/desktop/src/example.ts: import "@realthing/web" creates forbidden apps/desktop -> apps/web edge',
	]);
});

test("rejects manifest, type-only, dynamic, CommonJS, and relative cross-boundary edges", () => {
	const root = fixture();
	write(
		root,
		"apps/desktop/package.json",
		JSON.stringify({
			name: "@realthing/desktop",
			dependencies: {
				"@realthing/server": "workspace:*",
				"@realthing/shared": "workspace:*",
				"@realthing/web": "workspace:*",
			},
		}),
	);
	write(
		root,
		"apps/web/src/typeLeak.ts",
		'import type { RunningServer } from "@realthing/server";',
	);
	write(root, "apps/web/src/commonJsLeak.cjs", 'require("@realthing/server");');
	write(root, "apps/cli/src/dynamicLeak.ts", 'void import("@realthing/web");');
	write(root, "packages/shared/src/relativeLeak.ts", 'export * from "../../server/src/index";');

	expect(moduleBoundaryViolations(root)).toEqual([
		'apps/cli/src/dynamicLeak.ts: import "@realthing/web" creates forbidden apps/cli -> apps/web edge',
		"apps/desktop/package.json: dependencies.@realthing/web creates forbidden apps/desktop -> apps/web edge",
		'apps/web/src/commonJsLeak.cjs: import "@realthing/server" creates forbidden apps/web -> packages/server edge',
		'apps/web/src/typeLeak.ts: import "@realthing/server" creates forbidden apps/web -> packages/server edge',
		'packages/shared/src/relativeLeak.ts: import "../../server/src/index" creates forbidden packages/shared -> packages/server edge',
	]);
});

test("keeps resource renderers on contracts and ui, consumed by the web app only", () => {
	const root = fixture();
	write(
		root,
		"packages/ui/package.json",
		JSON.stringify({
			name: "@realthing/ui",
			dependencies: { "@realthing/contracts": "workspace:*" },
		}),
	);
	write(
		root,
		"packages/resource-renderers/package.json",
		JSON.stringify({
			name: "@realthing/resource-renderers",
			dependencies: { "@realthing/contracts": "workspace:*", "@realthing/ui": "workspace:*" },
		}),
	);
	write(root, "packages/resource-renderers/src/view.tsx", 'import "@realthing/ui/button";');
	write(root, "apps/web/src/pane.tsx", 'import "@realthing/resource-renderers";');
	expect(moduleBoundaryViolations(root)).toEqual([]);

	write(root, "packages/resource-renderers/src/leak.ts", 'import "@realthing/server";');
	expect(moduleBoundaryViolations(root)).toEqual([
		'packages/resource-renderers/src/leak.ts: import "@realthing/server" creates forbidden packages/resource-renderers -> packages/server edge',
	]);
});

test("locales is a leaf every UI surface and the host may import", () => {
	const root = fixture();
	for (const [moduleRoot, name, dependencies] of [
		["packages/locales", "@realthing/locales", []],
		["packages/ui", "@realthing/ui", ["@realthing/locales"]],
		["apps/web", "@realthing/web", ["@realthing/contracts", "@realthing/locales"]],
	] as const) {
		write(
			root,
			`${moduleRoot}/package.json`,
			JSON.stringify({
				name,
				dependencies: Object.fromEntries(dependencies.map((dep) => [dep, "workspace:*"])),
			}),
		);
	}
	write(root, "apps/web/src/a.ts", 'import "@realthing/locales/react";');
	write(root, "packages/ui/a.ts", 'import "@realthing/locales/react";');
	write(root, "packages/server/src/a.ts", 'import "@realthing/locales";');
	write(root, "apps/desktop/src/a.ts", 'import "@realthing/locales";');
	expect(moduleBoundaryViolations(root)).toEqual([]);

	write(root, "packages/locales/src/b.ts", 'import "@realthing/contracts";');
	expect(moduleBoundaryViolations(root)).toEqual([
		'packages/locales/src/b.ts: import "@realthing/contracts" creates forbidden packages/locales -> packages/contracts edge',
	]);
});
