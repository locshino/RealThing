import { describeResource, PENDING_TEXT_META } from "@realthing/resource-renderers";
import { useEffect } from "react";
import { whenPageActive } from "../lib";
import { useEditorWarm, whenFilesTreeIdle } from "../panels/editorWarm";

const IDLE_TIMEOUT_MS = 250;
const FALLBACK_DELAY_MS = 80;

let preloaded = false;

export function useIdleEditorPreload(workspaceId: string): void {
	const warm = useEditorWarm();
	useEffect(() => {
		if (!warm || preloaded) return;
		return whenPageActive(
			(run) =>
				whenFilesTreeIdle(run, { timeout: IDLE_TIMEOUT_MS, fallbackDelay: FALLBACK_DELAY_MS }),
			() => {
				preloaded = true;
				warm(describeResource(workspaceId, "", PENDING_TEXT_META));
			},
		);
	}, [warm, workspaceId]);
}
