import {
	RiGitBranchLine as GitBranch,
	RiCheckboxBlankLine,
	RiCheckboxFill,
} from "@remixicon/react";
import type { PathCandidate, Project } from "@realthing/contracts";
import { T, useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@realthing/ui/dialog";
import { cn } from "@realthing/ui/utils";
import { type ReactNode, useState } from "react";
import { selectSupportsProjectClone, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { CloneProjectDialog } from "./CloneProjectDialog";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { createLatestOperation } from "./latestOperation";
import { NoticeDialog } from "./NoticeDialog";
import { OpenProjectPathDialog } from "./OpenProjectPathDialog";

const PICK_TIMEOUT_MS = 30 * 60_000;
const projectOpenIntents = createLatestOperation();

export type OpenedProjectIntent = { setup: boolean };

interface NonGitProjectTarget {
	path: string;
	gitFolders: PathCandidate[];
	selectedPaths: string[];
}

export function useOpenProject(
	onOpened: (project: Project, intent: OpenedProjectIntent) => void | Promise<void>,
): {
	openProject: (rawPath: string) => Promise<void>;
	pickAndOpen: () => Promise<void>;
	enterHostPath: () => void;
	startNewProject: () => void;
	cloneRepository: (() => void) | undefined;
	dialogs: ReactNode;
} {
	const t = useT();
	const supportsClone = useAppStore(selectSupportsProjectClone);
	const [cloneIntent, setCloneIntent] = useState<{ isCurrent: () => boolean } | null>(null);
	const [initTarget, setInitTarget] = useState<NonGitProjectTarget | null>(null);
	const [creating, setCreating] = useState(false);
	const [openError, setOpenError] = useState<string | null>(null);
	const [pathEntry, setPathEntry] = useState<{ reason: string | null } | null>(null);

	const adopt = async (
		project: Project,
		isCurrent: () => boolean,
		intent: OpenedProjectIntent = { setup: false },
	) => {
		if (!isCurrent()) return;
		useAppStore.getState().applyProjectUpdated(project);
		if (!isCurrent()) return;
		await onOpened(project, intent);
	};

	const openProjectForIntent = async (rawPath: string, isCurrent: () => boolean) => {
		const trimmed = rawPath.trim();
		if (!trimmed || !isCurrent()) return;
		try {
			const project = await getTransport().request("project.open", { path: trimmed });
			if (!isCurrent()) return;
			await adopt(project, isCurrent);
			if (!isCurrent()) return;
		} catch (err) {
			if (!isCurrent()) return;
			const status = await getTransport()
				.request("project.inspect", { path: trimmed })
				.catch(() => null);
			if (!isCurrent()) return;
			if (status?.kind === "initable") {
				const gitFolders = status.gitFolders ?? [];
				setInitTarget({
					path: trimmed,
					gitFolders,
					selectedPaths: gitFolders.map((folder) => folder.path),
				});
			} else if (status?.kind === "missing")
				setOpenError(t("panels.openProject.missing", { path: trimmed }));
			else if (status?.kind === "notDirectory")
				setOpenError(t("panels.openProject.notDirectory", { path: trimmed }));
			else setOpenError(errorText(err, t("panels.openProject.openPathFailed", { path: trimmed })));
		}
	};

	const openProject = (rawPath: string) =>
		openProjectForIntent(rawPath, projectOpenIntents.begin());

	const openNonGitProject = async (path: string, gitFolders: string[]) => {
		const isCurrent = projectOpenIntents.begin();
		setInitTarget(null);
		const params =
			gitFolders.length > 0 ? { path, allowNonGit: true, gitFolders } : { path, allowNonGit: true };
		try {
			const project = await getTransport().request("project.open", params);
			if (!isCurrent()) return;
			await adopt(project, isCurrent);
		} catch (err) {
			if (!isCurrent()) return;
			setOpenError(errorText(err, t("panels.openProject.openPathFailed", { path })));
		}
	};

	const toggleGitFolder = (folderPath: string) => {
		setInitTarget((prev) =>
			prev
				? {
						...prev,
						selectedPaths: prev.selectedPaths.includes(folderPath)
							? prev.selectedPaths.filter((item) => item !== folderPath)
							: [...prev.selectedPaths, folderPath],
					}
				: null,
		);
	};

	const startNewProject = () => {
		projectOpenIntents.begin();
		setCreating(true);
	};

	const cloneRepository = supportsClone
		? () => {
				setCloneIntent({ isCurrent: projectOpenIntents.begin() });
			}
		: undefined;

	const enterHostPath = () => {
		projectOpenIntents.begin();
		setPathEntry({ reason: null });
	};

	const pickAndOpen = async () => {
		const isCurrent = projectOpenIntents.begin();
		let path: string | null;
		try {
			({ path } = await getTransport().request(
				"dialog.selectDirectory",
				{},
				{ timeoutMs: PICK_TIMEOUT_MS },
			));
		} catch (err) {
			if (!isCurrent()) return;
			setPathEntry({ reason: errorText(err, t("panels.openProject.pickerFailed")) });
			return;
		}
		if (!isCurrent()) return;
		if (path) await openProjectForIntent(path, isCurrent);
	};

	const hasGitFolders = (initTarget?.gitFolders.length ?? 0) > 0;

	const dialogs = (
		<>
			<Dialog
				open={initTarget !== null}
				onOpenChange={(open) => {
					if (!open) setInitTarget(null);
				}}
			>
				<DialogContent className="max-w-[32rem] gap-12" data-testid="open-non-git-project-dialog">
					<DialogHeader>
						<DialogTitle>
							{hasGitFolders
								? t("panels.openProject.gitFoldersTitle")
								: t("panels.openProject.initTitle")}
						</DialogTitle>
						<DialogDescription>
							<T
								i18nKey={
									hasGitFolders
										? "panels.openProject.gitFoldersDescription"
										: "panels.openProject.initDescription"
								}
								values={{ path: initTarget?.path }}
								components={[<span key="path" className="tr-text-emphasis text-text-default" />]}
							/>
						</DialogDescription>
					</DialogHeader>

					{hasGitFolders ? (
						<div className="flex flex-col gap-6">
							<span className="tr-text-eyebrow text-text-muted">
								{t("panels.openProject.gitFoldersLabel")}
							</span>
							<div
								data-testid="open-project-git-folders-list"
								className="flex max-h-[15rem] flex-col gap-2 overflow-y-auto rounded-sm border border-border-default bg-control-bg p-4"
							>
								{initTarget?.gitFolders.map((folder) => {
									const checked = initTarget.selectedPaths.includes(folder.path);
									return (
										<button
											key={folder.path}
											type="button"
											aria-pressed={checked}
											data-testid="open-project-git-folder-item"
											onClick={() => toggleGitFolder(folder.path)}
											className={cn(
												"flex w-full items-center gap-8 rounded-sm px-8 py-6 text-left transition-colors",
												checked
													? "bg-control-bg-selected text-text-default"
													: "text-text-muted hover:bg-control-bg-hovered",
											)}
										>
											{checked ? (
												<RiCheckboxFill className="size-16 shrink-0 text-primary" />
											) : (
												<RiCheckboxBlankLine className="size-16 shrink-0 text-text-muted" />
											)}
											<GitBranch className="size-16 shrink-0 text-primary" />
											<span className="min-w-0 flex-1 truncate tr-text-ui">{folder.name}</span>
											<span className="shrink-0 rounded-sm bg-control-bg px-6 py-2 tr-text-caption text-primary">
												{t("panels.openProjectPath.gitBadge")}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					) : null}

					<DialogFooter>
						<Button variant="ghost" onClick={() => setInitTarget(null)}>
							{t("common.cancel")}
						</Button>
						<Button
							variant={hasGitFolders ? "outline" : "primary"}
							data-testid="open-project-only"
							onClick={() => {
								if (initTarget) void openNonGitProject(initTarget.path, []);
							}}
						>
							{t("panels.openProject.openProjectOnly")}
						</Button>
						{hasGitFolders ? (
							<Button
								variant="primary"
								data-testid="confirm-init-repo"
								disabled={(initTarget?.selectedPaths.length ?? 0) === 0}
								onClick={() => {
									if (initTarget) void openNonGitProject(initTarget.path, initTarget.selectedPaths);
								}}
							>
								{t("panels.openProject.initConfirm")}
							</Button>
						) : null}
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{cloneIntent ? (
				<CloneProjectDialog
					onClose={() => setCloneIntent(null)}
					onCloned={(project) => void adopt(project, cloneIntent.isCurrent)}
				/>
			) : null}
			{creating ? (
				<CreateProjectDialog
					onClose={() => setCreating(false)}
					onCreated={(project, setup) => void adopt(project, projectOpenIntents.begin(), { setup })}
				/>
			) : null}
			<OpenProjectPathDialog
				open={pathEntry !== null}
				reason={pathEntry?.reason ?? null}
				onOpenChange={(open) => {
					if (!open) setPathEntry(null);
				}}
				onSubmit={(path) => void openProject(path)}
				onPickDirectory={() => void pickAndOpen()}
			/>
			<NoticeDialog
				open={openError !== null}
				onOpenChange={(o) => {
					if (!o) setOpenError(null);
				}}
				title={t("panels.openProject.openFailed")}
				description={<span className="whitespace-pre-line">{openError}</span>}
				testId="open-error-dialog"
			/>
		</>
	);

	return { openProject, pickAndOpen, enterHostPath, startNewProject, cloneRepository, dialogs };
}
