export interface CoalescerOptions {
	quietMs: number;
	maxWaitMs: number;
	maxPaths: number;
	onFlush: (batch: { paths: string[]; truncated: boolean }) => void;
}

export interface Coalescer {
	add(path: string | null): void;
	dispose(): void;
}

export function createCoalescer(options: CoalescerOptions): Coalescer {
	const { quietMs, maxWaitMs, maxPaths, onFlush } = options;
	let pending = new Set<string>();
	let truncated = false;
	let quietTimer: ReturnType<typeof setTimeout> | null = null;
	let maxTimer: ReturnType<typeof setTimeout> | null = null;

	const clearTimers = (): void => {
		if (quietTimer) clearTimeout(quietTimer);
		if (maxTimer) clearTimeout(maxTimer);
		quietTimer = null;
		maxTimer = null;
	};

	const flush = (): void => {
		clearTimers();
		if (pending.size === 0 && !truncated) return;
		const batch = { paths: [...pending], truncated };
		pending = new Set();
		truncated = false;
		onFlush(batch);
	};

	return {
		add(path) {
			if (path === null) truncated = true;
			else if (pending.has(path)) {
			} else if (pending.size >= maxPaths) truncated = true;
			else pending.add(path);
			if (quietTimer) clearTimeout(quietTimer);
			quietTimer = setTimeout(flush, quietMs);
			if (!maxTimer) maxTimer = setTimeout(flush, maxWaitMs);
		},
		dispose() {
			clearTimers();
			pending = new Set();
			truncated = false;
		},
	};
}
