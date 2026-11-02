import {
	RiDownloadCloud2Line as DownloadCloud,
	RiRefreshLine as Refresh,
	RiRestartLine as Restart,
} from "@remixicon/react";
import type { NativeUpdateState } from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import { installFailureCopy } from "./installCopy";
import type { NativeUpdateAction, UpdatesController } from "./useUpdates";

interface UpdateSettingsProps {
	updates: UpdatesController;
}

type Translate = ReturnType<typeof useT>;

function nativeStatusCopy(
	t: Translate,
	state: NativeUpdateState | null,
): { title: string; detail: string } {
	switch (state?.status) {
		case "disabled":
			return {
				title: t("updates.native.disabled.title"),
				detail: t("updates.native.disabled.detail"),
			};
		case "idle":
			return {
				title: t("updates.native.idle.title"),
				detail: t("updates.native.idle.detail"),
			};
		case "checking":
			return {
				title: t("updates.native.checking.title"),
				detail: t("updates.native.checking.detail"),
			};
		case "available":
			return {
				title: state.availableVersion
					? t("updates.native.available.titleVersion", { version: state.availableVersion })
					: t("updates.native.available.title"),
				detail: t("updates.native.available.detail"),
			};
		case "downloading":
			return {
				title: state.availableVersion
					? t("updates.native.downloading.titleVersion", { version: state.availableVersion })
					: t("updates.native.downloading.title"),
				detail: t("updates.native.downloading.detail"),
			};
		case "preparing":
			return {
				title: t("updates.native.preparing.title"),
				detail: t("updates.native.preparing.detail"),
			};
		case "ready":
			return {
				title: state.availableVersion
					? t("updates.native.ready.titleVersion", { version: state.availableVersion })
					: t("updates.native.ready.title"),
				detail: t("updates.native.ready.detail"),
			};
		case "installing":
			return {
				title: t("updates.native.installing.title"),
				detail: t("updates.native.installing.detail"),
			};
		case "error":
			return {
				title: t("updates.native.error.title"),
				detail: t("updates.native.error.detail"),
			};
		default:
			return {
				title: t("updates.native.loading.title"),
				detail: t("updates.native.loading.detail"),
			};
	}
}

function publicChannel(channel: string | undefined): string | undefined {
	return channel === "canary" ? "nightly" : channel;
}

export function UpdateSettings({ updates }: UpdateSettingsProps) {
	const t = useT();
	const nativeState = updates.state;
	const nativeRequestError = updates.requestError;
	const nativeStatus = nativeState.status ?? "loading";
	const error = nativeRequestError?.message ?? nativeState.error ?? null;
	const lastInstall = nativeState.lastInstall ?? null;
	const installFailure =
		lastInstall && lastInstall.outcome !== "installed" ? installFailureCopy(t, lastInstall) : null;
	const failedAction: NativeUpdateAction | null =
		nativeRequestError?.action ?? nativeState.failedPhase ?? null;
	const copy = nativeStatusCopy(t, nativeState);
	const ready = nativeState.status === "ready";
	const nativeAvailable = nativeState.status === "available";
	const checking = nativeState.status === "checking";
	const downloading = nativeState.status === "downloading";
	const preparing = nativeState.status === "preparing";
	const installing = nativeState.status === "installing";
	const progress =
		downloading && typeof nativeState.progress === "number" && Number.isFinite(nativeState.progress)
			? Math.min(100, Math.max(0, nativeState.progress))
			: null;
	const progressLabel = downloading
		? progress === null
			? t("updates.progress.downloading")
			: t("updates.progress.downloadingPercent", { percent: Math.round(progress) })
		: preparing
			? t("updates.progress.preparing")
			: null;
	const toneClass = error
		? "text-feedback-error"
		: ready || nativeAvailable
			? "text-primary"
			: checking || downloading || preparing || installing
				? "text-feedback-info"
				: "text-text-muted";
	const currentVersion = nativeState.version;
	const channel = publicChannel(nativeState.channel);
	const availableVersion = nativeState.availableVersion;
	const retry =
		failedAction === "check"
			? updates.checkForUpdates
			: failedAction === "download"
				? updates.downloadUpdate
				: failedAction === "install"
					? updates.restartToUpdate
					: null;

	return (
		<section data-testid="settings-updates" className="flex flex-col gap-16">
			<div className="flex flex-col gap-4">
				<h3 className="tr-title-section text-text-default">{t("updates.settings.title")}</h3>
				<p className="text-text-muted tr-text-metadata">
					{t("updates.settings.nativeDescription")}
				</p>
			</div>

			<div
				data-testid="update-status"
				data-source="native"
				data-status={nativeStatus}
				className="flex flex-col gap-12 rounded-sm border border-border-default bg-control-bg p-12"
			>
				<div className="flex items-start gap-8">
					<DownloadCloud aria-hidden="true" className={`mt-2 size-16 shrink-0 ${toneClass}`} />
					<div className="min-w-0 flex-1">
						<p className="tr-title-compact text-text-default">
							{nativeRequestError ? t("updates.requestFailed.title") : copy.title}
						</p>
						<p className="text-text-muted tr-text-metadata">
							{nativeRequestError ? t("updates.requestFailed.detail") : copy.detail}
						</p>
					</div>
				</div>

				{progressLabel ? (
					<div className="flex flex-col gap-4">
						<progress
							max={100}
							{...(downloading && progress !== null ? { value: progress } : {})}
							aria-label={progressLabel}
							className="h-4 w-full accent-primary"
						/>
						<span className="text-text-muted tr-text-metadata">{progressLabel}</span>
					</div>
				) : null}

				{error ? (
					<p data-testid="update-error" role="alert" className="text-feedback-error tr-text-ui">
						{error}
					</p>
				) : null}

				{installFailure ? (
					<div
						data-testid="update-last-install"
						className="flex flex-col gap-2 rounded-sm border border-feedback-error-muted bg-feedback-error-subtle p-8"
					>
						<p className="tr-title-compact text-text-default">
							{t("updates.result.settingsCallout", { cause: installFailure.cause })}
						</p>
						<p className="text-text-muted tr-text-metadata">{installFailure.advice}</p>
					</div>
				) : null}

				<div className="flex flex-wrap items-center justify-between gap-8 border-border-default border-t pt-8">
					<span data-testid="update-version" className="text-text-muted tr-text-metadata">
						{currentVersion && channel
							? t("updates.version.native", { version: currentVersion, channel })
							: t("updates.version.unavailable")}
					</span>
					{availableVersion ? (
						<span className="text-text-muted tr-text-metadata">
							{t("updates.version.available", { version: availableVersion })}
						</span>
					) : null}
				</div>
			</div>

			<div className="flex flex-wrap justify-end gap-8">
				{nativeState.status === "idle" || checking ? (
					<Button
						variant="outline"
						size="l"
						iconLeft={Refresh}
						data-testid="update-check"
						disabled={checking}
						onClick={updates.checkForUpdates}
					>
						{checking ? t("updates.action.checking") : t("updates.action.check")}
					</Button>
				) : null}
				{retry ? (
					<Button
						variant="outline"
						size="l"
						iconLeft={Refresh}
						data-testid="update-retry"
						onClick={retry}
					>
						{t("common.retry")}
					</Button>
				) : null}
				{nativeAvailable && failedAction !== "download" ? (
					<Button
						variant="primary"
						size="l"
						iconLeft={DownloadCloud}
						data-testid="update-download"
						onClick={updates.downloadUpdate}
					>
						{t("updates.action.download")}
					</Button>
				) : null}
				{ready && failedAction !== "install" ? (
					<Button
						variant="primary"
						size="l"
						iconLeft={Restart}
						data-testid="update-restart"
						onClick={updates.restartToUpdate}
					>
						{t("updates.action.installRestart")}
					</Button>
				) : null}
			</div>

			{ready ? (
				<p className="text-text-muted tr-text-metadata">{t("updates.settings.deferral")}</p>
			) : null}
		</section>
	);
}
