import {
	RiBox3Line as Box,
	RiArrowDownSLine as ChevronDown,
	RiFolderOpenLine as FolderOpen,
	RiGitBranchLine as GitBranch,
	RiHome2Line as House,
	type RemixiconComponentType as LucideIcon,
} from "@remixicon/react";
import type { ExistingWorktreeCandidate, Workspace } from "@realthing/contracts";
import { i18n, useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@realthing/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@realthing/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@realthing/ui/popover";
import { cn } from "@realthing/ui/utils";
import { useEffect, useId, useState } from "react";
import { toast, useAppStore } from "@/store";
import { errorText, getTransport } from "@/transport";
import { BranchPicker } from "./BranchPicker";
import { useBranchList } from "./branches";
import { enterDefaultWorkspace } from "./defaultWorkspace";

type WorkspaceTarget = "worktree" | "default";

interface FolderOption {
	path: string;
	name: string;
	branch?: string;
}

const PILL =
	"flex h-32 min-w-0 items-center gap-8 rounded-sm border border-control-border-default bg-clip-padding bg-control-bg px-8 tr-text-ui text-text-default outline-none transition-colors hover:bg-control-bg-hovered focus-visible:ring-2 focus-visible:ring-primary data-[open=true]:border-control-border-active data-[open=true]:bg-control-bg-selected";

function relativeFolderName(projectPath: string | undefined, targetPath: string): string {
	const normTarget = targetPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (projectPath) {
		const normProject = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
		if (normTarget.startsWith(`${normProject}/`)) {
			return normTarget.slice(normProject.length + 1);
		}
	}
	const lastSlash = normTarget.lastIndexOf("/");
	return lastSlash >= 0 ? normTarget.slice(lastSlash + 1) : normTarget;
}

function buildFolderOptions(
	defaultLabel: string,
	projectPath: string | undefined,
	projectWorkspaces: Workspace[] | undefined,
	existingCandidates: ExistingWorktreeCandidate[],
): FolderOption[] {
	const options: FolderOption[] = [{ path: "", name: defaultLabel }];
	const seen = new Set<string>();
	if (projectWorkspaces) {
		for (const ws of projectWorkspaces) {
			if (ws.kind !== "external" || seen.has(ws.worktreePath)) continue;
			seen.add(ws.worktreePath);
			options.push({
				path: ws.worktreePath,
				name: ws.name,
				branch: ws.branch,
			});
		}
	}
	for (const candidate of existingCandidates) {
		if (candidate.status !== "available" || seen.has(candidate.path)) continue;
		seen.add(candidate.path);
		options.push({
			path: candidate.path,
			name: relativeFolderName(projectPath, candidate.path),
			branch: candidate.branch,
		});
	}
	return options;
}

async function refreshProjectWorkspaces(projectId: string): Promise<void> {
	useAppStore.getState().expandProject(projectId);
	const rows = await getTransport().request("workspace.list", { projectId });
	useAppStore.getState().setWorkspaces(projectId, rows);
}

export function NewWorkspaceDialog({
	open,
	projectId,
	onOpenChange,
}: {
	open: boolean;
	projectId: string;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();
	const projects = useAppStore((s) => s.projects);
	const workspacesByProject = useAppStore((s) => s.workspaces);

	const [selectedProjectId, setSelectedProjectId] = useState(projectId);
	const [target, setTarget] = useState<WorkspaceTarget>("worktree");
	const [baseRef, setBaseRef] = useState<string>("");
	const [selectedFolderPath, setSelectedFolderPath] = useState<string>("");
	const [existingCandidates, setExistingCandidates] = useState<ExistingWorktreeCandidate[]>([]);
	const [creating, setCreating] = useState(false);
	const targetGroupName = useId();
	const [dialogEl, setDialogEl] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;
		setSelectedProjectId(projectId);
		setTarget("worktree");
		setSelectedFolderPath("");
		setCreating(false);
	}, [open, projectId]);

	useEffect(() => {
		if (!open) return;
		setSelectedFolderPath("");
		let cancelled = false;
		void getTransport()
			.request("workspace.listExisting", { projectId: selectedProjectId })
			.then((rows) => {
				if (!cancelled) setExistingCandidates(rows);
			})
			.catch(() => {
				if (!cancelled) setExistingCandidates([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open, selectedProjectId]);

	useEffect(() => {
		if (!open) return;
		if (projects.some((p) => p.id === selectedProjectId)) return;
		onOpenChange(false);
		toast.info(i18n.t("panels.newWorkspace.projectClosed"));
	}, [open, projects, selectedProjectId, onOpenChange]);

	const prefetchBase = (ref: string) => {
		if (!ref) return;
		getTransport()
			.request("git.prefetch", { projectId: selectedProjectId, ref })
			.catch(() => {});
	};

	const selectBaseRef = (ref: string) => {
		setBaseRef(ref);
		if (branches?.remote.includes(ref)) prefetchBase(ref);
	};

	const {
		branches,
		failed: branchesFailed,
		refreshing,
		refresh: refreshBranches,
	} = useBranchList(open ? selectedProjectId : null, (list) => {
		setBaseRef(list.defaultBranch);
		prefetchBase(list.defaultBranch);
	});
	const submitEnabled = !creating;
	const selectedProject = projects.find((p) => p.id === selectedProjectId);
	const projectWorkspaces = workspacesByProject[selectedProjectId];
	const folderOptions = buildFolderOptions(
		t("panels.newWorkspace.defaultFolderOption"),
		selectedProject?.path,
		projectWorkspaces,
		existingCandidates,
	);

	const create = async () => {
		if (!submitEnabled) return;
		setCreating(true);
		let workspace: Workspace;
		if (target === "default") {
			if (selectedFolderPath) {
				const existingWs = projectWorkspaces?.find((ws) => ws.worktreePath === selectedFolderPath);
				if (existingWs) {
					workspace = existingWs;
				} else {
					const opened = await getTransport()
						.request("workspace.openExisting", {
							projectId: selectedProjectId,
							path: selectedFolderPath,
						})
						.catch((err: unknown) => {
							toast.error(errorText(err), t("panels.newWorkspace.createFailed"));
							setCreating(false);
							return null;
						});
					if (!opened) return;
					workspace = opened;
				}
				void refreshProjectWorkspaces(workspace.projectId).catch(() => {});
				useAppStore.getState().activateWorkspace(workspace);
				onOpenChange(false);
				return;
			}
			const def = await enterDefaultWorkspace(selectedProjectId);
			if (!def) {
				setCreating(false);
				return;
			}
			workspace = def;
		} else {
			useAppStore.getState().beginWorktreeCreation(selectedProjectId);
			const createWorktree = async () =>
				getTransport().request("workspace.create", {
					projectId: selectedProjectId,
					...(baseRef ? { baseRef } : {}),
				});
			const created = await createWorktree()
				.catch((err: unknown) => {
					toast.error(errorText(err), t("panels.newWorkspace.createFailed"));
					setCreating(false);
					return null;
				})
				.finally(() => useAppStore.getState().endWorktreeCreation(selectedProjectId));
			if (!created) return;
			workspace = created;
		}

		const store = useAppStore.getState();
		if (target === "worktree") {
			void refreshProjectWorkspaces(workspace.projectId).catch(() => {});
			store.activateWorkspace(workspace);
		}
		onOpenChange(false);
	};

	const isolated = target === "worktree";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				ref={setDialogEl}
				hideClose
				data-testid="new-workspace-dialog"
				className="max-w-[600px] gap-12 p-12"
			>
				<DialogHeader>
					<DialogTitle>
						{isolated
							? t("panels.newWorkspace.titleIsolated")
							: t("panels.newWorkspace.titleDefault")}
					</DialogTitle>
					<DialogDescription>
						{isolated
							? t("panels.newWorkspace.descriptionIsolated")
							: t("panels.newWorkspace.descriptionDefault")}
					</DialogDescription>
				</DialogHeader>

				<fieldset
					data-testid="ws-target"
					className="flex w-fit items-center gap-2 rounded-md border border-control-border-default bg-control-bg p-2"
				>
					<legend className="sr-only">{t("panels.newWorkspace.targetLegend")}</legend>
					<TargetOption
						icon={GitBranch}
						label={t("panels.newWorkspace.targetIsolated")}
						name={targetGroupName}
						active={isolated}
						testid="ws-target-worktree"
						onSelect={() => setTarget("worktree")}
					/>
					<TargetOption
						icon={House}
						label={t("panels.newWorkspace.targetDefault")}
						name={targetGroupName}
						active={!isolated}
						testid="ws-target-default"
						onSelect={() => setTarget("default")}
					/>
				</fieldset>

				<div className="flex flex-wrap items-center gap-8">
					<ProjectPicker
						projects={projects}
						current={selectedProject?.name ?? t("panels.newWorkspace.projectFallback")}
						container={dialogEl}
						onSelect={setSelectedProjectId}
					/>
					{isolated ? (
						<BranchPicker
							branches={branches}
							failed={branchesFailed}
							selected={baseRef}
							label={t("panels.newWorkspace.baseLabel")}
							testid="ws-branch-picker"
							triggerClassName={`${PILL} max-w-[220px]`}
							refreshing={refreshing}
							container={dialogEl}
							onSelect={selectBaseRef}
							onRefresh={refreshBranches}
						/>
					) : (
						<FolderPicker
							options={folderOptions}
							selectedPath={selectedFolderPath}
							container={dialogEl}
							onSelect={setSelectedFolderPath}
						/>
					)}
				</div>

				<div className="flex flex-wrap items-center justify-end gap-8">
					<Button
						variant="primary"
						size="l"
						data-testid="create-workspace"
						disabled={!submitEnabled}
						loading={creating}
						onClick={() => void create()}
						className="shrink-0"
					>
						{creating ? (
							isolated ? (
								t("panels.newWorkspace.creating")
							) : (
								t("panels.newWorkspace.starting")
							)
						) : (
							<>
								{isolated ? t("panels.newWorkspace.create") : t("panels.newWorkspace.start")}
								<span className="inline-flex h-16 min-w-16 items-center justify-center rounded-sm bg-on-primary-soft px-4 tr-code-text">
									↵
								</span>
							</>
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function TargetOption({
	icon: Icon,
	label,
	name,
	active,
	testid,
	onSelect,
}: {
	icon: LucideIcon;
	label: string;
	name: string;
	active: boolean;
	testid: string;
	onSelect: () => void;
}) {
	return (
		<label
			data-testid={testid}
			data-active={active}
			className={cn(
				"flex h-28 cursor-pointer items-center gap-8 rounded-sm px-12 tr-text-ui transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
				active ? "bg-primary-subtle text-primary" : "text-text-muted hover:text-text-default",
			)}
		>
			<input type="radio" name={name} className="sr-only" checked={active} onChange={onSelect} />
			<Icon className="size-14 shrink-0" />
			{label}
		</label>
	);
}

function ProjectPicker({
	projects,
	current,
	container,
	onSelect,
}: {
	projects: { id: string; name: string }[];
	current: string;
	container: HTMLElement | null;
	onSelect: (projectId: string) => void;
}) {
	const t = useT();
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				data-testid="ws-project-picker"
				data-open={open}
				className={`${PILL} max-w-[180px]`}
			>
				<span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-primary">
					<Box className="size-12 text-text-on-primary" />
				</span>
				<span className="truncate">{current}</span>
				<ChevronDown className="size-16 shrink-0 text-text-muted" />
			</PopoverTrigger>
			<PopoverContent align="start" container={container} className="w-[280px] p-0">
				<Command>
					<CommandInput placeholder={t("panels.newWorkspace.searchProjects")} />
					<CommandList>
						<CommandEmpty>{t("panels.newWorkspace.noProjects")}</CommandEmpty>
						<CommandGroup>
							{projects.map((p) => (
								<CommandItem
									key={p.id}
									value={p.name}
									data-testid="ws-project-option"
									onSelect={() => {
										onSelect(p.id);
										setOpen(false);
									}}
								>
									<Box className="size-14 shrink-0 text-text-muted" />
									<span className="truncate">{p.name}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function FolderPicker({
	options,
	selectedPath,
	container,
	onSelect,
}: {
	options: FolderOption[];
	selectedPath: string;
	container: HTMLElement | null;
	onSelect: (path: string) => void;
}) {
	const t = useT();
	const [open, setOpen] = useState(false);
	const current = options.find((opt) => opt.path === selectedPath) ??
		options[0] ?? { path: "", name: t("panels.newWorkspace.defaultFolderOption") };
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				data-testid="ws-folder-picker"
				data-open={open}
				className={`${PILL} max-w-[220px]`}
			>
				<FolderOpen className="size-14 shrink-0 text-primary" />
				<span className="shrink-0 text-text-muted">{t("panels.newWorkspace.folderLabel")}</span>
				<span className="truncate">{current.name}</span>
				<ChevronDown className="size-16 shrink-0 text-text-muted" />
			</PopoverTrigger>
			<PopoverContent align="start" container={container} className="w-[280px] p-0">
				<Command>
					<CommandInput placeholder={t("panels.newWorkspace.searchFolders")} />
					<CommandList>
						<CommandEmpty>{t("panels.newWorkspace.noFolders")}</CommandEmpty>
						<CommandGroup>
							{options.map((opt) => (
								<CommandItem
									key={opt.path || "__default__"}
									value={`${opt.name} ${opt.branch ?? ""}`}
									data-testid="ws-folder-option"
									onSelect={() => {
										onSelect(opt.path);
										setOpen(false);
									}}
								>
									{opt.path ? (
										<GitBranch className="size-14 shrink-0 text-primary" />
									) : (
										<House className="size-14 shrink-0 text-text-muted" />
									)}
									<span className="min-w-0 flex-1 truncate">{opt.name}</span>
									{opt.branch ? (
										<span className="shrink-0 text-text-subtle tr-text-caption">{opt.branch}</span>
									) : null}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
