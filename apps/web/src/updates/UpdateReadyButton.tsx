import { RiDownloadCloud2Line as DownloadCloud } from "@remixicon/react";
import { useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import type { UpdatesController } from "./useUpdates";

export function UpdateReadyButton({
	updates,
	onOpen,
}: {
	updates: UpdatesController;
	onOpen(): void;
}) {
	const t = useT();
	const nativeState = updates.state;
	const nativeNeedsAttention = updates.requestError !== null;
	const lastInstall = nativeState.lastInstall ?? null;
	const installFailed = lastInstall !== null && lastInstall.outcome !== "installed";
	const nativeActionable =
		nativeNeedsAttention ||
		installFailed ||
		nativeState.status === "available" ||
		nativeState.status === "downloading" ||
		nativeState.status === "preparing" ||
		nativeState.status === "ready" ||
		nativeState.status === "installing" ||
		nativeState.status === "error";
	if (!nativeActionable) return null;

	const availableVersion = updates.state.availableVersion;
	let label = t("updates.button.attention");
	let ariaLabel = availableVersion
		? t("updates.button.attentionVersionLabel", { version: availableVersion })
		: t("updates.button.attentionLabel");
	if (installFailed) {
		label = t("updates.button.installFailed");
		ariaLabel = t("updates.button.installFailedLabel");
	} else if (!nativeNeedsAttention) {
		switch (nativeState.status) {
			case "available":
				label = t("updates.button.available");
				ariaLabel = availableVersion
					? t("updates.button.nativeAvailableVersionLabel", { version: availableVersion })
					: t("updates.button.nativeAvailableLabel");
				break;
			case "downloading":
				label =
					typeof nativeState.progress === "number"
						? t("updates.button.downloadingPercent", {
								percent: Math.round(nativeState.progress),
							})
						: t("updates.button.downloading");
				ariaLabel = label;
				break;
			case "preparing":
				label = t("updates.button.preparing");
				ariaLabel = label;
				break;
			case "ready":
				label = t("updates.button.ready");
				ariaLabel = availableVersion
					? t("updates.button.readyVersionLabel", { version: availableVersion })
					: t("updates.button.readyLabel");
				break;
			case "installing":
				label = t("updates.button.installing");
				ariaLabel = label;
				break;
		}
	}

	return (
		<Button
			variant="soft-primary"
			size="m"
			iconLeft={DownloadCloud}
			data-testid="update-ready"
			data-source="native"
			data-status={nativeState.status}
			aria-label={ariaLabel}
			onClick={onOpen}
		>
			<span className="hidden md:inline">{label}</span>
		</Button>
	);
}
