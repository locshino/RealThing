import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeTree } from "@realthing/shared/removeTree";
import { toolHomeEnv } from "@realthing/shared/toolHomes";
import { within } from "./lifecycle";

export interface ArtifactResources {
	readonly trashHelpers: {
		readonly macos: string;
		readonly windows: string;
	};
}

export interface RunningArtifactHost {
	readonly origin: string;
	readonly resources: ArtifactResources;
	stop(): Promise<void>;
}

export interface ArtifactHostAdapter {
	readonly name: string;
	launch(env: Record<string, string>, label: string): Promise<RunningArtifactHost>;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function connectRpc(baseUrl: string): Promise<WebSocket> {
	const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/ws`);
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), {
			once: true,
		});
	});
	return socket;
}

let requestSequence = 0;
function rpc(socket: WebSocket, method: string, params: unknown): Promise<unknown> {
	const id = `artifact_${++requestSequence}`;
	return new Promise((resolve, reject) => {
		const onMessage = (event: MessageEvent) => {
			if (typeof event.data !== "string") return;
			const frame = JSON.parse(event.data) as {
				id?: string;
				ok?: boolean;
				result?: unknown;
				error?: string;
			};
			if (frame.id !== id) return;
			socket.removeEventListener("message", onMessage);
			if (frame.ok) resolve(frame.result);
			else reject(new Error(frame.error ?? `${method} failed`));
		};
		socket.addEventListener("message", onMessage);
		socket.send(JSON.stringify({ id, method, params }));
	});
}

export function hostEnvironment(
	overrides: Record<string, string>,
	unset: string[] = [],
	env: Record<string, string | undefined> = process.env,
): Record<string, string> {
	const shadowed = new Set([...Object.keys(overrides), ...unset].map((name) => name.toLowerCase()));
	const inherited: Record<string, string> = {};
	for (const [name, value] of Object.entries(env)) {
		if (value !== undefined && !shadowed.has(name.toLowerCase())) inherited[name] = value;
	}
	return { ...inherited, ...overrides };
}

export async function runArtifactHostProbes(adapter: ArtifactHostAdapter): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), `realthing-${adapter.name}-artifact-`));
	const homeDir = join(root, "home");
	const projectDir = join(root, "project");
	mkdirSync(homeDir, { recursive: true });
	mkdirSync(projectDir, { recursive: true });
	writeFileSync(join(projectDir, "README.md"), "# Smoke\n");
	assert(Bun.which("git"), "probe PATH does not contain git");

	for (const command of [
		["git", "-C", projectDir, "init", "-b", "main"],
		["git", "-C", projectDir, "add", "."],
		[
			"git",
			"-C",
			projectDir,
			"-c",
			"user.name=RealThing Smoke",
			"-c",
			"user.email=smoke@realthing.invalid",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--quiet",
			"-m",
			"seed artifact project",
		],
	]) {
		assert(Bun.spawnSync(command).success, `fixture command failed: ${command.join(" ")}`);
	}

	const baseEnv: Record<string, string> = {
		...toolHomeEnv(homeDir),
		REALTHING_NO_ANALYTICS: "1",
		CI: "1",
	};
	let host: RunningArtifactHost | undefined;
	let socket: WebSocket | undefined;
	try {
		const customEnv = hostEnvironment({
			...baseEnv,
			REALTHING_DATA_DIR: join(root, "data"),
			XDG_CACHE_HOME: join(root, "cache"),
		});
		host = await adapter.launch(customEnv, "host-probe");
		const health = await within(fetch(`${host.origin}/health`), 10_000, "GET /health");
		assert(health.ok && (await health.text()) === "ok", `/health answered ${health.status}`);
		const index = await within(fetch(host.origin), 10_000, "GET /");
		assert(index.ok && (await index.text()).includes("RealThing"), "web UI was not served");
		socket = await within(connectRpc(host.origin), 10_000, "host WebSocket");

		const project = (await within(
			rpc(socket, "project.open", { path: projectDir }),
			10_000,
			"project.open",
		)) as { id?: string };
		assert(project.id, "project.open returned no project id");
		const workspaces = (await within(
			rpc(socket, "workspace.list", { projectId: project.id }),
			10_000,
			"workspace.list",
		)) as { id?: string; kind?: string; worktreePath?: string }[];
		const workspace = workspaces.find((entry) => entry.kind === "default");
		assert(workspace?.id && workspace.worktreePath, "Default workspace is missing");

		for (const helper of Object.values(host.resources.trashHelpers)) {
			assert(existsSync(helper), `trash helper is missing: ${helper}`);
		}
		socket.close();
		socket = undefined;
		await host.stop();
		host = undefined;
	} finally {
		socket?.close();
		await host?.stop().catch(() => {});
		removeTree(root);
	}
}
