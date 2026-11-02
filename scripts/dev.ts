#!/usr/bin/env bun

import { findFreePort } from "@realthing/shared/freePort";
import { printStartupMark } from "@realthing/shared/startupMark";

const host = process.env.REALTHING_HOST ?? "localhost";
const preferred = Number(process.env.REALTHING_PORT ?? 24242);
const port = await findFreePort(preferred, host);
if (port !== preferred) {
	console.log(`realthing dev: host port ${preferred} is in use → using ${port}`);
}
const webPort = await findFreePort(24269, host);

const openHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
const webUrl = `http://${openHost}:${webPort}/`;
printStartupMark({ status: "starting", endpoint: webUrl });

const turbo = Bun.spawn(
	["bunx", "turbo", "run", "dev", "--filter=@realthing/web", "--filter=@realthing/server"],
	{
		env: {
			...process.env,
			REALTHING_PORT: String(port),
			REALTHING_WEB_PORT: String(webPort),
		},
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	},
);

const stop = (): void => {
	turbo.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

void openWhenReady(webUrl);

process.exit(await turbo.exited);

async function openWhenReady(url: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			await fetch(url);
			openBrowser(url);
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
}

function openBrowser(url: string): void {
	const command =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", url]
				: ["xdg-open", url];
	try {
		Bun.spawn(command, { stdout: "ignore", stderr: "ignore" }).unref();
	} catch {}
}
