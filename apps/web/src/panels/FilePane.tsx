import { useT } from "@realthing/locales/react";
import {
	describeResource,
	PENDING_TEXT_META,
	RendererToggles,
	RendererView,
	rendererImplementationKey,
	resourceContent,
	useRendererSelection,
} from "@realthing/resource-renderers";
import { LoadingRegion } from "@realthing/ui/skeleton";
import {
	Suspense,
	useCallback,
	useEffect,
	useInsertionEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { isPhoneViewport } from "../lib";
import type { FileTab } from "../store";
import { selectWorkspaceTick, toast, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { resourceBytesUrl, useResetViewStateOnImplementationChange } from "./resourcePane";
import { useLiveTabContent } from "./useLiveTabContent";

type SaveStatus = "idle" | "unsaved" | "saving" | "saved";

const loading = <LoadingRegion rows={12} className="h-full p-12" testId="file-pane-loading" />;

export function FilePane({ tab }: { tab: FileTab }) {
	const t = useT();
	const saveErrorTitle = t("panels.filePane.saveError");
	const setTabRenderer = useAppStore((state) => state.setTabRenderer);
	const editorAutoSaveDelayMs = useAppStore((s) => s.editorAutoSaveDelayMs);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

	const stateRef = useRef({
		workspaceId: tab.workspaceId,
		tabId: tab.id,
		path: tab.path,
		meta: tab.meta,
		latestText: tab.content,
		dirty: false,
		inFlight: 0,
		editVersion: 0,
		timer: null as ReturnType<typeof setTimeout> | null,
		mounted: true,
	});
	const latestTabSnapshotRef = useRef({ content: tab.content, meta: tab.meta });

	useInsertionEffect(() => {
		latestTabSnapshotRef.current = { content: tab.content, meta: tab.meta };
		const s = stateRef.current;
		if (s.workspaceId === tab.workspaceId && s.tabId === tab.id && s.path === tab.path) {
			s.meta = tab.meta;
			if (!s.dirty && s.inFlight === 0) {
				s.latestText = tab.content;
			}
		}
	}, [tab.workspaceId, tab.id, tab.path, tab.meta, tab.content]);

	const runSave = useCallback(
		(textToSave: string) => {
			const s = stateRef.current;
			if (s.timer !== null) {
				clearTimeout(s.timer);
				s.timer = null;
			}
			const workspaceId = s.workspaceId;
			const tabId = s.tabId;
			const path = s.path;
			const versionAtSave = s.editVersion;
			s.dirty = false;
			s.inFlight += 1;
			setSaveStatus("saving");
			getTransport()
				.request("fs.writeFile", { workspaceId, path, content: textToSave })
				.then(({ meta }) => {
					s.inFlight = Math.max(0, s.inFlight - 1);
					const sameTab =
						s.mounted && s.workspaceId === workspaceId && s.tabId === tabId && s.path === path;
					if (sameTab) {
						s.meta = meta;
					}
					const textForStore =
						sameTab && (s.editVersion !== versionAtSave || s.dirty) ? s.latestText : textToSave;
					const store = useAppStore.getState();
					store.updateFileTabContent(
						workspaceId,
						tabId,
						textForStore,
						meta,
						selectWorkspaceTick(store, workspaceId),
					);
					if (sameTab && s.editVersion === versionAtSave && !s.dirty) {
						setSaveStatus("saved");
					}
				})
				.catch((err) => {
					s.inFlight = Math.max(0, s.inFlight - 1);
					const sameTab =
						s.mounted && s.workspaceId === workspaceId && s.tabId === tabId && s.path === path;
					if (sameTab) {
						s.dirty = true;
						setSaveStatus("unsaved");
					}
					toast.error(errorText(err), saveErrorTitle);
				});
		},
		[saveErrorTitle],
	);

	const onChangeContent = useCallback(
		(newText: string) => {
			const s = stateRef.current;
			s.latestText = newText;
			s.dirty = true;
			s.editVersion += 1;
			if (s.timer !== null) {
				clearTimeout(s.timer);
				s.timer = null;
			}
			const store = useAppStore.getState();
			store.updateFileTabContent(
				s.workspaceId,
				s.tabId,
				newText,
				s.meta,
				selectWorkspaceTick(store, s.workspaceId),
			);
			setSaveStatus("unsaved");
			if (editorAutoSaveDelayMs > 0) {
				s.timer = setTimeout(() => {
					s.timer = null;
					runSave(s.latestText);
				}, editorAutoSaveDelayMs);
			}
		},
		[editorAutoSaveDelayMs, runSave],
	);

	const onSaveContent = useCallback(
		(textToSave: string) => {
			const s = stateRef.current;
			if (textToSave !== s.latestText) {
				s.latestText = textToSave;
				s.dirty = true;
				s.editVersion += 1;
				const store = useAppStore.getState();
				store.updateFileTabContent(
					s.workspaceId,
					s.tabId,
					textToSave,
					s.meta,
					selectWorkspaceTick(store, s.workspaceId),
				);
			}
			if (!s.dirty && s.timer === null) return;
			runSave(textToSave);
		},
		[runSave],
	);

	useEffect(() => {
		const s = stateRef.current;
		const switched = s.workspaceId !== tab.workspaceId || s.tabId !== tab.id || s.path !== tab.path;
		if (switched) {
			s.workspaceId = tab.workspaceId;
			s.tabId = tab.id;
			s.path = tab.path;
			s.meta = latestTabSnapshotRef.current.meta;
			s.latestText = latestTabSnapshotRef.current.content;
			s.dirty = false;
			s.inFlight = 0;
			s.editVersion = 0;
			setSaveStatus("idle");
		}
		s.mounted = true;
		return () => {
			if (s.timer !== null) {
				clearTimeout(s.timer);
				s.timer = null;
			}
			if (s.dirty) {
				const workspaceId = s.workspaceId;
				const tabId = s.tabId;
				const path = s.path;
				const textToSave = s.latestText;
				s.dirty = false;
				getTransport()
					.request("fs.writeFile", { workspaceId, path, content: textToSave })
					.then(({ meta }) => {
						const store = useAppStore.getState();
						store.updateFileTabContent(
							workspaceId,
							tabId,
							textToSave,
							meta,
							selectWorkspaceTick(store, workspaceId),
						);
					})
					.catch((err) => {
						toast.error(errorText(err), saveErrorTitle);
					});
			}
			s.mounted = false;
		};
	}, [tab.workspaceId, tab.id, tab.path, saveErrorTitle]);

	useLiveTabContent(tab, {
		read: () =>
			getTransport().request("fs.readFile", { workspaceId: tab.workspaceId, path: tab.path }),
		applyFresh: ({ content, meta }, tick) => {
			const s = stateRef.current;
			if (s.dirty || s.inFlight > 0) {
				useAppStore
					.getState()
					.updateFileTabContent(tab.workspaceId, tab.id, s.latestText, s.meta, tick);
				return;
			}
			useAppStore.getState().updateFileTabContent(tab.workspaceId, tab.id, content, meta, tick);
		},
		keepCurrent: (tick) =>
			useAppStore
				.getState()
				.updateFileTabContent(tab.workspaceId, tab.id, tab.content, tab.meta, tick),
	});

	const resource = useMemo(
		() => describeResource(tab.workspaceId, tab.path, tab.meta ?? PENDING_TEXT_META),
		[tab.workspaceId, tab.path, tab.meta],
	);
	const { mobile, candidates, renderer, implementationKey } = useRendererSelection(
		resource,
		"view",
		tab.rendererId,
	);
	useResetViewStateOnImplementationChange(tab.workspaceId, tab.id, implementationKey);
	const content = resourceContent(tab.content, tab.meta, () =>
		resourceBytesUrl(tab.workspaceId, tab.path),
	);
	const showToolbar = candidates.length >= 2 || saveStatus !== "idle";
	const saveViewState = (state: unknown) => {
		const current = useAppStore
			.getState()
			.tabsByWorkspace[tab.workspaceId]?.find((candidate) => candidate.id === tab.id);
		if (
			current?.kind === "file" &&
			(current.rendererId === undefined || current.rendererId === renderer.id) &&
			rendererImplementationKey(renderer.id, isPhoneViewport()) === implementationKey
		) {
			useAppStore.getState().setTabViewState(tab.workspaceId, tab.id, state);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			{showToolbar ? (
				<div
					data-testid="resource-view-toggle"
					role="toolbar"
					aria-label={t("panels.filePane.resourceView")}
					className="flex h-32 shrink-0 items-center justify-end gap-8 border-border-default border-b bg-container-header-bg px-12"
				>
					{saveStatus !== "idle" ? (
						<span data-testid="file-save-status" className="tr-text-caption text-text-muted">
							{saveStatus === "saving"
								? t("panels.filePane.saving")
								: saveStatus === "saved"
									? t("panels.filePane.saved")
									: t("panels.filePane.unsaved")}
						</span>
					) : null}
					<RendererToggles
						candidates={candidates}
						renderer={renderer}
						onRendererId={(rendererId) => setTabRenderer(tab.workspaceId, tab.id, rendererId)}
					/>
				</div>
			) : null}
			<div className="min-h-0 flex-1">
				<Suspense fallback={loading}>
					<RendererView
						key={implementationKey}
						renderer={renderer}
						mobile={mobile}
						resource={resource}
						content={content}
						viewState={tab.viewState}
						onViewState={saveViewState}
						onChangeContent={onChangeContent}
						onSaveContent={onSaveContent}
					/>
				</Suspense>
			</div>
		</div>
	);
}
