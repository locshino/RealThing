#!/usr/bin/env bun

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSubcommand } from "./args";
import { stagingRoot } from "./paths";
import { embeddedRuntimeAssets, runtimeAssetsVersion } from "./runtime-assets.generated";
import { embeddedWebAssets, webAssetsVersion } from "./web-assets.generated";

async function stage(
	kind: string,
	version: string,
	files: { route: string; data: string }[],
): Promise<string> {
	const dir = join(stagingRoot(), kind, version);
	const marker = `${dir}.complete`;
	if (existsSync(marker)) return dir;
	await Promise.all(
		files.map(async (file) => {
			const dest = join(dir, file.route);
			mkdirSync(dirname(dest), { recursive: true });
			await Bun.write(dest, Bun.file(file.data));
		}),
	);
	await Bun.write(marker, version);
	return dir;
}

if (parseSubcommand(Bun.argv.slice(2)) === undefined) {
	const staticDir = await stage("web", webAssetsVersion, embeddedWebAssets);
	const runtimeDir = await stage("runtime", runtimeAssetsVersion, embeddedRuntimeAssets);
	const macosTrash = join(runtimeDir, "macos-trash");
	if (process.platform !== "win32") chmodSync(macosTrash, 0o755);
	process.env.REALTHING_STATIC_DIR ??= staticDir;
}
const { launch } = await import("./bootstrap");
await launch("binary");
