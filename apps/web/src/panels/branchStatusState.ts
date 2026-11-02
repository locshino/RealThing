import type { WsResult } from "@realthing/contracts";

export type BranchFacts = WsResult<"workspace.branchStatus">;

export type BranchStatusSnapshot = {
	status: BranchFacts | null;
};

type Entry = {
	generation: number;
	snapshot: BranchStatusSnapshot | null;
};

type Listener = () => void;

export function createBranchStatusState() {
	const entries = new Map<string, Entry>();
	const listeners = new Map<string, Set<Listener>>();
	const entry = (key: string): Entry => {
		const existing = entries.get(key);
		if (existing) return existing;
		const created = { generation: 0, snapshot: null };
		entries.set(key, created);
		return created;
	};
	const publish = (key: string, snapshot: BranchStatusSnapshot): void => {
		entry(key).snapshot = snapshot;
		for (const listener of listeners.get(key) ?? []) listener();
	};

	return {
		getSnapshot(key: string): BranchStatusSnapshot | null {
			return entries.get(key)?.snapshot ?? null;
		},
		subscribe(key: string, listener: Listener): () => void {
			const current = listeners.get(key) ?? new Set<Listener>();
			current.add(listener);
			listeners.set(key, current);
			return () => {
				current.delete(listener);
				if (current.size === 0) listeners.delete(key);
			};
		},
		beginRequest(key: string): number {
			const current = entry(key);
			current.generation += 1;
			return current.generation;
		},
		resolveRequest(key: string, generation: number, status: BranchFacts | null): boolean {
			const current = entry(key);
			if (current.generation !== generation) return false;
			publish(key, { status });
			return true;
		},
	};
}

export type BranchStatusStateStore = ReturnType<typeof createBranchStatusState>;

export const branchStatusState = createBranchStatusState();
