import {
	RiArrowDownSLine as ChevronDown,
	RiArrowRightSLine as ChevronRight,
	RiFileCopyLine as Copy,
	RiExternalLinkLine as ExternalLink,
	RiFolderOpenLine as FolderOpen,
	RiGitBranchLine as GitBranch,
	RiHome2Line as House,
	RiLoader4Line as Loader2,
	RiMore2Line as MoreVertical,
	RiPencilLine as Pencil,
	RiAddLine as Plus,
	RiFolderFill,
	RiFolderLine,
	RiFolderOpenFill,
	RiGitBranchFill,
	RiHome2Fill,
	RiDeleteBin6Line as Trash2,
	RiCloseLine as X,
} from "@remixicon/react";
import type { EditorInfo, Project, Workspace } from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { IconButton } from "@realthing/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@realthing/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@realthing/ui/dropdown-menu";
import { LoadingRegion } from "@realthing/ui/skeleton";
import { cn } from "@realthing/ui/utils";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { copyText, platformShortcutLabel } from "@/lib";
import {
	isDefaultWorkspace,
	isExternalWorkspace,
	selectActiveWorkspaceProjectId,
	selectProjectWorkspaces,
	toast,
	useAppStore,
	workspaceName,
} from "../store";
import { errorText, getTransport } from "../transport";
import { AddProjectMenu } from "./AddProjectMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { enterDefaultWorkspace } from "./defaultWorkspace";
import { ExistingWorktreeDialog } from "./ExistingWorktreeDialog";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { RemoveWorkspaceDialog } from "./RemoveWorkspaceDialog";
import { useOpenProject } from "./useOpenProject";
import {
	canRenameProject,
	canRenameWorkspace,
	loadProjectWorkspaces,
	openWorkspaceIn,
	renameProject,
	renameWorkspace,
	revealWorkspace,
	useEditors,
	useInlineRename,
} from "./workspaceActions";

const HOVER_CONTROL_CLASS =
	"shrink-0 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

export function ProjectTree() {
	const t = useT();
	const projects = useAppStore((s) => s.projects);
	const recentProjects = useAppStore((s) => s.recentProjects);
	const selectedProjectId = useAppStore((s) => s.selectedProjectId);
	const workspaces = useAppStore((s) => s.workspaces);
	const worktreeCreations = useAppStore((s) => s.worktreeCreationsByProject);
	const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
	const protocolVersion = useAppStore((s) => s.protocolVersion);

	const editors = useEditors();

	const expandedProjectIds = useAppStore((s) => s.expandedProjectIds);
	const [dialogProjectId, setDialogProjectId] = useState<string | null>(null);
	const [existingDialogProjectId, setExistingDialogProjectId] = useState<string | null>(null);
	const addProjectButtonRef = useRef<HTMLButtonElement>(null);
	const projectNameButtonsRef = useRef(new Map<string, HTMLButtonElement>());
	const pendingCloseFocusProjectIdRef = useRef<string | null>(null);
	const workspaceDialogReturnFocusIdRef = useRef<string | null>(null);
	const existingDialogReturnFocusIdRef = useRef<string | null>(null);

	const registerProjectNameButton = useCallback(
		(projectId: string, element: HTMLButtonElement | null) => {
			if (element) projectNameButtonsRef.current.set(projectId, element);
			else projectNameButtonsRef.current.delete(projectId);
		},
		[],
	);
	const focusProjectNameOrAdd = useCallback((projectId?: string) => {
		requestAnimationFrame(() => {
			const projectButton = projectId ? projectNameButtonsRef.current.get(projectId) : undefined;
			(projectButton ?? addProjectButtonRef.current)?.focus();
		});
	}, []);

	useEffect(() => {
		const closedProjectId = pendingCloseFocusProjectIdRef.current;
		if (!closedProjectId || projects.some((project) => project.id === closedProjectId)) return;
		pendingCloseFocusProjectIdRef.current = null;
		let fallbackProjectId = projects[0]?.id;
		if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
			fallbackProjectId = selectedProjectId;
		}
		focusProjectNameOrAdd(fallbackProjectId);
	}, [focusProjectNameOrAdd, projects, selectedProjectId]);

	const activeProjectId = useAppStore(selectActiveWorkspaceProjectId);
	useEffect(() => {
		if (activeProjectId) useAppStore.getState().expandProject(activeProjectId);
	}, [activeProjectId]);

	const loadWorkspaces = useCallback(async (projectId: string) => {
		await loadProjectWorkspaces(projectId);
	}, []);

	const pendingListLoadsRef = useRef(new Set<string>());
	useEffect(() => {
		for (const project of projects) {
			if (!expandedProjectIds[project.id] || workspaces[project.id]) continue;
			if (pendingListLoadsRef.current.has(project.id)) continue;
			pendingListLoadsRef.current.add(project.id);
			void loadWorkspaces(project.id)
				.catch(() => {})
				.finally(() => pendingListLoadsRef.current.delete(project.id));
		}
	}, [projects, expandedProjectIds, workspaces, loadWorkspaces]);

	const selectProject = async (projectId: string) => {
		useAppStore.getState().selectProject(projectId, { reveal: true });
		await enterDefaultWorkspace(projectId);
	};

	const selectWorkspace = (workspace: Workspace) => {
		useAppStore.getState().activateWorkspace(workspace);
	};

	const toggleExpand = (projectId: string) => {
		const store = useAppStore.getState();
		const willExpand = !store.expandedProjectIds[projectId];
		store.toggleProjectExpanded(projectId);
		if (willExpand) void loadWorkspaces(projectId);
	};

	const { openProject, enterHostPath, startNewProject, cloneRepository, dialogs } = useOpenProject(
		async (project) => {
			useAppStore.getState().selectProject(project.id, { reveal: true });
			await enterDefaultWorkspace(project.id);
		},
	);

	const onExistingWorktreeOpened = async (workspace: Workspace) => {
		const rows = await getTransport().request("workspace.list", {
			projectId: workspace.projectId,
		});
		const attached = rows.find((candidate) => candidate.id === workspace.id);
		if (!attached) throw new Error(t("panels.projectTree.attachedWorktreeMissing"));
		const store = useAppStore.getState();
		store.expandProject(workspace.projectId);
		store.setWorkspaces(workspace.projectId, rows);
		store.activateWorkspace(attached);
	};

	const closeProject = (project: Project) => {
		pendingCloseFocusProjectIdRef.current = project.id;
		void getTransport()
			.request("project.close", { id: project.id })
			.catch((err) => {
				if (pendingCloseFocusProjectIdRef.current === project.id) {
					pendingCloseFocusProjectIdRef.current = null;
				}
				focusProjectNameOrAdd(project.id);
				toast.error(errorText(err, t("panels.projectTree.closeFailed", { name: project.name })));
			});
	};

	const openWorkspaceDialog = (projectId: string, returnFocusToProject: boolean) => {
		workspaceDialogReturnFocusIdRef.current = returnFocusToProject ? projectId : null;
		setDialogProjectId(projectId);
	};

	const openExistingWorktreeDialog = (projectId: string) => {
		existingDialogReturnFocusIdRef.current = projectId;
		setExistingDialogProjectId(projectId);
	};

	return (
		<nav data-testid="project-tree" className="flex flex-col gap-4">
			<header className="flex h-panel-row items-center justify-between pr-4 pl-8">
				<span className="tr-text-eyebrow text-text-muted">{t("panels.projectTree.title")}</span>
				<AddProjectMenu
					recentProjects={recentProjects}
					onOpen={enterHostPath}
					onEnterHostPath={enterHostPath}
					onClone={cloneRepository}
					onOpenRecent={(p) => void openProject(p)}
					onStartNew={startNewProject}
				>
					<IconButton
						ref={addProjectButtonRef}
						icon={Plus}
						label={t("panels.projectTree.addProject")}
						variant="ghost"
						size="s"
						data-testid="add-project-menu"
					/>
				</AddProjectMenu>
			</header>

			<ul className="flex flex-col">
				{projects.map((project) => {
					const isExpanded = expandedProjectIds[project.id] === true;
					const list = workspaces[project.id];
					return (
						<li key={project.id}>
							<ProjectRow
								project={project}
								isSelected={selectedProjectId === project.id}
								isExpanded={isExpanded}
								workspaceCount={(list ?? []).filter((w) => !isDefaultWorkspace(w)).length}
								onToggle={() => toggleExpand(project.id)}
								onSelect={() => void selectProject(project.id)}
								canRename={canRenameProject(protocolVersion)}
								onRename={(name) => renameProject(project, name)}
								onClose={() => closeProject(project)}
								onAddWorkspace={() => openWorkspaceDialog(project.id, false)}
								onAddWorkspaceFromMenu={() => openWorkspaceDialog(project.id, true)}
								onOpenExistingWorktree={() => openExistingWorktreeDialog(project.id)}
								onRegisterNameButton={(element) => registerProjectNameButton(project.id, element)}
								onRestoreFocus={() => focusProjectNameOrAdd(project.id)}
							/>
							{isExpanded && list === undefined && (
								<LoadingRegion rows={2} className="py-4 pr-8 pl-16" />
							)}
							{isExpanded && list !== undefined && (
								<ul className="mt-2 flex flex-col gap-2 motion-safe:animate-reveal">
									{selectProjectWorkspaces(workspaces, project.id).map((ws) => (
										<WorkspaceRow
											key={ws.id}
											workspace={ws}
											isActive={activeWorkspaceId === ws.id}
											canRename={canRenameWorkspace(protocolVersion, ws)}
											editors={editors}
											onSelect={() => selectWorkspace(ws)}
											onOpenIn={(editor) => openWorkspaceIn(ws, editor)}
											onCopyPath={() => void copyText(ws.worktreePath)}
											onReveal={() => revealWorkspace(ws)}
											onRename={(name) => renameWorkspace(ws, name)}
										/>
									))}
								</ul>
							)}
							{isExpanded && (worktreeCreations[project.id] ?? 0) > 0 && (
								<div
									data-testid="worktree-creating-row"
									className="flex items-center gap-8 py-4 pr-8 pl-16 tr-text-ui text-text-muted"
								>
									<Loader2 className="size-14 shrink-0 animate-spin motion-reduce:animate-none" />
									{t("panels.projectTree.creatingWorktree")}
								</div>
							)}
						</li>
					);
				})}
			</ul>

			{dialogProjectId !== null ? (
				<NewWorkspaceDialog
					open
					projectId={dialogProjectId}
					onOpenChange={(o) => {
						if (o) return;
						setDialogProjectId(null);
						const returnFocusId = workspaceDialogReturnFocusIdRef.current;
						workspaceDialogReturnFocusIdRef.current = null;
						if (returnFocusId) focusProjectNameOrAdd(returnFocusId);
					}}
				/>
			) : null}

			{existingDialogProjectId !== null ? (
				<ExistingWorktreeDialog
					open
					projectId={existingDialogProjectId}
					onOpenChange={(isOpen) => {
						if (isOpen) return;
						setExistingDialogProjectId(null);
						const returnFocusId = existingDialogReturnFocusIdRef.current;
						existingDialogReturnFocusIdRef.current = null;
						if (returnFocusId) focusProjectNameOrAdd(returnFocusId);
					}}
					onOpened={onExistingWorktreeOpened}
				/>
			) : null}

			{dialogs}
		</nav>
	);
}

function ProjectRow({
	project,
	isSelected,
	isExpanded,
	workspaceCount,
	onToggle,
	onSelect,
	canRename,
	onRename,
	onClose,
	onAddWorkspace,
	onAddWorkspaceFromMenu,
	onOpenExistingWorktree,
	onRegisterNameButton,
	onRestoreFocus,
}: {
	project: Project;
	isSelected: boolean;
	isExpanded: boolean;
	workspaceCount: number;
	onToggle: () => void;
	onSelect: () => void;
	canRename: boolean;
	onRename: (name: string) => void;
	onClose: () => void;
	onAddWorkspace: () => void;
	onAddWorkspaceFromMenu: () => void;
	onOpenExistingWorktree: () => void;
	onRegisterNameButton: (element: HTMLButtonElement | null) => void;
	onRestoreFocus: () => void;
}) {
	const t = useT();
	const createWorkspaceLabel = t("panels.projectTree.createWorkspaceShortcut", {
		shortcut: platformShortcutLabel("N"),
		altShortcut: platformShortcutLabel("N", { alt: true }),
	});
	const Chevron = isExpanded ? ChevronDown : ChevronRight;
	const Folder = isSelected ? RiFolderFill : RiFolderLine;
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const openingDialogRef = useRef(false);
	const closeConfirmedRef = useRef(false);
	const {
		editing,
		nameRef,
		start: startRename,
		inputProps: renameInputProps,
	} = useInlineRename({
		target: project,
		canRename,
		onRename: (_target, name) => onRename(name),
	});
	const folderIcon = (
		<Folder className={`size-14 shrink-0 ${isSelected ? "text-primary" : "text-text-muted"}`} />
	);
	const nameClass = `truncate tr-text-ui ${isSelected ? "text-text-default" : "text-text-muted"}`;
	const openDialogAfterMenu = (openDialog: () => void) => {
		openingDialogRef.current = true;
		setMenuOpen(false);
		requestAnimationFrame(openDialog);
	};
	const row = (
		<div
			data-testid="project-item"
			data-row
			data-menu-open={menuOpen}
			className={`group flex h-panel-row items-center gap-4 rounded-sm pr-4 pl-4 transition-colors ${
				menuOpen ? "bg-control-bg-selected" : "hover:bg-control-bg-hovered"
			}`}
		>
			<button
				type="button"
				data-testid="project-expand"
				aria-label={
					isExpanded
						? t("panels.projectTree.collapseProject")
						: t("panels.projectTree.expandProject")
				}
				onClick={onToggle}
				className="flex size-16 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:text-text-default focus-visible:text-text-default"
				data-expanded={isExpanded}
			>
				<Chevron className="size-16" />
			</button>
			{editing ? (
				<div className="flex min-w-0 flex-1 items-center gap-4">
					{folderIcon}
					<input
						ref={nameRef}
						data-testid="project-name-input"
						type="text"
						spellCheck={false}
						aria-label={t("panels.projectTree.projectName")}
						defaultValue={project.name}
						{...renameInputProps}
						className={cn("w-full min-w-0 border-0 bg-transparent p-0 outline-none", nameClass)}
					/>
				</div>
			) : (
				<button
					ref={onRegisterNameButton}
					type="button"
					data-testid="project-name"
					onClick={onSelect}
					className="flex min-w-0 flex-1 items-center gap-4 text-left"
				>
					{folderIcon}
					<span className={nameClass}>{project.name}</span>
				</button>
			)}
			{!isExpanded && workspaceCount > 0 && (
				<span
					data-testid="project-workspace-count"
					className="shrink-0 tr-text-metadata text-text-muted"
				>
					{workspaceCount}
				</span>
			)}
			<IconButton
				icon={Plus}
				label={createWorkspaceLabel}
				variant="ghost"
				size="s"
				className="shrink-0"
				data-testid="add-workspace"
				onClick={onAddWorkspace}
			/>
		</div>
	);
	return (
		<>
			<ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<ContextMenuTrigger
					asChild
					onKeyDown={(event) => {
						if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
						event.preventDefault();
						const rect = event.currentTarget.getBoundingClientRect();
						event.currentTarget.dispatchEvent(
							new MouseEvent("contextmenu", {
								bubbles: true,
								clientX: rect.left,
								clientY: rect.bottom,
							}),
						);
					}}
				>
					{row}
				</ContextMenuTrigger>
				<ContextMenuContent
					data-testid="project-actions"
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						if (!openingDialogRef.current) onRestoreFocus();
						openingDialogRef.current = false;
					}}
				>
					<ContextMenuItem
						data-testid="project-menu-create-workspace"
						onSelect={(event) => {
							event.preventDefault();
							openDialogAfterMenu(onAddWorkspaceFromMenu);
						}}
					>
						<Plus />
						{t("panels.projectTree.createWorkspace")}
					</ContextMenuItem>
					<ContextMenuItem
						data-testid="project-menu-open-existing-worktree"
						onSelect={(event) => {
							event.preventDefault();
							openDialogAfterMenu(onOpenExistingWorktree);
						}}
					>
						<FolderOpen />
						{t("panels.projectTree.openExistingWorktree")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					{canRename ? (
						<ContextMenuItem
							data-testid="project-menu-rename"
							onSelect={() => {
								openingDialogRef.current = true;
								startRename();
							}}
						>
							<Pencil />
							{t("common.rename")}
						</ContextMenuItem>
					) : null}
					<ContextMenuItem
						data-testid="project-menu-close"
						onSelect={(event) => {
							event.preventDefault();
							openDialogAfterMenu(() => setConfirmOpen(true));
						}}
					>
						<X />
						{t("panels.projectTree.closeProject")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title={t("panels.projectTree.closeTitle", { name: project.name })}
				description={t("panels.projectTree.closeDescription")}
				confirmLabel={t("panels.projectTree.closeProject")}
				confirmTestId="confirm-close-project"
				onConfirm={() => {
					closeConfirmedRef.current = true;
					onClose();
				}}
				onClosedAutoFocus={() => {
					if (!closeConfirmedRef.current) onRestoreFocus();
					closeConfirmedRef.current = false;
				}}
			/>
		</>
	);
}

function WorkspaceRow({
	workspace,
	isActive,
	canRename,
	editors,
	onSelect,
	onOpenIn,
	onCopyPath,
	onReveal,
	onRename,
}: {
	workspace: Workspace;
	isActive: boolean;
	canRename: boolean;
	editors: EditorInfo[];
	onSelect: () => void;
	onOpenIn: (editor: EditorInfo) => void;
	onCopyPath: () => void;
	onReveal: () => void;
	onRename: (name: string) => void;
}) {
	const t = useT();
	const isDefault = isDefaultWorkspace(workspace);
	const isExternal = isExternalWorkspace(workspace);
	const Icon = isActive
		? isDefault
			? RiHome2Fill
			: isExternal
				? RiFolderOpenFill
				: RiGitBranchFill
		: isDefault
			? House
			: isExternal
				? FolderOpen
				: GitBranch;
	const isTwoLine = workspace.branch !== workspace.name;
	const displayName = workspaceName(t, workspace);
	const [menuOpen, setMenuOpen] = useState(false);
	const openMenuFromContext = (event: MouseEvent) => {
		event.preventDefault();
		setMenuOpen(true);
	};
	const [confirmOpen, setConfirmOpen] = useState(false);
	const {
		editing,
		nameRef,
		start: startRename,
		inputProps: renameInputProps,
		onMenuCloseAutoFocus,
	} = useInlineRename({
		target: workspace,
		canRename,
		onRename: (_target, name) => onRename(name),
	});

	const identityClass = `flex min-w-0 flex-1 gap-4 text-left ${isTwoLine ? "items-start" : "items-center"}`;
	const identityIcon = (
		<Icon
			className={`${isTwoLine ? "mt-2 " : ""}size-14 shrink-0 ${isActive ? "text-primary" : "text-text-muted"}`}
		/>
	);
	const branchLabel = isTwoLine ? (
		<span
			data-testid="workspace-branch"
			className="truncate text-text-subtle tr-text-metadata leading-tight"
		>
			{workspace.branch}
		</span>
	) : null;

	return (
		<li>
			<fieldset
				aria-label={displayName}
				data-testid="workspace-item"
				data-row
				data-active={isActive}
				data-kind={workspace.kind ?? "worktree"}
				onContextMenu={openMenuFromContext}
				className={cn(
					"group relative flex min-h-panel-row min-w-0 items-center gap-8 rounded-sm border-0 py-2 pr-4 pl-24 transition-colors",
					isActive || menuOpen ? "bg-control-bg-selected" : "hover:bg-control-bg-hovered",
				)}
			>
				{editing ? (
					<div className={identityClass}>
						{identityIcon}
						<span className="flex min-w-0 flex-1 flex-col">
							<input
								ref={nameRef}
								data-testid="workspace-name"
								data-editing
								type="text"
								spellCheck={false}
								aria-label={t("panels.projectTree.workspaceName")}
								defaultValue={workspace.name}
								{...renameInputProps}
								className={`w-full min-w-0 truncate border-0 bg-transparent p-0 tr-text-ui leading-tight outline-none ${isActive ? "text-primary" : "text-text-muted"}`}
							/>
							{branchLabel}
						</span>
					</div>
				) : (
					<button type="button" onClick={onSelect} className={identityClass}>
						{identityIcon}
						<span className="flex min-w-0 flex-1 flex-col">
							<span
								data-testid="workspace-name"
								className={`truncate tr-text-ui leading-tight ${isActive ? "text-primary" : "text-text-muted"}`}
							>
								{displayName}
							</span>
							{branchLabel}
						</span>
					</button>
				)}
				<span className="flex shrink-0 items-center gap-4">
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>
							<IconButton
								icon={MoreVertical}
								label={t("panels.projectTree.workspaceActions", { name: displayName })}
								variant="ghost"
								size="s"
								data-testid="workspace-menu"
								className={HOVER_CONTROL_CLASS}
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							data-testid="workspace-actions"
							onCloseAutoFocus={onMenuCloseAutoFocus}
						>
							{editors.length > 0 && (
								<DropdownMenuSub>
									<DropdownMenuSubTrigger data-testid="workspace-open-in">
										<ExternalLink />
										{t("panels.projectTree.openIn")}
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										{editors.map((editor) => (
											<DropdownMenuItem
												key={editor.id}
												data-testid="workspace-open-in-editor"
												onSelect={() => onOpenIn(editor)}
											>
												{editor.label}
											</DropdownMenuItem>
										))}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							)}
							{canRename ? (
								<DropdownMenuItem data-testid="workspace-rename" onSelect={startRename}>
									<Pencil />
									{t("common.rename")}
								</DropdownMenuItem>
							) : null}
							<DropdownMenuItem data-testid="workspace-copy-path" onSelect={onCopyPath}>
								<Copy />
								{t("panels.projectTree.copyPath")}
							</DropdownMenuItem>
							<DropdownMenuItem data-testid="workspace-reveal" onSelect={onReveal}>
								<FolderOpen />
								{t("panels.projectTree.reveal")}
							</DropdownMenuItem>
							{!isDefault && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										data-testid="workspace-remove"
										className="text-feedback-error focus:bg-feedback-error-subtle [&_svg]:text-feedback-error"
										onSelect={(event) => {
											event.preventDefault();
											setConfirmOpen(true);
										}}
									>
										<Trash2 />
										{isExternal
											? t("panels.projectTree.removeExternal")
											: t("panels.projectTree.removeWorkspace")}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</span>
			</fieldset>

			{!isDefault && (
				<RemoveWorkspaceDialog
					workspace={workspace}
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
				/>
			)}
		</li>
	);
}
