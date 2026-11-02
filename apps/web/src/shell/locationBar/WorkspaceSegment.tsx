import {
	RiFileCopyLine as Copy,
	RiExternalLinkLine as ExternalLink,
	RiFolderOpenLine as FolderOpen,
	RiGitBranchLine as GitBranch,
	RiHome2Line as House,
	RiPencilLine as Pencil,
	RiAddLine as Plus,
	RiDeleteBin6Line as Trash2,
} from "@remixicon/react";
import type { Project, Workspace } from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@realthing/ui/dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import { copyText, platformShortcutLabel } from "../../lib";
import { RemoveWorkspaceDialog } from "../../panels/RemoveWorkspaceDialog";
import {
	canRenameWorkspace,
	loadProjectWorkspaces,
	openWorkspaceIn,
	renameWorkspace,
	revealWorkspace,
	useEditors,
	useInlineRename,
} from "../../panels/workspaceActions";
import {
	isDefaultWorkspace,
	isExternalWorkspace,
	selectProjectWorkspaces,
	useAppStore,
	workspaceName,
} from "../../store";
import { PillChevron, pillClass, Segment } from "./Segment";

export function WorkspaceSegment({
	project,
	workspace,
	onNewWorkspace,
}: {
	project: Project;
	workspace: Workspace | null;
	onNewWorkspace: () => void;
}) {
	const t = useT();
	const [menuOpen, setMenuOpen] = useState(false);
	const siblings = useAppStore((s) => s.workspaces[project.id]);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	const editors = useEditors();
	const [removing, setRemoving] = useState<Workspace | null>(null);
	const workspaceId = workspace?.id ?? null;
	useEffect(() => {
		setRemoving((current) => (current && current.id !== workspaceId ? null : current));
	}, [workspaceId]);

	useEffect(() => {
		if (!menuOpen || siblings !== undefined) return;
		void loadProjectWorkspaces(project.id).catch(() => {});
	}, [menuOpen, project.id, siblings]);

	const canRename = workspace !== null && canRenameWorkspace(protocolVersion, workspace);
	const isDefault = workspace !== null && isDefaultWorkspace(workspace);
	const isExternal = workspace !== null && isExternalWorkspace(workspace);
	const name = workspace ? workspaceName(t, workspace) : t("shell.location.project.home");
	const {
		editing,
		nameRef,
		start: startRename,
		inputProps: renameInputProps,
		onMenuCloseAutoFocus,
	} = useInlineRename({ target: workspace, canRename, onRename: renameWorkspace });

	const otherWorkspaces = useMemo(() => {
		if (!menuOpen || siblings === undefined) return null;
		return selectProjectWorkspaces({ [project.id]: siblings }, project.id).filter(
			(candidate) => candidate.id !== workspace?.id,
		);
	}, [menuOpen, siblings, project.id, workspace?.id]);

	return (
		<Segment
			caption={t("shell.location.workspace.caption")}
			testid="scope-workspace-segment"
			className="min-w-64 max-w-[460px] pl-0 sm:pl-8"
		>
			{editing && workspace ? (
				<input
					ref={nameRef}
					data-testid="scope-name"
					data-editing
					type="text"
					spellCheck={false}
					aria-label={t("shell.location.workspace.nameInput")}
					defaultValue={workspace.name}
					{...renameInputProps}
					className="window-no-drag h-20 w-full min-w-0 truncate rounded-sm border-0 bg-control-bg px-8 text-text-default tr-title-section outline-none ring-1 ring-control-border-active"
				/>
			) : (
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger
						data-testid="scope-workspace"
						aria-label={t("shell.location.workspace.label", { name })}
						className={pillClass}
					>
						<span data-testid="scope-name" className="truncate tr-title-section">
							{name}
						</span>
						<PillChevron className="hidden sm:block" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						data-testid="scope-workspace-menu"
						onCloseAutoFocus={onMenuCloseAutoFocus}
					>
						{workspace ? (
							<>
								<DropdownMenuLabel className="truncate">
									{workspaceName(t, workspace)}
								</DropdownMenuLabel>
								{editors.length > 0 ? (
									<DropdownMenuSub>
										<DropdownMenuSubTrigger data-testid="scope-workspace-open-in">
											<ExternalLink />
											{t("shell.location.workspace.openIn")}
										</DropdownMenuSubTrigger>
										<DropdownMenuSubContent>
											{editors.map((editor) => (
												<DropdownMenuItem
													key={editor.id}
													data-testid="scope-workspace-open-in-editor"
													onSelect={() => openWorkspaceIn(workspace, editor)}
												>
													{editor.label}
												</DropdownMenuItem>
											))}
										</DropdownMenuSubContent>
									</DropdownMenuSub>
								) : null}
								{canRename ? (
									<DropdownMenuItem data-testid="scope-workspace-rename" onSelect={startRename}>
										<Pencil />
										{t("common.rename")}
									</DropdownMenuItem>
								) : null}
								<DropdownMenuItem
									data-testid="scope-workspace-copy-path"
									onSelect={() => void copyText(workspace.worktreePath)}
								>
									<Copy />
									{t("shell.location.workspace.copyPath")}
								</DropdownMenuItem>
								<DropdownMenuItem
									data-testid="scope-workspace-reveal"
									onSelect={() => revealWorkspace(workspace)}
								>
									<FolderOpen />
									{t("shell.location.workspace.reveal")}
								</DropdownMenuItem>
								{isDefault ? null : (
									<DropdownMenuItem
										data-testid="scope-workspace-remove"
										className="text-feedback-error focus:bg-feedback-error-subtle [&_svg]:text-feedback-error"
										onSelect={() => setRemoving(workspace)}
									>
										<Trash2 />
										{isExternal
											? t("shell.location.workspace.removeExternal")
											: t("shell.location.workspace.remove")}
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
							</>
						) : null}
						<DropdownMenuLabel>{t("shell.location.workspace.switchTo")}</DropdownMenuLabel>
						{otherWorkspaces === null ? (
							<DropdownMenuItem disabled>{t("common.loading")}</DropdownMenuItem>
						) : otherWorkspaces.length === 0 ? (
							<DropdownMenuItem disabled>{t("shell.location.workspace.noOthers")}</DropdownMenuItem>
						) : (
							otherWorkspaces.map((candidate) => {
								const Icon = isDefaultWorkspace(candidate)
									? House
									: isExternalWorkspace(candidate)
										? FolderOpen
										: GitBranch;
								return (
									<DropdownMenuItem
										key={candidate.id}
										data-testid="scope-workspace-option"
										onSelect={() => useAppStore.getState().activateWorkspace(candidate)}
									>
										<Icon />
										<span className="truncate">{workspaceName(t, candidate)}</span>
										{candidate.branch !== candidate.name ? (
											<span className="ml-auto truncate pl-8 text-text-subtle tr-code-text-small">
												{candidate.branch}
											</span>
										) : null}
									</DropdownMenuItem>
								);
							})
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem data-testid="scope-workspace-new" onSelect={onNewWorkspace}>
							<Plus />
							{t("shell.location.workspace.new")}
							<span className="ml-auto pl-8 text-text-subtle tr-text-metadata">
								{platformShortcutLabel("N")}
							</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{removing ? (
				<RemoveWorkspaceDialog
					workspace={removing}
					open
					onOpenChange={(open) => {
						if (!open) setRemoving(null);
					}}
				/>
			) : null}
		</Segment>
	);
}
