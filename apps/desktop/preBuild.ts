import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import type { BuildRuntimeSources } from "@realthing/server/build-support";
import { injectChunkId, type SourceMapJson } from "./src/runtimeSourceMap";
import { ptyLibraryName, runtimeTarget } from "./src/runtimeTarget";

const desktopDir = import.meta.dir;
const repoRoot = resolve(desktopDir, "..", "..");
const stageDir = join(desktopDir, ".stage");
const runtimeDir = join(stageDir, "runtime");
const generatedEntry = join(stageDir, "server-entry.ts");

function runBun(args: string[]): void {
	const result = spawnSync("bun", args, { cwd: repoRoot, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`bun ${args.join(" ")} exited ${result.status ?? result.signal}`);
	}
}

function resolveRuntimeSources(): BuildRuntimeSources {
	const result = spawnSync(
		"bun",
		[
			"--print",
			'JSON.stringify((await import("@realthing/server/build-support")).resolveBuildRuntimeSources())',
		],
		{ cwd: desktopDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`build-support manifest exited ${result.status ?? result.signal}`);
	}
	return JSON.parse(result.stdout) as BuildRuntimeSources;
}

function sourceMapRelease(): string | null {
	const release = process.env.REALTHING_SOURCEMAPS_RELEASE?.trim();
	if (!release) return null;
	if (!process.env.POSTHOG_CLI_API_KEY || !process.env.POSTHOG_CLI_PROJECT_ID) {
		throw new Error(
			"REALTHING_SOURCEMAPS_RELEASE needs POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID",
		);
	}
	return release;
}

function uploadRuntimeSourceMap(runtimeFile: string, release: string): void {
	const mapFile = `${runtimeFile}.map`;
	const injected = injectChunkId(
		readFileSync(runtimeFile, "utf8"),
		JSON.parse(readFileSync(mapFile, "utf8")) as SourceMapJson,
		release,
	);
	writeFileSync(runtimeFile, injected.code);
	rmSync(mapFile);
	const uploadDir = join(stageDir, "sourcemaps");
	mkdirSync(uploadDir, { recursive: true });
	writeFileSync(join(uploadDir, "server-runtime.js"), injected.code);
	writeFileSync(join(uploadDir, "server-runtime.js.map"), JSON.stringify(injected.map));
	try {
		runBun([
			"run",
			"posthog-cli",
			"sourcemap",
			"upload",
			"--directory",
			uploadDir,
			"--release-name",
			"realthing",
			"--release-version",
			release,
			"--release-mode",
			"symbol-set",
		]);
	} finally {
		rmSync(uploadDir, { recursive: true, force: true });
	}
}

function listFiles(root: string): string[] {
	const files: string[] = [];
	for (const name of readdirSync(root)) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) files.push(...listFiles(path));
		else files.push(path);
	}
	return files;
}

const release = sourceMapRelease();
runBun(["run", "build:web"]);
const webMaps = listFiles(join(repoRoot, "apps", "web", "dist")).filter((file) =>
	file.endsWith(".map"),
);
if (webMaps.length) throw new Error(`refusing to package web source maps: ${webMaps.join(", ")}`);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });
const sources = resolveRuntimeSources();
const target = runtimeTarget(process.platform, process.arch);
copyFileSync(sources.ptyLibraries[target], join(runtimeDir, ptyLibraryName(target)));
for (const helper of Object.values(sources.trashHelpers)) {
	copyFileSync(helper, join(runtimeDir, basename(helper)));
}
if (process.platform !== "win32") chmodSync(join(runtimeDir, "macos-trash"), 0o755);

try {
	writeFileSync(
		generatedEntry,
		`import { bootHost, reportDesktopError } from "@realthing/server";

export async function startDesktopHost(options) {
  const host = await bootHost({
    port: 0,
    host: "127.0.0.1",
    portMode: "exact",
    resolveShellEnv: true,
    staticDir: options.staticDir,
    appVersion: options.appVersion,
    analytics: {
      posthogApiKey: options.posthogProjectKey,
      channel: options.channel,
      build: "desktop",
      appRoot: options.runtimeDir + "/..",
      ...(options.openExternal ? { openExternal: options.openExternal } : {}),
    },
  });
  return { ...host, reportError: reportDesktopError };
}
`,
	);
	const runtimeFile = join(runtimeDir, "server-runtime.ts");
	runBun([
		"build",
		generatedEntry,
		"--target=bun",
		...(release ? ["--sourcemap=external"] : []),
		`--outdir=${runtimeDir}`,
		`--entry-naming=${basename(runtimeFile)}`,
	]);
	if (release) uploadRuntimeSourceMap(runtimeFile, release);
} finally {
	rmSync(generatedEntry, { force: true });
}
