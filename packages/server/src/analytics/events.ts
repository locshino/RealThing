import type { AcquisitionRecord, AttributionTouch } from "../persistence";

export type BuildKind = "source" | "binary" | "desktop";

export type PlanOpenSurface = "page" | "rail";
export type PlanAddSurface = "page" | "rail";

export type BasicAnalyticsEvent = { name: "app_installed" } | { name: "app_started" };

export type AnalyticsAvailability = "yes" | "no" | "unknown";
export type AnalyticsFailureReason =
	| "auth"
	| "network"
	| "permission"
	| "not_git"
	| "already_open"
	| "unsupported"
	| "unknown"
	| "none";
export type SetupAction =
	| "directory_pick"
	| "project_open"
	| "project_init"
	| "project_create"
	| "worktree_create"
	| "worktree_attach";
export type AnalyticsDurationBucket = "<10s" | "10–59s" | "1–4m" | "5–14m" | "15m+" | "unknown";
export type AnalyticsCountBucket = "0" | "1" | "2–4" | "5+" | "unknown";

export type AcquisitionCampaignProperties = {
	first_touch_source?: string;
	first_touch_medium?: string;
	first_touch_campaign?: string;
	first_touch_content?: string;
	first_touch_referrer_class: AttributionTouch["referrer_class"];
	first_touch_touched_at: number;
	first_touch_policy_version: 1;
	last_touch_source?: string;
	last_touch_medium?: string;
	last_touch_campaign?: string;
	last_touch_content?: string;
	last_touch_referrer_class: AttributionTouch["referrer_class"];
	last_touch_touched_at: number;
	last_touch_policy_version: 1;
};

export type AdditionalAnalyticsEvent =
	| {
			name: "acquisition_linked";
			params: AcquisitionCampaignProperties & { journey_id: string; bridge_id: string };
	  }
	| {
			name: "setup_state_observed";
			params: {
				project_present: AnalyticsAvailability;
			};
	  }
	| {
			name: "setup_action_finished";
			params: {
				action: SetupAction;
				outcome: "succeeded" | "failed" | "cancelled";
				reason: AnalyticsFailureReason;
			};
	  }
	| {
			name: "task_completed";
			params: {
				change_evidence: "none" | "commit" | "changes" | "both";
				verification_recorded: "yes" | "no";
			};
	  }
	| { name: "plan_opened"; params: { surface: PlanOpenSurface } }
	| { name: "plan_item_added"; params: { surface: PlanAddSurface } };

export type AnalyticsEvent = BasicAnalyticsEvent | AdditionalAnalyticsEvent;
export type AdditionalAnalyticsCapture = (event: AdditionalAnalyticsEvent) => void;

function touchProperties(prefix: "first_touch" | "last_touch", touch: AttributionTouch) {
	return {
		...(touch.source === undefined ? {} : { [`${prefix}_source`]: touch.source }),
		...(touch.medium === undefined ? {} : { [`${prefix}_medium`]: touch.medium }),
		...(touch.campaign === undefined ? {} : { [`${prefix}_campaign`]: touch.campaign }),
		...(touch.content === undefined ? {} : { [`${prefix}_content`]: touch.content }),
		[`${prefix}_referrer_class`]: touch.referrer_class,
		[`${prefix}_touched_at`]: touch.touched_at,
		[`${prefix}_policy_version`]: touch.policy_version,
	};
}

export function acquisitionCampaignProperties(
	record: AcquisitionRecord,
): AcquisitionCampaignProperties {
	return {
		...touchProperties("first_touch", record.first_touch),
		...touchProperties("last_touch", record.last_touch),
	} as AcquisitionCampaignProperties;
}

export function bucketDuration(durationMs: number): AnalyticsDurationBucket {
	if (!Number.isFinite(durationMs) || durationMs < 0) return "unknown";
	if (durationMs < 10_000) return "<10s";
	if (durationMs < 60_000) return "10–59s";
	if (durationMs < 300_000) return "1–4m";
	if (durationMs < 900_000) return "5–14m";
	return "15m+";
}

export function bucketCount(count: number): AnalyticsCountBucket {
	if (!Number.isInteger(count) || count < 0) return "unknown";
	if (count === 0) return "0";
	if (count === 1) return "1";
	if (count < 5) return "2–4";
	return "5+";
}

export const CUSTOM_BUCKET = "custom";
export const NONE_BUCKET = "none";
