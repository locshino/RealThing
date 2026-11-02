export type AnalyticsOptions = Record<string, unknown>;
export type ErrorReport = Record<string, unknown>;

export function initializeAnalytics(_options?: unknown): void {}
export function reportClientError(_input: unknown): void {}
export function reportError(_error: unknown, _report?: unknown): void {}
export async function reportFatalError(_error: unknown, _kind?: unknown): Promise<void> {}
export function resetAnalyticsForTests(): void {}
export function setAdditionalAnalyticsEnabled(_enabled: boolean): void {}
export async function shutdownAnalytics(): Promise<void> {}
export function startAttributionClaim(): void {}
export function track(_event: unknown): void {}
export function getAdditionalAnalyticsCapture(): null {
	return null;
}
