import type {
	AppConfig,
	Project,
	ServerWelcome,
	Workspace,
	WorkspaceFsChangedPayload,
	WorkspaceRemoved,
} from "@realthing/contracts";
import {
	CHANGE_MUTATIONS_PROTOCOL_VERSION,
	LOCALES_PROTOCOL_VERSION,
	USER_THEMES_PROTOCOL_VERSION,
	WS_CHANNELS,
} from "@realthing/contracts";
import { isConnectedGeneration, useAppStore } from "../store";
import { WsTransport } from "./transport";

let transport: WsTransport | null = null;

export function supportsUserThemes(protocolVersion: number | null): boolean {
	return protocolVersion !== null && protocolVersion >= USER_THEMES_PROTOCOL_VERSION;
}

export function supportsChangeMutations(protocolVersion: number | null): boolean {
	return protocolVersion !== null && protocolVersion >= CHANGE_MUTATIONS_PROTOCOL_VERSION;
}

function refreshLocalLocales(connectionGeneration: number): void {
	const store = useAppStore.getState();
	if (store.protocolVersion === null || store.protocolVersion < LOCALES_PROTOCOL_VERSION) {
		store.installLocalLocales(null);
		return;
	}
	void getTransport()
		.request("locales.list", {})
		.then((snapshot) => {
			const current = useAppStore.getState();
			if (isConnectedGeneration(current, connectionGeneration))
				current.installLocalLocales(snapshot);
		})
		.catch(() => {});
}

function refreshUserThemes(connectionGeneration: number): void {
	const store = useAppStore.getState();
	if (!supportsUserThemes(store.protocolVersion)) {
		store.installUserThemes(null);
		return;
	}
	void getTransport()
		.request("themes.list", {})
		.then((snapshot) => {
			const current = useAppStore.getState();
			if (isConnectedGeneration(current, connectionGeneration)) current.installUserThemes(snapshot);
		})
		.catch(() => {});
}

function refreshLoadedWorkspaceLists(connectionGeneration: number): void {
	const snapshot = useAppStore.getState();
	const openProjectIds = new Set(snapshot.projects.map((project) => project.id));
	for (const projectId of Object.keys(snapshot.workspaces)) {
		if (!openProjectIds.has(projectId)) continue;
		void getTransport()
			.request("workspace.list", { projectId, includeDiffStats: false })
			.then((workspaces) => {
				const current = useAppStore.getState();
				if (!isConnectedGeneration(current, connectionGeneration)) return;
				if (!current.projects.some((project) => project.id === projectId)) return;
				for (const workspace of workspaces) current.updateWorkspace(workspace);
			})
			.catch(() => {});
	}
}

export function initTransport(): WsTransport {
	if (transport) return transport;

	transport = new WsTransport({
		onStatus: (status) => {
			useAppStore.getState().setStatus(status);
		},
	});

	transport.subscribe(WS_CHANNELS.serverWelcome, (data) => {
		const welcome = data as Partial<ServerWelcome>;
		if (typeof welcome.protocolVersion !== "number" || !Array.isArray(welcome.projects)) return;
		useAppStore
			.getState()
			.installWelcomeSnapshot(
				welcome.protocolVersion,
				welcome.projects,
				Array.isArray(welcome.recentProjects) ? welcome.recentProjects : welcome.projects,
				welcome.config,
				welcome.hostPlatform === "darwin" ||
					welcome.hostPlatform === "linux" ||
					welcome.hostPlatform === "win32"
					? welcome.hostPlatform
					: undefined,
				typeof welcome.appVersion === "string" ? welcome.appVersion : undefined,
			);
		const connectionGeneration = useAppStore.getState().connectionGeneration;
		refreshLoadedWorkspaceLists(connectionGeneration);
		refreshLocalLocales(connectionGeneration);
		refreshUserThemes(connectionGeneration);
	});

	transport.subscribe(WS_CHANNELS.projectUpdated, (data) => {
		useAppStore.getState().applyProjectUpdated(data as Project);
	});

	transport.subscribe(WS_CHANNELS.localesChanged, () => {
		refreshLocalLocales(useAppStore.getState().connectionGeneration);
	});

	transport.subscribe(WS_CHANNELS.themesChanged, () => {
		refreshUserThemes(useAppStore.getState().connectionGeneration);
	});

	transport.subscribe(WS_CHANNELS.workspaceCreated, (data) => {
		useAppStore.getState().addWorkspace(data as Workspace);
	});

	transport.subscribe(WS_CHANNELS.workspaceUpdated, (data) => {
		useAppStore.getState().updateWorkspace(data as Workspace);
	});

	transport.subscribe(WS_CHANNELS.workspaceRemoved, (data) => {
		const { projectId, id } = data as WorkspaceRemoved;
		useAppStore.getState().applyWorkspaceRemoved(projectId, id);
	});

	transport.subscribe(WS_CHANNELS.workspaceFsChanged, (data) => {
		useAppStore.getState().noteFsChanged(data as WorkspaceFsChangedPayload);
	});

	transport.subscribe(WS_CHANNELS.settingsChanged, (data) => {
		useAppStore.getState().applyConfig(data as AppConfig);
	});

	transport.connect();
	return transport;
}

export function getTransport(): WsTransport {
	if (!transport) throw new Error("transport not initialized — call initTransport() first");
	return transport;
}
