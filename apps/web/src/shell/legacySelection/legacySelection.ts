import { useEffect } from "react";
import {
	selectAttentionCenterResourceCacheKey,
	selectAttentionCenterTab,
	useAppStore,
} from "../../store";
import type { LayoutCenterTab } from "../layout";

function syncLegacySelectedResource(
	workspaceId: string,
	tab: LayoutCenterTab | null,
	cacheKey: string | null,
): void {
	const state = useAppStore.getState();
	if (!tab) {
		state.syncLegacySelection(workspaceId, null);
		return;
	}
	if (tab.kind === "terminal") {
		state.syncLegacySelection(
			workspaceId,
			cacheKey === tab.tabKey ? { kind: "terminal", tabKey: tab.tabKey } : null,
		);
		return;
	}
	const cache = cacheKey
		? state.tabsByWorkspace[workspaceId]?.find((candidate) => candidate.id === cacheKey)
		: undefined;
	state.syncLegacySelection(workspaceId, cache ? { kind: "editor", tabId: cache.id } : null);
}

export function syncLegacySelectionFromAttention(workspaceId: string): void {
	const state = useAppStore.getState();
	syncLegacySelectedResource(
		workspaceId,
		selectAttentionCenterTab(state, workspaceId),
		selectAttentionCenterResourceCacheKey(state, workspaceId),
	);
}

export function useLegacySelectionAdapter(workspaceId: string): void {
	const selectedCenterTab = useAppStore((state) => selectAttentionCenterTab(state, workspaceId));
	const selectedCenterResourceCacheKey = useAppStore((state) =>
		selectAttentionCenterResourceCacheKey(state, workspaceId),
	);

	useEffect(() => {
		syncLegacySelectedResource(workspaceId, selectedCenterTab, selectedCenterResourceCacheKey);
	}, [selectedCenterResourceCacheKey, selectedCenterTab, workspaceId]);
}
