import { useCallback, useEffect, useRef } from "react";
import { fsChangedPaths, selectWorkspaceTick, useAppStore } from "../store";
import { whenFilesTreeReady } from "./editorWarm";

interface WorkspaceReadHandlers<T> {
	onResult: (value: T, workspaceId: string) => void;
	onFailure?: (workspaceId: string, error: unknown) => void;
	onSwitch?: (workspaceId: string) => void;
	shouldReload?: (changedPaths: readonly string[]) => boolean;
	deferAfterTreeMs?: number;
}

export function useWorkspaceRead<T>(
	workspaceId: string | null,
	read: (workspaceId: string, readKey: string | undefined) => Promise<T>,
	handlers: WorkspaceReadHandlers<T>,
	readKey?: string,
): { reload: () => void } {
	const latest = useRef({ read, handlers, workspaceId, readKey });
	latest.current = { read, handlers, workspaceId, readKey };
	const generation = useRef(0);

	const runRead = useCallback((id: string, key: string | undefined) => {
		if (useAppStore.getState().removedWorkspaceIds[id]) return;
		const mine = ++generation.current;
		const live = () =>
			generation.current === mine &&
			latest.current.workspaceId === id &&
			latest.current.readKey === key &&
			!useAppStore.getState().removedWorkspaceIds[id];
		latest.current
			.read(id, key)
			.then((value) => {
				if (live()) latest.current.handlers.onResult(value, id);
			})
			.catch((error: unknown) => {
				if (live()) latest.current.handlers.onFailure?.(id, error);
			});
	}, []);

	useEffect(() => {
		if (!workspaceId) return;
		const deferMs = latest.current.handlers.deferAfterTreeMs;
		let cancelInitial: (() => void) | undefined;
		if (deferMs !== undefined && deferMs > 0) {
			cancelInitial = whenFilesTreeReady(() => runRead(workspaceId, readKey), deferMs);
		} else {
			runRead(workspaceId, readKey);
		}
		let tick = selectWorkspaceTick(useAppStore.getState(), workspaceId);
		const unsubscribe = useAppStore.subscribe((state) => {
			const next = selectWorkspaceTick(state, workspaceId);
			if (next === tick) return;
			const sequential = next === tick + 1;
			tick = next;
			const filter = latest.current.handlers.shouldReload;
			const change = state.fsChangesByWorkspace[workspaceId];
			if (sequential && filter && change) {
				const paths = fsChangedPaths(change);
				if (paths !== null && !filter(paths)) return;
			}
			cancelInitial?.();
			cancelInitial = undefined;
			runRead(workspaceId, readKey);
		});
		return () => {
			cancelInitial?.();
			unsubscribe();
			generation.current += 1;
			latest.current.handlers.onSwitch?.(workspaceId);
		};
	}, [workspaceId, readKey, runRead]);

	const reload = useCallback(() => {
		if (workspaceId) runRead(workspaceId, readKey);
	}, [readKey, runRead, workspaceId]);
	return { reload };
}
