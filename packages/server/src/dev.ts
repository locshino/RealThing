import { bootHost } from "./host";

const host = process.env.REALTHING_HOST ?? "localhost";
const staticDir = process.env.REALTHING_STATIC_DIR;
const envPort = process.env.REALTHING_PORT;

const { port } = await bootHost({
	port: envPort ? Number(envPort) : 24242,
	host,
	portMode: envPort ? "exact" : "free",
	resolveShellEnv: true,
	...(staticDir ? { staticDir } : {}),
});
console.log(`realthing host: http://${host}:${port}`);
