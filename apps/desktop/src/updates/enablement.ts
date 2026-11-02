const ARTIFACT_TEST_ENVIRONMENT_KEYS = [
	"REALTHING_DESKTOP_READY_FILE",
	"REALTHING_DESKTOP_CONTROL_FILE",
	"REALTHING_DESKTOP_USER_DATA",
	"REALTHING_DESKTOP_E2E_HOST",
	"REALTHING_DESKTOP_HIDDEN",
	"REALTHING_DESKTOP_NAVIGATION_PROBE_FILE",
] as const;

interface NativeUpdateEnablement {
	isPackaged: boolean;
	channel: string;
	baseUrl: string;
	platform: NodeJS.Platform;
	arch: string;
	artifactTestSeam: boolean;
}

export function hasDesktopArtifactTestSeam(
	environment: Readonly<Record<string, string | undefined>>,
): boolean {
	return ARTIFACT_TEST_ENVIRONMENT_KEYS.some((key) => Boolean(environment[key]));
}

export function nativeUpdatesEnabled(input: NativeUpdateEnablement): boolean {
	if (!input.isPackaged || input.artifactTestSeam) return false;
	if (input.channel !== "stable" && input.channel !== "canary") return false;
	try {
		if (new URL(input.baseUrl).protocol !== "https:") return false;
	} catch {
		return false;
	}
	return ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"].includes(
		`${input.platform}-${input.arch}`,
	);
}
