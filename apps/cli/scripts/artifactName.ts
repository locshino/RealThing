export function targetsWindows(target?: string): boolean {
	return target ? target.includes("windows") : process.platform === "win32";
}

export function binaryArtifactName(target?: string): string {
	const base = target ? `realthing-${target.replace(/^bun-/, "")}` : "realthing";
	return targetsWindows(target) ? `${base}.exe` : base;
}
