import type { Workspace } from "@realthing/contracts";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useAppStore } from "../store";
import { type ConnectionStatus, getTransport } from "../transport";
import {
	type BranchFacts,
	type BranchStatusStateStore,
	branchStatusState,
} from "./branchStatusState";

type BranchStatusRequestParams = { workspaceId: string; allowCached?: true; skipFetch?: true };

type BranchStatusRequest = (params: BranchStatusRequestParams) => Promise<BranchFacts | null>;

export interface BranchStatusHookState {
	status: BranchFacts | null;
	refreshBranchStatus: () => void;
}

function requestBranchStatus(options: {
	workspaceId: string;
	key: string;
	allowCached: boolean;
	skipFetch?: boolean;
	request: BranchStatusRequest;
	state: BranchStatusStateStore;
}): void {
	const generation = options.state.beginRequest(options.key);
	void options
		.request({
			workspaceId: options.workspaceId,
			...(options.allowCached ? { allowCached: true as const } : {}),
			...(options.skipFetch ? { skipFetch: true as const } : {}),
		})
		.then(
			(status) => {
				options.state.resolveRequest(options.key, generation, status);
			},
			() => {
				options.state.resolveRequest(options.key, generation, null);
			},
		);
}

export function startBranchStatusSync(options: {
	workspaceId: string;
	key: string;
	request: BranchStatusRequest;
	state: BranchStatusStateStore;
	focusTarget: EventTarget;
	connected: boolean;
}): {
	setConnected: (connected: boolean) => void;
	refresh: () => void;
	reload: () => void;
	stop: () => void;
} {
	let connected = options.connected;
	let freshOnReconnect = false;
	const load = (allowCached: boolean, skipFetch = false) =>
		requestBranchStatus({
			workspaceId: options.workspaceId,
			key: options.key,
			allowCached,
			skipFetch,
			request: options.request,
			state: options.state,
		});
	const refresh = () => {
		if (connected) load(false);
		else freshOnReconnect = true;
	};
	const reload = () => {
		if (connected) load(true);
	};
	const setConnected = (next: boolean) => {
		if (connected === next) return;
		connected = next;
		if (!connected) return;
		load(!freshOnReconnect);
		freshOnReconnect = false;
	};
	const stop = () => options.focusTarget.removeEventListener("focus", refresh);

	if (connected) load(true);
	options.focusTarget.addEventListener("focus", refresh);
	return { setConnected, refresh, reload, stop };
}

export function supportsBranchStatus(protocolVersion: number | null): boolean {
	return protocolVersion !== null;
}

const transportRequest: BranchStatusRequest = async (params) => {
	if (supportsBranchStatus(useAppStore.getState().protocolVersion)) {
		return await getTransport().request("workspace.branchStatus", params);
	}
	return null;
};

type BranchStatusSync = ReturnType<typeof startBranchStatusSync>;

export function useBranchStatus(
	workspace: Workspace | null,
	status: ConnectionStatus,
): BranchStatusHookState {
	const workspaceId = workspace?.id ?? null;
	const key = workspace ? `${workspace.id}\0${workspace.branch}` : null;
	const currentKey = useRef(key);
	const connected = useAppStore((s) => status === "connected" && s.protocolVersion !== null);
	const connectedRef = useRef(connected);
	const sync = useRef<BranchStatusSync | null>(null);
	currentKey.current = key;
	connectedRef.current = connected;
	const subscribe = useCallback(
		(listener: () => void) => (key ? branchStatusState.subscribe(key, listener) : () => {}),
		[key],
	);
	const getSnapshot = useCallback(() => (key ? branchStatusState.getSnapshot(key) : null), [key]);
	const loaded = useSyncExternalStore(subscribe, getSnapshot, () => null);

	useEffect(() => {
		if (!workspaceId || !key) {
			sync.current = null;
			return;
		}
		const controller = startBranchStatusSync({
			workspaceId,
			key,
			request: transportRequest,
			state: branchStatusState,
			focusTarget: window,
			connected: connectedRef.current,
		});
		sync.current = controller;
		return () => {
			controller.stop();
			if (sync.current === controller) sync.current = null;
		};
	}, [key, workspaceId]);

	useEffect(() => {
		sync.current?.setConnected(connected);
	}, [connected]);

	const fsTick = useAppStore((s) =>
		workspaceId ? (s.fsChangesByWorkspace[workspaceId]?.tick ?? 0) : 0,
	);
	const lastFsTick = useRef<{ key: string | null; tick: number }>({ key: null, tick: 0 });
	useEffect(() => {
		if (!workspaceId || !key) return;
		if (lastFsTick.current.key !== key) {
			lastFsTick.current = { key, tick: fsTick };
			return;
		}
		if (fsTick === lastFsTick.current.tick) return;
		lastFsTick.current = { key, tick: fsTick };
		sync.current?.reload();
	}, [fsTick, key, workspaceId]);

	const refreshBranchStatus = useCallback(() => {
		if (!key || currentKey.current !== key) return;
		sync.current?.refresh();
	}, [key]);

	const current = connected ? loaded : null;
	return {
		status: current?.status ?? null,
		refreshBranchStatus,
	};
}
