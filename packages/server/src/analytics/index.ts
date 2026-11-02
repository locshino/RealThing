export type { ErrorSource } from "./errors";
export type {
	AcquisitionCampaignProperties,
	AdditionalAnalyticsCapture,
	AdditionalAnalyticsEvent,
	AnalyticsAvailability,
	AnalyticsCountBucket,
	AnalyticsDurationBucket,
	AnalyticsEvent,
	AnalyticsFailureReason,
	BasicAnalyticsEvent,
	BuildKind,
	PlanAddSurface,
	PlanOpenSurface,
	SetupAction,
} from "./events";
export {
	acquisitionCampaignProperties,
	bucketCount,
	bucketDuration,
	NONE_BUCKET,
} from "./events";
export {
	type AnalyticsOptions,
	type ErrorReport,
	getAdditionalAnalyticsCapture,
	initializeAnalytics,
	reportClientError,
	reportError,
	reportFatalError,
	resetAnalyticsForTests,
	setAdditionalAnalyticsEnabled,
	shutdownAnalytics,
	startAttributionClaim,
	track,
} from "./service";
