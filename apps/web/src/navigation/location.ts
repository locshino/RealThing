export type NavigationLocation =
	| { kind: "main" }
	| { kind: "project"; projectId: string }
	| { kind: "workspace"; projectId: string; workspaceId: string };

export const MAIN_LOCATION: NavigationLocation = { kind: "main" };

function encodeSegment(id: string): string {
	return encodeURIComponent(id);
}

function decodeSegment(segment: string | undefined): string | null {
	if (!segment) return null;
	try {
		const decoded = decodeURIComponent(segment);
		return decoded === "" ? null : decoded;
	} catch {
		return null;
	}
}

export function serializeLocation(location: NavigationLocation): string {
	switch (location.kind) {
		case "main":
			return "#/v1";
		case "project":
			return `#/v1/projects/${encodeSegment(location.projectId)}`;
		case "workspace":
			return `#/v1/projects/${encodeSegment(location.projectId)}/workspaces/${encodeSegment(location.workspaceId)}`;
	}
}

export function parseFragment(fragment: string): NavigationLocation {
	const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
	if (raw === "" || raw === "/v1") return MAIN_LOCATION;
	const segments = raw.split("/");
	if (segments[0] !== "" || segments[1] !== "v1") return MAIN_LOCATION;
	if (segments[2] !== "projects") return MAIN_LOCATION;
	const projectId = decodeSegment(segments[3]);
	if (!projectId) return MAIN_LOCATION;
	if (segments.length === 4) return { kind: "project", projectId };
	if (segments[4] !== "workspaces" || segments.length !== 6) return MAIN_LOCATION;
	const workspaceId = decodeSegment(segments[5]);
	if (!workspaceId) return MAIN_LOCATION;
	return { kind: "workspace", projectId, workspaceId };
}
