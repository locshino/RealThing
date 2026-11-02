import {
	RiGitBranchLine as GitBranch,
	RiTerminalBoxLine as SquareTerminal,
} from "@remixicon/react";
import type { MessageKey } from "@realthing/locales";
import { t, useT } from "@realthing/locales/react";
import { IconButton } from "@realthing/ui/button";
import { LoadingRegion } from "@realthing/ui/skeleton";
import {
	Fragment,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { preloadedLazy } from "../components/preloadedLazy";
import { QuietScrollArea } from "../components/QuietScrollArea";
import { type LayoutAttention, layoutResourceIdentity } from "../lib";
import { DiffPane } from "../panels/DiffPane";
import { whenFilesTreeIdle } from "../panels/editorWarm";
import { FilePane } from "../panels/FilePane";
import { FilesPanel } from "../panels/FilesPanel";
import { fileComparisonTab } from "../panels/openTabs";
import { ProjectTree } from "../panels/ProjectTree";
import { TerminalWorkbenchBody, useTerminalClose } from "../panels/TerminalWorkbench";
import {
	type ChangesTab,
	createChangesTab,
	type EditorTab,
	isConnectedGeneration,
	isDefaultWorkspace,
	isExternalWorkspace,
	isFileComparison,
	type LayoutIntent,
	selectContextProject,
	selectDiffTabTargetRef,
	selectWorkspaceById,
	selectWorkspaceNavTick,
	selectWorkspaceTick,
	toast,
	useAppStore,
	workspaceName,
} from "../store";
import { errorText, getTransport } from "../transport";
import { subscribeCloseRequest } from "./closeRequestChannel";
import {
	collectAllGroups,
	findPlacedResource,
	findTabLocation,
	type LayoutCenterTab,
	type LayoutTab,
	type LayoutTabFocusRequest,
	type LayoutToolId,
	Workbench,
	type WorkspaceLayoutDocument,
} from "./layout";
import { toLayoutTab, useLayoutIntentProcessing } from "./layoutIntents";
import {
	applyLayoutAttention,
	commitWorkspaceLayout,
	emptyWorkspaceProjection,
	useWorkspaceLayoutState,
	workspaceProjectionReference,
} from "./layoutState";
import { syncLegacySelectionFromAttention, useLegacySelectionAdapter } from "./legacySelection";
import { useTerminalPlacementReconciliation } from "./terminalReconciliation";
import { useIdleEditorPreload } from "./useIdleEditorPreload";

const PlanPane = lazy(() => import("../panels/PlanPane"));
const ChangesReviewPane = preloadedLazy<{ tab: ChangesTab }>(() =>
	import("../panels/ChangesReviewPane").then((module) => ({ default: module.ChangesReviewPane })),
);
const PlanRailPane = lazy(() => import("../panels/PlanRailPane"));

const NO_EDITOR_TABS: EditorTab[] = [];

const RESTORING_LABEL = {
	file: "shell.workbench.restoring.file",
	changes: "shell.workbench.restoring.changes",
	diff: "shell.workbench.restoring.diff",
	editor: "shell.workbench.restoring.editor",
	plan: "shell.workbench.restoring.plan",
	terminal: "shell.workbench.restoring.terminal",
} satisfies Record<string, MessageKey>;

function MissingResource({ kind }: { kind: keyof typeof RESTORING_LABEL }) {
	const t = useT();
	return (
		<LoadingRegion
			rows={12}
			label={t(RESTORING_LABEL[kind])}
			className="h-full overflow-hidden p-16"
		/>
	);
}

type EditorResourceTab = Extract<LayoutCenterTab, { kind: "file" | "diff" | "changes" }>;
type EditorResource = Extract<EditorTab, { kind: "file" | "diff" | "changes" }>;

function isEditorResource(tab: EditorTab): tab is EditorResource {
	return tab.kind === "file" || tab.kind === "diff" || tab.kind === "changes";
}

function findEditorResource(
	tabs: readonly EditorTab[],
	id: string,
	identity: string,
): EditorResource | undefined {
	const exact = tabs.find((candidate) => candidate.id === id);
	if (exact && isEditorResource(exact) && layoutResourceIdentity(exact) === identity) return exact;
	return tabs.find(
		(candidate): candidate is EditorResource =>
			isEditorResource(candidate) && layoutResourceIdentity(candidate) === identity,
	);
}

function EditorResourceBody({ workspaceId, tab }: { workspaceId: string; tab: EditorResourceTab }) {
	const t = useT();
	const identity = layoutResourceIdentity(tab);
	const editor = useAppStore((state) =>
		findEditorResource(state.tabsByWorkspace[workspaceId] ?? NO_EDITOR_TABS, tab.id, identity),
	);
	if (!editor) {
		return <MissingResource kind={tab.kind} />;
	}
	return (
		<ErrorBoundary
			label={t("shell.workbench.panel.editor")}
			reportId="editor"
			resetKeys={[workspaceId, tab.id]}
		>
			<Suspense fallback={<MissingResource kind="editor" />}>
				{editor.kind === "file" ? (
					<FilePane tab={editor} />
				) : editor.kind === "diff" ? (
					<DiffPane tab={editor} />
				) : (
					<ChangesReviewPane tab={editor} />
				)}
			</Suspense>
		</ErrorBoundary>
	);
}

function useTerminalReservation(workspaceId: string): void {
	const status = useAppStore((state) => state.status);
	const connectionGeneration = useAppStore((state) => state.connectionGeneration);
	const pendingIntent = useAppStore((state) =>
		state.layoutIntents.find(
			(intent): intent is Extract<LayoutIntent, { kind: "place-terminal" }> =>
				intent.kind === "place-terminal" &&
				intent.workspaceId === workspaceId &&
				state.terminalsByWorkspace[workspaceId]?.some(
					(tab) => tab.tabKey === intent.tabKey && tab.reservationPending,
				) === true,
		),
	);

	useEffect(() => {
		if (!pendingIntent || status !== "connected" || connectionGeneration === 0) return;
		let current = true;
		void getTransport()
			.request("terminal.reserve", {
				workspaceId,
				tabKey: pendingIntent.tabKey,
				title: pendingIntent.title,
			})
			.then(() => {
				const state = useAppStore.getState();
				if (
					!current ||
					!isConnectedGeneration(state, connectionGeneration) ||
					state.removedWorkspaceIds[workspaceId]
				) {
					return;
				}
				state.confirmTerminalReservation(workspaceId, pendingIntent.tabKey);
			})
			.catch((error) => {
				const state = useAppStore.getState();
				if (
					!current ||
					!isConnectedGeneration(state, connectionGeneration) ||
					state.removedWorkspaceIds[workspaceId]
				) {
					return;
				}
				const stillPending = state.terminalsByWorkspace[workspaceId]?.some(
					(tab) => tab.tabKey === pendingIntent.tabKey && tab.reservationPending,
				);
				if (!stillPending) return;
				state.rejectTerminalReservation(workspaceId, pendingIntent.tabKey);
				toast.error(errorText(error), t("shell.workbench.terminalCreateFailed"));
			});
		return () => {
			current = false;
		};
	}, [connectionGeneration, pendingIntent, status, workspaceId]);
}

export function WorkspaceWorkbench({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const status = useAppStore((state) => state.status);
	const connectionGeneration = useAppStore((state) => state.connectionGeneration);
	const document = useAppStore((state) => state.layoutDocumentsByWorkspace[workspaceId]);
	const attention = useAppStore((state) => state.layoutAttentionByWorkspace[workspaceId]);
	const frame = useAppStore((state) => state.workbenchFrame);
	const projectionEpoch = useAppStore((state) => state.layoutProjectionEpoch);
	const layoutPreferences = useAppStore((state) => state.localLayoutPreferences);
	const workspace = useAppStore((state) => selectWorkspaceById(state, workspaceId));
	const contextProject = useAppStore(selectContextProject);
	const editorTabs = useAppStore((state) => state.tabsByWorkspace[workspaceId] ?? NO_EDITOR_TABS);
	const terminalClose = useTerminalClose();
	useIdleEditorPreload(workspaceId);
	useEffect(
		() =>
			whenFilesTreeIdle(
				() => {
					void ChangesReviewPane.preload();
				},
				{ timeout: 400, fallbackDelay: 150 },
			),
		[],
	);
	const [focusRequest, setFocusRequest] = useState<LayoutTabFocusRequest | null>(null);

	useWorkspaceLayoutState(workspaceId);

	useEffect(() => {
		if (!document) return;
		const state = useAppStore.getState();
		if (state.layoutDocumentsByWorkspace[workspaceId] !== document) return;
		const placed = new Set(
			collectAllGroups(document)
				.flatMap((group) => group.tabs)
				.map(layoutResourceIdentity),
		);
		const opening = new Set(
			state.layoutIntents.flatMap((intent) => {
				if (intent.workspaceId !== workspaceId || intent.kind !== "open") return [];
				const resource = toLayoutTab(intent.tab);
				return resource ? [layoutResourceIdentity(resource)] : [];
			}),
		);
		for (const tab of editorTabs) {
			const resource = toLayoutTab(tab);
			const identity = resource ? layoutResourceIdentity(resource) : null;
			if (identity && (placed.has(identity) || opening.has(identity))) continue;
			const latest = useAppStore.getState();
			if (latest.layoutDocumentsByWorkspace[workspaceId] !== document) return;
			const current = (latest.tabsByWorkspace[workspaceId] ?? []).find(
				(candidate) => candidate.id === tab.id,
			);
			const currentResource = current ? toLayoutTab(current) : null;
			if (
				!current ||
				!identity ||
				!currentResource ||
				layoutResourceIdentity(currentResource) !== identity
			) {
				continue;
			}
			latest.closeTab(current.id, false, false, workspaceId);
		}
	}, [document, editorTabs, workspaceId]);

	const changeAttention = useCallback(
		(next: LayoutAttention) => {
			const state = useAppStore.getState();
			if (state.removedWorkspaceIds[workspaceId]) return;
			applyLayoutAttention(workspaceId, next);
			syncLegacySelectionFromAttention(workspaceId);
		},
		[workspaceId],
	);

	const commit = useCallback(
		(next: WorkspaceLayoutDocument, nextAttention?: LayoutAttention) => {
			void commitWorkspaceLayout(workspaceId, next, {
				...(document ? { baseDocument: document } : {}),
				...(nextAttention ? { attention: nextAttention } : {}),
			}).catch(() => {});
		},
		[document, workspaceId],
	);

	useLegacySelectionAdapter(workspaceId);
	useTerminalReservation(workspaceId);
	useLayoutIntentProcessing(workspaceId, commit, changeAttention, setFocusRequest);
	const { terminals } = useTerminalPlacementReconciliation(workspaceId, commit);

	useEffect(() => {
		if (!document || status !== "connected") return;
		if (useAppStore.getState().layoutDocumentsByWorkspace[workspaceId] !== document) return;
		let current = true;
		const cache = useAppStore.getState().tabsByWorkspace[workspaceId] ?? [];
		const cachedResources = new Set(
			cache.flatMap((item) => {
				const resource = toLayoutTab(item);
				return resource &&
					(resource.kind === "file" || resource.kind === "diff" || resource.kind === "changes")
					? [layoutResourceIdentity(resource)]
					: [];
			}),
		);
		for (const tab of collectAllGroups(document).flatMap((group) => group.tabs)) {
			if (tab.kind !== "file" && tab.kind !== "diff" && tab.kind !== "changes") continue;
			const identity = layoutResourceIdentity(tab);
			if (cachedResources.has(identity)) continue;
			if (tab.kind === "changes") {
				useAppStore
					.getState()
					.openTab(createChangesTab(workspaceId, tab.id, tab.name, tab.scope), "keep", false, {
						activate: false,
					});
				continue;
			}
			if (isFileComparison(tab)) {
				useAppStore
					.getState()
					.openTab(
						{ ...fileComparisonTab(workspaceId, tab.before, tab.path), id: tab.id },
						"keep",
						false,
						{ activate: false },
					);
				continue;
			}
			const cacheArrived = () =>
				(useAppStore.getState().tabsByWorkspace[workspaceId] ?? []).some((item) => {
					const resource = toLayoutTab(item);
					return resource !== null && layoutResourceIdentity(resource) === identity;
				});
			const currentPlacement = () => {
				const latest = useAppStore.getState().layoutDocumentsByWorkspace[workspaceId];
				return latest ? findPlacedResource(latest, tab) : null;
			};
			const loadedTick = selectWorkspaceTick(useAppStore.getState(), workspaceId);
			if (tab.kind === "file") {
				void getTransport()
					.request("fs.readFile", { workspaceId, path: tab.path })
					.then(({ content, meta }) => {
						const latest = useAppStore.getState();
						if (!current || !isConnectedGeneration(latest, connectionGeneration)) return;
						const placed = currentPlacement();
						if (placed?.kind !== "file" || cacheArrived()) return;
						useAppStore.getState().openTab(
							{
								kind: "file",
								id: placed.id,
								workspaceId,
								path: placed.path,
								name: placed.name,
								content,
								meta,
								loadedTick,
							},
							"keep",
							false,
							{ activate: false },
						);
					})
					.catch(() => {});
			} else {
				const loadedTarget = selectDiffTabTargetRef(useAppStore.getState(), {
					workspaceId,
					scope: tab.scope,
				});
				void getTransport()
					.request("git.diffFile", { workspaceId, path: tab.path, scope: tab.scope })
					.then(({ original, modified, meta, originalOid }) => {
						const latest = useAppStore.getState();
						if (!current || !isConnectedGeneration(latest, connectionGeneration)) return;
						const placed = currentPlacement();
						if (placed?.kind !== "diff" || isFileComparison(placed) || cacheArrived()) return;
						useAppStore.getState().openTab(
							{
								kind: "diff",
								id: placed.id,
								workspaceId,
								path: placed.path,
								scope: placed.scope,
								name: placed.name,
								original,
								modified,
								meta,
								originalOid,
								loadedTick,
								loadedTarget,
							},
							"keep",
							false,
							{ activate: false },
						);
					})
					.catch(() => {});
			}
		}
		return () => {
			current = false;
		};
	}, [connectionGeneration, document, status, workspaceId]);

	const terminalByKey = useMemo(
		() => new Map(terminals.map((tab) => [tab.tabKey, tab])),
		[terminals],
	);
	const pendingProjection = useMemo(
		() =>
			(document && attention) || !frame
				? null
				: emptyWorkspaceProjection(frame, workspaceProjectionReference(workspaceId)),
		[attention, document, frame, workspaceId],
	);
	const rendered = document && attention ? { document, attention } : pendingProjection;

	const renderResourceBody = useCallback(
		(tab: LayoutCenterTab | Extract<LayoutTab, { kind: "terminal" }>) => {
			if (tab.kind === "document") {
				return (
					<ErrorBoundary
						label={t("shell.workbench.panel.plan")}
						reportId="plan"
						resetKeys={[workspaceId, tab.id]}
					>
						<Suspense fallback={<MissingResource kind="plan" />}>
							<PlanPane workspaceId={workspaceId} />
						</Suspense>
					</ErrorBoundary>
				);
			}
			if (tab.kind === "terminal") {
				const terminal = terminalByKey.get(tab.tabKey);
				const location = document ? findTabLocation(document, tab.id) : null;
				return (
					<ErrorBoundary
						label={t("shell.workbench.panel.terminal")}
						reportId="terminal"
						resetKeys={[workspaceId, tab.id]}
					>
						{terminal ? (
							<TerminalWorkbenchBody
								tab={terminal}
								onAdd={() =>
									useAppStore
										.getState()
										.addTerminal(workspaceId, undefined, location?.groupId, location?.area)
								}
							/>
						) : (
							<MissingResource kind="terminal" />
						)}
					</ErrorBoundary>
				);
			}
			return <EditorResourceBody workspaceId={workspaceId} tab={tab} />;
		},
		[document, t, terminalByKey, workspaceId],
	);
	const renderTabBody = useCallback(
		(tab: LayoutCenterTab | Extract<LayoutTab, { kind: "terminal" }>) => (
			<Fragment key={workspaceId}>{renderResourceBody(tab)}</Fragment>
		),
		[renderResourceBody, workspaceId],
	);

	const toolBodies = useMemo<Record<LayoutToolId, ReactNode>>(() => {
		const bodies: Record<LayoutToolId, ReactNode> = {
			projects: (
				<QuietScrollArea
					data-testid="left-nav"
					className="h-full"
					viewportClassName="p-panel-inset"
				>
					<ProjectTree />
				</QuietScrollArea>
			),
			files: <FilesPanel key={workspaceId} workspaceId={workspaceId} />,
			plan: (
				<ErrorBoundary
					label={t("shell.workbench.panel.planRail")}
					reportId="plan_rail"
					resetKeys={[workspaceId]}
				>
					<Suspense fallback={<MissingResource kind="plan" />}>
						<PlanRailPane workspaceId={workspaceId} />
					</Suspense>
				</ErrorBoundary>
			),
		};
		for (const tool of Object.keys(bodies) as LayoutToolId[]) {
			bodies[tool] = (
				<ErrorBoundary
					label={t("shell.workbench.panel.tool", { tool })}
					reportId={`${tool}_tool`}
					resetKeys={[workspaceId, tool]}
				>
					{bodies[tool]}
				</ErrorBoundary>
			);
		}
		return bodies;
	}, [t, workspaceId]);
	const renderToolBody = useCallback((tool: LayoutToolId) => toolBodies[tool], [toolBodies]);

	const isDefault = workspace != null && isDefaultWorkspace(workspace);
	const isExternal = workspace != null && isExternalWorkspace(workspace);

	const renderTabAdornment = useCallback((_tab: LayoutTab): ReactNode => null, []);

	const renderEmptyCenter = useCallback(
		(_groupId: string): ReactNode => (
			<div
				data-testid="workspace-ready"
				className="flex h-full flex-col items-center justify-center gap-4 px-16 text-center"
			>
				<span className="tr-text-eyebrow text-text-muted">
					{isDefault
						? t("shell.workbench.ready.defaultEyebrow")
						: isExternal
							? t("shell.workbench.ready.externalEyebrow")
							: t("shell.workbench.ready.worktreeEyebrow")}
				</span>
				{workspace ? (
					<>
						<h2 className="max-w-full truncate tr-title-entity text-text-default">
							{isDefault ? (contextProject?.name ?? workspaceName(t, workspace)) : workspace.name}
						</h2>
						<p className="flex max-w-full items-center gap-4 tr-text-metadata text-text-muted">
							<GitBranch className="size-14 shrink-0" />
							{isDefault || isExternal ? (
								<span className="truncate">
									{t("shell.workbench.ready.onBranch", { branch: workspace.branch })}
								</span>
							) : (
								<>
									<span className="truncate">{workspace.branch}</span>
									<span className="shrink-0 text-text-muted">
										{t("shell.workbench.ready.fromBase", { base: workspace.baseBranch })}
									</span>
								</>
							)}
						</p>
					</>
				) : null}
				<p className="mt-4 tr-text-ui text-text-muted">
					{isDefault
						? t("shell.workbench.ready.defaultDescription")
						: t("shell.workbench.ready.worktreeDescription")}
				</p>
			</div>
		),
		[contextProject, isDefault, isExternal, t, workspace],
	);

	const renderCenterActions = useCallback(
		(groupId: string): ReactNode => (
			<IconButton
				variant="ghost"
				size="m"
				icon={SquareTerminal}
				label={t("shell.workbench.newTerminal")}
				data-testid="new-terminal"
				onClick={() => useAppStore.getState().addTerminal(workspaceId, undefined, groupId)}
				className="shrink-0 self-center"
			/>
		),
		[t, workspaceId],
	);

	if (!rendered) {
		return (
			<div className="flex h-full items-center justify-center bg-container-content-bg tr-text-ui text-text-muted">
				{t("shell.workbench.restoringLayout")}
			</div>
		);
	}

	return (
		<div data-testid="workspace-workbench" data-layout-status="settled" className="contents">
			<Workbench
				workspaceId={workspaceId}
				document={rendered.document}
				attention={rendered.attention}
				maxSideGroups={layoutPreferences.maxSideGroups}
				maxBottomGroups={layoutPreferences.maxBottomGroups}
				projectionEpoch={projectionEpoch}
				{...(focusRequest ? { focusRequest } : {})}
				subscribeCloseRequest={subscribeCloseRequest}
				renderTabBody={renderTabBody}
				renderTabAdornment={renderTabAdornment}
				renderToolBody={renderToolBody}
				renderEmptyCenter={renderEmptyCenter}
				renderCenterActions={renderCenterActions}
				onCommit={commit}
				onAttentionChange={changeAttention}
				onUserNavigation={() => useAppStore.getState().noteNavigation(workspaceId)}
				readNavigationTick={() => selectWorkspaceNavTick(useAppStore.getState(), workspaceId)}
				onRequestClose={(tab, prepare) => {
					if (tab.kind === "terminal") {
						const close = () => {
							const state = useAppStore.getState();
							if (state.removedWorkspaceIds[workspaceId]) return;
							const latest = state.layoutDocumentsByWorkspace[workspaceId];
							const prepared = prepare(latest);
							if (!latest || prepared.document !== latest) {
								void commitWorkspaceLayout(
									workspaceId,
									prepared.document,
									latest ? { baseDocument: latest } : {},
								).catch(() => {});
							}
							const finalState = useAppStore.getState();
							const finalDocument = finalState.layoutDocumentsByWorkspace[workspaceId];
							const finalAttention = finalState.layoutAttentionByWorkspace[workspaceId];
							prepared.onAccepted(
								finalDocument && finalAttention
									? { document: finalDocument, attention: finalAttention }
									: undefined,
							);
						};
						const terminal = terminalByKey.get(tab.tabKey);
						if (terminal) terminalClose.requestClose(terminal, close);
						else close();
						return;
					}
					const prepared = prepare();
					const closedIdentity = layoutResourceIdentity(tab);
					void commitWorkspaceLayout(
						workspaceId,
						prepared.document,
						document ? { baseDocument: document } : {},
					)
						.then(() => {
							const state = useAppStore.getState();
							const current = state.layoutDocumentsByWorkspace[workspaceId];
							if (
								current &&
								collectAllGroups(current)
									.flatMap((group) => group.tabs)
									.some((candidate) => layoutResourceIdentity(candidate) === closedIdentity)
							) {
								return;
							}
							const currentAttention = state.layoutAttentionByWorkspace[workspaceId];
							prepared.onAccepted(
								current && currentAttention
									? { document: current, attention: currentAttention }
									: undefined,
							);
							if (
								tab.kind === "file" ||
								tab.kind === "diff" ||
								tab.kind === "changes" ||
								tab.kind === "document"
							) {
								for (const cache of state.tabsByWorkspace[workspaceId] ?? []) {
									const resource = toLayoutTab(cache);
									if (resource && layoutResourceIdentity(resource) === closedIdentity) {
										state.closeTab(cache.id, false, false, workspaceId);
									}
								}
							}
						})
						.catch(() => {});
				}}
				onNewTerminal={(groupId, area, options) =>
					useAppStore
						.getState()
						.addTerminal(
							workspaceId,
							undefined,
							groupId,
							area,
							true,
							undefined,
							options?.newPaneBelow === true,
						)
				}
				onGestureCanceled={() => toast.info(t("shell.workbench.gestureCanceled"))}
			/>
			{terminalClose.confirmation}
		</div>
	);
}
