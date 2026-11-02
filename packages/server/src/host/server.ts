import { createHash, randomUUID } from "node:crypto";
import { join, normalize } from "node:path";
import type {
	HostPlatform,
	ServerWelcome,
	TerminalTabsPush,
	WorkspaceFsChangedPayload,
} from "@realthing/contracts";
import {
	LOCALES_PROTOCOL_VERSION,
	PROTOCOL_VERSION,
	USER_THEMES_PROTOCOL_VERSION,
	WS_CHANNELS,
} from "@realthing/contracts";
import { errorCodeOf } from "@realthing/shared/codedError";
import { watchLocalLocales } from "../locales";
import { logger } from "../log";
import { loadWorkspaces } from "../persistence";
import {
	listProjects,
	listRecentProjects,
	openProject,
	refreshRecentProjectFolders,
	setProjectPublisher,
} from "../projects";
import { getConfig, setSettingsPublisher } from "../settings";
import {
	clearTerminalClient,
	closeAllTerminals,
	persistTerminalSessions,
	resumeClientTerminals,
	reviveTerminalSessions,
	setTerminalPublisher,
	setTerminalTabsPublisher,
} from "../terminal";
import { watchUserThemes } from "../themes";
import { setRepoMetaPublisher, setWatchPublisher, stopAllWatches } from "../watch";
import { refreshUserOwnedWorkspace, setWorkspacePublisher } from "../workspaces";
import { BLOB_PREFIX, FILES_PREFIX, serveBlob, serveWorktreeFile } from "./fileRoutes";
import { handleRequest, requestMethodDiagnostic, setFsNudgePublisher } from "./handlers";
import { provisionInitialTerminal } from "./initialTerminal";
import { RequestReplayCache } from "./requestReplayCache";
import {
	BACKPRESSURE_RECONCILE_MS,
	drainedClientKeys,
	terminalDeliveryForSendStatus,
} from "./terminalSend";

export interface CreateServerOptions {
	port?: number;
	host?: string;
	staticDir?: string;
	projectPath?: string;
	appVersion?: string;
}

export interface RunningServer {
	readonly port: number;
	startAttributionClaim: () => void;
	stop: () => void;
	shutdown: () => Promise<void>;
}

interface SocketData {
	clientKey: string;
	protocolVersion: number;
}

const CLIENT_REPLAY_RETENTION_MS = 60_000;
const RECENT_FOLDER_CHECK_BUDGET_MS = 250;

const log = logger("host");

const isRequestId = (id: unknown): id is string => typeof id === "string";

function clientProtocolVersion(value: string | null): number {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function createServer(options: CreateServerOptions = {}): Promise<RunningServer> {
	getConfig();
	const { port = 24242, host = "localhost", staticDir, projectPath, appVersion } = options;

	const sockets = new Map<string, Bun.ServerWebSocket<SocketData>>();
	const reapTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const requestReplays = new RequestReplayCache<string>();
	const terminalBackpressured = new Set<string>();
	let stopping = false;
	let shutdownPromise: Promise<void> | undefined;

	const armClientReap = (clientKey: string): void => {
		reapTimers.set(
			clientKey,
			setTimeout(() => {
				reapTimers.delete(clientKey);
				if (sockets.has(clientKey)) return;
				if (!requestReplays.clearClient(clientKey)) {
					armClientReap(clientKey);
					return;
				}
				clearTerminalClient(clientKey);
			}, CLIENT_REPLAY_RETENTION_MS),
		);
	};

	const server = Bun.serve<SocketData, never>({
		port,
		hostname: host,
		async fetch(req, srv) {
			const url = new URL(req.url);
			if (url.pathname === "/ws") {
				const clientKey = url.searchParams.get("client") ?? `anon-${randomUUID()}`;
				const protocolVersion = clientProtocolVersion(url.searchParams.get("protocol"));
				await refreshRecentProjectFolders(RECENT_FOLDER_CHECK_BUDGET_MS);
				return srv.upgrade(req, { data: { clientKey, protocolVersion } })
					? undefined
					: new Response("ws upgrade failed", { status: 400 });
			}
			if (url.pathname === "/health") {
				return new Response("ok");
			}
			if (url.pathname.startsWith(FILES_PREFIX)) {
				return serveWorktreeFile(url.pathname);
			}
			if (url.pathname.startsWith(BLOB_PREFIX)) {
				return serveBlob(url.pathname, req.signal);
			}
			if (staticDir) {
				return serveStatic(url.pathname, staticDir);
			}
			return new Response("not found", { status: 404 });
		},
		websocket: {
			open(ws) {
				const replaced = sockets.get(ws.data.clientKey);
				sockets.set(ws.data.clientKey, ws);
				if (replaced && replaced !== ws) replaced.close();
				terminalBackpressured.delete(ws.data.clientKey);
				const pendingReap = reapTimers.get(ws.data.clientKey);
				if (pendingReap !== undefined) {
					clearTimeout(pendingReap);
					reapTimers.delete(ws.data.clientKey);
				}
				ws.subscribe(WS_CHANNELS.projectUpdated);
				ws.subscribe(WS_CHANNELS.terminalTabs);
				ws.subscribe(WS_CHANNELS.workspaceCreated);
				ws.subscribe(WS_CHANNELS.workspaceUpdated);
				ws.subscribe(WS_CHANNELS.workspaceRemoved);
				ws.subscribe(WS_CHANNELS.workspaceFsChanged);
				ws.subscribe(WS_CHANNELS.settingsChanged);
				if (ws.data.protocolVersion >= LOCALES_PROTOCOL_VERSION)
					ws.subscribe(WS_CHANNELS.localesChanged);
				if (ws.data.protocolVersion >= USER_THEMES_PROTOCOL_VERSION)
					ws.subscribe(WS_CHANNELS.themesChanged);
				const hostPlatform: HostPlatform =
					process.platform === "darwin" || process.platform === "win32"
						? process.platform
						: "linux";
				const welcome: ServerWelcome = {
					protocolVersion: PROTOCOL_VERSION,
					hostPlatform,
					projects: listProjects(),
					recentProjects: listRecentProjects(),
					config: getConfig(),
					...(appVersion ? { appVersion } : {}),
				};
				const welcomeStatus = ws.send(
					JSON.stringify({ channel: WS_CHANNELS.serverWelcome, data: welcome }),
				);
				const welcomeDelivery = terminalDeliveryForSendStatus(welcomeStatus);
				if (welcomeDelivery === "unavailable") {
					ws.close();
					return;
				}
				if (welcomeDelivery === "backpressured") {
					terminalBackpressured.add(ws.data.clientKey);
				}
				resumeClientTerminals(ws.data.clientKey);
			},
			async message(ws, message) {
				const raw = typeof message === "string" ? message : message.toString();
				let req: unknown;
				try {
					req = JSON.parse(raw);
				} catch {
					return;
				}
				if (typeof req !== "object" || req === null) return;
				if ("ack" in req && Array.isArray(req.ack)) {
					requestReplays.acknowledge(ws.data.clientKey, req.ack.filter(isRequestId));
					return;
				}
				if ("resume" in req && Array.isArray(req.resume)) {
					requestReplays.retain(ws.data.clientKey, req.resume.filter(isRequestId));
					return;
				}
				if (
					!("id" in req) ||
					typeof req.id !== "string" ||
					!("method" in req) ||
					typeof req.method !== "string"
				) {
					return;
				}
				const requestId = req.id;
				const method = req.method;
				const methodDiagnostic = requestMethodDiagnostic(method);
				const params = "params" in req ? req.params : undefined;
				const fingerprint = createHash("sha256")
					.update(JSON.stringify([method, params]))
					.digest("hex");
				log.debug(`ws ${methodDiagnostic}`);
				try {
					const response = await requestReplays.run(
						ws.data.clientKey,
						requestId,
						fingerprint,
						async () => {
							try {
								const result = await handleRequest(method, params, {
									clientKey: ws.data.clientKey,
									protocolVersion: ws.data.protocolVersion,
								});
								return JSON.stringify({ id: requestId, ok: true, result });
							} catch (err) {
								const error = err instanceof Error ? err.message : String(err);
								log.debug(`ws ${methodDiagnostic} failed`);
								const code = errorCodeOf(err);
								return JSON.stringify({
									id: requestId,
									ok: false,
									error,
									...(code ? { errorCode: code } : {}),
								});
							}
						},
					);
					if (ws.send(response) === 0) ws.close();
				} catch (err) {
					const error = err instanceof Error ? err.message : String(err);
					if (ws.send(JSON.stringify({ id: requestId, ok: false, error })) === 0) ws.close();
				}
			},
			drain(ws) {
				if (sockets.get(ws.data.clientKey) !== ws) return;
				terminalBackpressured.delete(ws.data.clientKey);
				resumeClientTerminals(ws.data.clientKey);
			},
			close(ws) {
				const { clientKey } = ws.data;
				if (stopping) return;
				if (sockets.get(clientKey) === ws) {
					sockets.delete(clientKey);
					terminalBackpressured.delete(clientKey);
				}
				if (sockets.has(clientKey) || reapTimers.has(clientKey)) return;
				armClientReap(clientKey);
			},
		},
	});

	const backpressureReconciler = setInterval(() => {
		const drained = drainedClientKeys(terminalBackpressured, (clientKey) =>
			sockets.get(clientKey)?.getBufferedAmount(),
		);
		for (const clientKey of drained) {
			log.warn(
				`terminal backpressure latch lifted by reconciler, drain never arrived (${clientKey})`,
			);
			terminalBackpressured.delete(clientKey);
			resumeClientTerminals(clientKey);
		}
	}, BACKPRESSURE_RECONCILE_MS);

	setTerminalPublisher((clientKey, channel, data) => {
		if (terminalBackpressured.has(clientKey)) return "unavailable";
		const ws = sockets.get(clientKey);
		if (!ws) return "unavailable";
		try {
			const delivery = terminalDeliveryForSendStatus(ws.send(JSON.stringify({ channel, data })));
			if (delivery !== "delivered") terminalBackpressured.add(clientKey);
			return delivery;
		} catch {
			terminalBackpressured.add(clientKey);
			ws.close();
			return "unavailable";
		}
	});

	setProjectPublisher((project) => {
		server.publish(
			WS_CHANNELS.projectUpdated,
			JSON.stringify({ channel: WS_CHANNELS.projectUpdated, data: project }),
		);
	});

	setTerminalTabsPublisher((workspaceId, tabs) => {
		const data: TerminalTabsPush = { workspaceId, tabs };
		server.publish(
			WS_CHANNELS.terminalTabs,
			JSON.stringify({ channel: WS_CHANNELS.terminalTabs, data }),
		);
	});

	setWorkspacePublisher((event) => {
		const channel =
			event.kind === "created"
				? WS_CHANNELS.workspaceCreated
				: event.kind === "updated"
					? WS_CHANNELS.workspaceUpdated
					: WS_CHANNELS.workspaceRemoved;
		const data =
			event.kind === "removed" ? { projectId: event.projectId, id: event.id } : event.workspace;
		server.publish(channel, JSON.stringify({ channel, data }));
	});

	const publishFsChanged = (payload: WorkspaceFsChangedPayload) => {
		server.publish(
			WS_CHANNELS.workspaceFsChanged,
			JSON.stringify({ channel: WS_CHANNELS.workspaceFsChanged, data: payload }),
		);
	};
	const stopLocalesWatch = watchLocalLocales({
		onChange: () =>
			server.publish(
				WS_CHANNELS.localesChanged,
				JSON.stringify({ channel: WS_CHANNELS.localesChanged, data: {} }),
			),
	});
	const stopThemesWatch = watchUserThemes({
		onChange: () =>
			server.publish(
				WS_CHANNELS.themesChanged,
				JSON.stringify({ channel: WS_CHANNELS.themesChanged, data: {} }),
			),
	});
	setWatchPublisher(publishFsChanged);
	setFsNudgePublisher(publishFsChanged);

	setRepoMetaPublisher((workspaceId) => {
		refreshUserOwnedWorkspace(workspaceId);
		publishFsChanged({ workspaceId, paths: [], truncated: false });
	});

	setSettingsPublisher((config) => {
		server.publish(
			WS_CHANNELS.settingsChanged,
			JSON.stringify({ channel: WS_CHANNELS.settingsChanged, data: config }),
		);
	});

	reviveTerminalSessions();
	for (const workspace of loadWorkspaces()) provisionInitialTerminal(workspace);

	if (projectPath) {
		try {
			openProject(projectPath);
		} catch {
			log.warn("could not open requested project");
		}
	}

	const stop = (): void => {
		if (stopping) return;
		stopping = true;
		stopAllWatches();
		stopLocalesWatch();
		stopThemesWatch();
		for (const timer of reapTimers.values()) clearTimeout(timer);
		reapTimers.clear();
		sockets.clear();
		clearInterval(backpressureReconciler);
		terminalBackpressured.clear();
		requestReplays.clear();
		persistTerminalSessions();
		closeAllTerminals();
		setSettingsPublisher(null);
		setFsNudgePublisher(null);
		server.stop(true);
	};
	const shutdown = (): Promise<void> => {
		shutdownPromise ??= (async () => {
			stop();
		})();
		return shutdownPromise;
	};

	return {
		get port() {
			return server.port ?? port;
		},
		startAttributionClaim: () => {},
		stop,
		shutdown,
	};
}

async function serveStatic(pathname: string, staticDir: string): Promise<Response> {
	const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
	const requested = safe === "/" || safe === "" ? "index.html" : safe;
	const file = Bun.file(join(staticDir, requested));
	if (await file.exists()) return new Response(file);
	const index = Bun.file(join(staticDir, "index.html"));
	if (await index.exists()) return new Response(index);
	return new Response("not found", { status: 404 });
}
