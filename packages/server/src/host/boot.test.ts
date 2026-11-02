import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerWelcome } from "@realthing/contracts";
import { PROTOCOL_VERSION, WS_CHANNELS } from "@realthing/contracts";
import { isPortFree } from "@realthing/shared/freePort";
import { resetConfigCache } from "../settings";
import { type BootedHost, bootHost } from "./boot";

process.setMaxListeners(50);

const booted: BootedHost[] = [];
const tmpDirs: string[] = [];
const originalDataDir = process.env.REALTHING_DATA_DIR;

interface SocketFrame {
	channel?: string;
	data?: unknown;
	id?: string;
	ok?: boolean;
}

interface SocketCollector {
	socket: WebSocket;
	frames: SocketFrame[];
	waitForFrame(matches: (frame: SocketFrame) => boolean): Promise<SocketFrame>;
}

async function collectSocket(port: number, client: string): Promise<SocketCollector> {
	const socket = new WebSocket(
		`ws://localhost:${port}/ws?client=${client}&protocol=${PROTOCOL_VERSION}`,
	);
	const frames: SocketFrame[] = [];
	const waiters = new Set<{
		matches: (frame: SocketFrame) => boolean;
		resolve(frame: SocketFrame): void;
	}>();
	socket.addEventListener("message", (event) => {
		const frame = JSON.parse(String(event.data)) as SocketFrame;
		frames.push(frame);
		for (const waiter of waiters) {
			if (!waiter.matches(frame)) continue;
			waiters.delete(waiter);
			waiter.resolve(frame);
		}
	});
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("websocket failed to open")), {
			once: true,
		});
	});
	return {
		socket,
		frames,
		waitForFrame: (matches) => {
			const frame = frames.find(matches);
			if (frame) return Promise.resolve(frame);
			return new Promise<SocketFrame>((resolve) => waiters.add({ matches, resolve }));
		},
	};
}

beforeEach(async () => {
	resetConfigCache();
	const dir = mkdtempSync(join(tmpdir(), "realthing-boot-data-"));
	tmpDirs.push(dir);
	process.env.REALTHING_DATA_DIR = dir;
});

afterEach(async () => {
	while (booted.length) await booted.pop()?.server.shutdown();
	resetConfigCache();
	while (tmpDirs.length) rmSync(tmpDirs.pop() as string, { recursive: true, force: true });
	if (originalDataDir === undefined) delete process.env.REALTHING_DATA_DIR;
	else process.env.REALTHING_DATA_DIR = originalDataDir;
});

function grabFreePort(): number {
	const probe = Bun.serve({ port: 0, hostname: "localhost", fetch: () => new Response("x") });
	const port = probe.port;
	if (port == null) throw new Error("probe failed to bind");
	probe.stop(true);
	return port;
}

async function boot(options: Parameters<typeof bootHost>[0]): Promise<BootedHost> {
	const b = await bootHost(options);
	booted.push(b);
	return b;
}

test('portMode "exact" binds the requested port', async () => {
	const requested = grabFreePort();
	const b = await boot({ port: requested, host: "localhost", portMode: "exact" });

	expect(b.requested).toBe(requested);
	expect(b.port).toBe(requested);
	expect(b.server.port).toBe(requested);
	const res = await fetch(`http://localhost:${b.port}/health`);
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("ok");
});

test('portMode "free" scans upward past a taken port', async () => {
	const holder = Bun.serve({ port: 0, hostname: "localhost", fetch: () => new Response("x") });
	const taken = holder.port as number;
	try {
		const b = await boot({ port: taken, host: "localhost", portMode: "free" });
		expect(b.requested).toBe(taken);
		expect(b.port).toBeGreaterThan(taken);
		const res = await fetch(`http://localhost:${b.port}/health`);
		expect(await res.text()).toBe("ok");
	} finally {
		holder.stop(true);
	}
});

test("serves the SPA from staticDir with index.html fallback", async () => {
	const dir = mkdtempSync(join(tmpdir(), "realthing-boot-"));
	tmpDirs.push(dir);
	writeFileSync(join(dir, "index.html"), "<!doctype html><title>spa</title>");

	const b = await boot({
		port: grabFreePort(),
		host: "localhost",
		portMode: "exact",
		staticDir: dir,
	});

	const root = await fetch(`http://localhost:${b.port}/`);
	expect(root.status).toBe(200);
	expect(root.headers.get("content-type") ?? "").toContain("text/html");
	expect(await root.text()).toContain("<title>spa</title>");

	const deep = await fetch(`http://localhost:${b.port}/some/client/route`);
	expect(deep.status).toBe(200);
	expect(await deep.text()).toContain("<title>spa</title>");
});

test("stop() releases the port", async () => {
	const b = await boot({ port: grabFreePort(), host: "localhost", portMode: "exact" });
	expect(await isPortFree(b.port)).toBe(false);
	b.server.stop();
	expect(await isPortFree(b.port)).toBe(true);
});

test("boot permits two hosts for the same data directory", async () => {
	const first = await boot({ port: grabFreePort(), host: "localhost", portMode: "exact" });
	const second = await boot({ port: grabFreePort(), host: "localhost", portMode: "exact" });

	expect(second.port).not.toBe(first.port);
	const responses = await Promise.all([
		fetch(`http://localhost:${first.port}/health`),
		fetch(`http://localhost:${second.port}/health`),
	]);
	expect(await Promise.all(responses.map((response) => response.text()))).toEqual(["ok", "ok"]);
});

test("welcome omits closed projects whose folders are gone", async () => {
	const dir = process.env.REALTHING_DATA_DIR;
	if (!dir) throw new Error("missing fixture data directory");
	writeFileSync(
		join(dir, "projects.json"),
		JSON.stringify([
			{ id: "open", name: "open", path: join(dir, "unplugged"), slug: "open", lastOpened: 3 },
			{
				id: "gone",
				name: "gone",
				path: join(dir, "gone"),
				slug: "gone",
				lastOpened: 2,
				closed: true,
			},
			{ id: "kept", name: "kept", path: dir, slug: "kept", lastOpened: 1, closed: true },
		]),
	);
	const b = await boot({ port: grabFreePort(), host: "localhost", portMode: "exact" });
	const collector = await collectSocket(b.port, "recents");
	const frame = await collector.waitForFrame(
		(candidate) => candidate.channel === WS_CHANNELS.serverWelcome,
	);

	const welcome = frame.data as ServerWelcome;
	expect(welcome.projects.map((project) => project.id)).toEqual(["open"]);
	expect(welcome.recentProjects?.map((project) => project.id)).toEqual(["open", "kept"]);
});

test("shutdown is idempotent and releases the port", async () => {
	const options = { port: grabFreePort(), host: "localhost", portMode: "exact" as const };
	const first = await boot(options);
	await Promise.all([first.server.shutdown(), first.server.shutdown()]);
	booted.splice(booted.indexOf(first), 1);
	const second = await boot(options);
	expect(second.port).toBe(options.port);
});

async function withFakeLoginShell(run: () => Promise<void>): Promise<void> {
	const saved = { ...process.env };
	const dir = mkdtempSync(join(tmpdir(), "realthing-boot-shell-"));
	tmpDirs.push(dir);
	const shell = join(dir, "login-shell");
	writeFileSync(
		shell,
		'#!/bin/sh\nfor last; do :; done\nBOOT_LOGIN_CANARY=imported exec /bin/sh -c "$last"\n',
	);
	chmodSync(shell, 0o755);
	process.env.SHELL = shell;
	delete process.env.TERM;
	delete process.env.BOOT_LOGIN_CANARY;
	delete (globalThis as Record<symbol, unknown>)[Symbol.for("realthing.shellEnv.pending")];
	try {
		await run();
	} finally {
		for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
		Object.assign(process.env, saved);
	}
}

test.skipIf(process.platform === "win32")(
	"boot leaves the process environment alone unless the launcher opts in to the login shell",
	async () => {
		await withFakeLoginShell(async () => {
			await boot({ port: 0, host: "127.0.0.1", portMode: "exact" });
			expect(process.env.BOOT_LOGIN_CANARY).toBeUndefined();
			await boot({ port: 0, host: "127.0.0.1", portMode: "exact", resolveShellEnv: true });
			expect(process.env.BOOT_LOGIN_CANARY).toBe("imported");
		});
	},
);
