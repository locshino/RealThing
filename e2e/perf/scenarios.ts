export const SCENARIO_NAMES = ["region-toggles", "live-file-edits", "large-diff"] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export const DEFAULT_SCENARIOS: readonly ScenarioName[] = [
	"region-toggles",
	"live-file-edits",
	"large-diff",
];

export function isScenarioName(name: string): name is ScenarioName {
	return (SCENARIO_NAMES as readonly string[]).includes(name);
}
