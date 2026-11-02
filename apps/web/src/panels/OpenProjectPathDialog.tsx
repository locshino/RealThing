import {
	RiAlertLine as Alert,
	RiArrowRightSLine as ArrowRight,
	RiCloseLine as Close,
	RiFolderLine as Folder,
	RiFolderOpenLine as FolderOpen,
	RiGitBranchLine as GitBranch,
	RiHistoryLine as History,
	RiLoader4Line as Loader2,
	RiSearchLine as Search,
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
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store";
import { getTransport } from "../transport";

type NavItem = { kind: "recent"; project: Project } | { kind: "folder"; candidate: PathCandidate };

export function OpenProjectPathDialog({
	open,
	reason,
	onOpenChange,
	onSubmit,
	onPickDirectory,
}: {
	open: boolean;
	reason: string | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (path: string) => void;
	onPickDirectory?: () => void;
}) {
	const t = useT();
	const recentProjects = useAppStore((s) => s.recentProjects);
	const [path, setPath] = useState("");
	const [candidates, setCandidates] = useState<PathCandidate[]>([]);
	const [loading, setLoading] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const listRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const finalPath = path.trim();

	const setOpen = (next: boolean) => {
		if (!next) {
			setPath("");
			setCandidates([]);
			setHighlightedIndex(-1);
		}
		onOpenChange(next);
	};

	useEffect(() => {
		if (!open) {
			setCandidates([]);
			setLoading(false);
			setHighlightedIndex(-1);
			return;
		}

		let active = true;
		setLoading(true);

		const timer = setTimeout(() => {
			getTransport()
				.request("project.suggestPaths", { query: path })
				.then((res) => {
					if (!active) return;
					setCandidates(res.candidates);
					setLoading(false);
					setHighlightedIndex((prev) =>
						res.candidates.length > 0 ? Math.min(Math.max(prev, 0), res.candidates.length - 1) : -1,
					);
				})
				.catch(() => {
					if (!active) return;
					setCandidates([]);
					setLoading(false);
					setHighlightedIndex(-1);
				});
		}, 30);

		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [open, path]);

	const matchingRecent = useMemo(() => {
		if (!finalPath) return recentProjects.slice(0, 5);
		const lower = finalPath.toLowerCase();
		return recentProjects
			.filter((p) => p.name.toLowerCase().includes(lower) || p.path.toLowerCase().includes(lower))
			.slice(0, 5);
	}, [recentProjects, finalPath]);

	const allItems = useMemo<NavItem[]>(() => {
		const items: NavItem[] = [];
		for (const project of matchingRecent) {
			items.push({ kind: "recent", project });
		}
		for (const candidate of candidates) {
			items.push({ kind: "folder", candidate });
		}
		return items;
	}, [matchingRecent, candidates]);

	useEffect(() => {
		if (highlightedIndex < 0 || !listRef.current) return;
		const el = listRef.current.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [highlightedIndex]);

	const enterDirectory = (targetPath: string) => {
		const separator = targetPath.includes("\\") && !targetPath.includes("/") ? "\\" : "/";
		const completed =
			targetPath.endsWith("/") || targetPath.endsWith("\\")
				? targetPath
				: `${targetPath}${separator}`;
		setPath(completed);
		setHighlightedIndex(0);
		inputRef.current?.focus();
	};

	const chooseTarget = (chosenPath: string) => {
		const trimmed = chosenPath.trim();
		if (!trimmed) return;
		onSubmit(trimmed);
		setOpen(false);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			if (allItems.length > 0) {
				setHighlightedIndex((prev) => (prev + 1) % allItems.length);
			}
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			if (allItems.length > 0) {
				setHighlightedIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
			}
		} else if (event.key === "Tab") {
			event.preventDefault();
			const activeItem = allItems[highlightedIndex] ?? allItems[0];
			if (activeItem) {
				if (activeItem.kind === "folder") {
					enterDirectory(activeItem.candidate.path);
				} else {
					setPath(activeItem.project.path);
					inputRef.current?.focus();
				}
			}
		} else if (event.key === "Enter") {
			const activeItem = allItems[highlightedIndex];
			if (activeItem) {
				event.preventDefault();
				if (activeItem.kind === "recent") {
					chooseTarget(activeItem.project.path);
				} else {
					chooseTarget(activeItem.candidate.path);
				}
			}
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent data-testid="open-project-path-dialog" className="max-w-[34rem] gap-12">
				<DialogHeader>
					<DialogTitle>{t("panels.openProjectPath.title")}</DialogTitle>
					<DialogDescription>
						<T
							i18nKey="panels.openProjectPath.description"
							components={[<code key="home" className="tr-code-text" />]}
						/>
					</DialogDescription>
				</DialogHeader>

				{reason ? (
					<p
						data-testid="open-project-picker-error"
						className="flex items-start gap-8 text-feedback-warning tr-text-ui"
					>
						<Alert className="mt-2 size-16 shrink-0" />
						<span className="min-w-0 whitespace-pre-wrap break-words">{reason}</span>
					</p>
				) : null}

				<form
					className="flex flex-col gap-12"
					onSubmit={(event) => {
						event.preventDefault();
						if (!finalPath) return;
						chooseTarget(finalPath);
					}}
				>
					<label htmlFor="open-project-host-path" className="flex flex-col gap-4">
						<span className="tr-title-compact text-text-default">
							{t("panels.openProjectPath.folderPath")}
						</span>
						<div className="flex items-center gap-8 rounded-sm border border-control-border-default bg-control-bg px-12 py-8 transition-colors focus-within:border-control-border-active">
							<Search className="size-16 shrink-0 text-text-muted" />
							<input
								ref={inputRef}
								id="open-project-host-path"
								data-testid="open-project-path-input"
								autoFocus
								autoComplete="off"
								spellCheck={false}
								value={path}
								onChange={(event) => setPath(event.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={t("panels.openProjectPath.placeholder")}
								className="w-full min-w-0 flex-1 border-0 bg-transparent p-0 tr-text-ui text-text-default outline-none placeholder:text-text-muted"
							/>
							{loading ? (
								<Loader2 className="size-16 shrink-0 animate-spin text-text-muted" />
							) : path ? (
								<button
									type="button"
									onClick={() => {
										setPath("");
										inputRef.current?.focus();
									}}
									className="rounded-sm p-2 text-text-muted transition-colors hover:text-text-default focus-visible:text-text-default"
									aria-label={t("panels.openProjectPath.clear")}
								>
									<Close className="size-14" />
								</button>
							) : null}
						</div>
					</label>

					<div
						ref={listRef}
						tabIndex={-1}
						className="flex max-h-[16rem] min-h-[6rem] flex-col gap-2 overflow-y-auto rounded-sm border border-border-default bg-container-workspace-bg p-4"
					>
						{matchingRecent.length > 0 ? (
							<div className="flex flex-col gap-2">
								<span className="px-8 py-2 tr-text-eyebrow text-text-subtle">
									{t("panels.openProjectPath.recent")}
								</span>
								{matchingRecent.map((recent) => {
									const itemIndex = allItems.findIndex(
										(item) => item.kind === "recent" && item.project.id === recent.id,
									);
									const isHighlighted = itemIndex === highlightedIndex;
									return (
										<button
											key={recent.id}
											type="button"
											data-index={itemIndex}
											onClick={() => chooseTarget(recent.path)}
											className={cn(
												"flex w-full items-center gap-8 rounded-sm px-8 py-6 text-left outline-none transition-colors",
												isHighlighted
													? "bg-control-bg-selected text-text-default"
													: "hover:bg-control-bg-hovered text-text-muted hover:text-text-default",
											)}
										>
											<History className="size-14 shrink-0 text-text-muted" />
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate tr-text-ui text-text-default">{recent.name}</span>
												<span className="truncate tr-text-metadata text-text-subtle">
													{recent.path}
												</span>
											</span>
										</button>
									);
								})}
							</div>
						) : null}

						{candidates.length > 0 ? (
							<div className="flex flex-col gap-2">
								<span className="px-8 py-2 tr-text-eyebrow text-text-subtle">
									{t("panels.openProjectPath.folders")}
								</span>
								{candidates.map((candidate) => {
									const itemIndex = allItems.findIndex(
										(item) => item.kind === "folder" && item.candidate.path === candidate.path,
									);
									const isHighlighted = itemIndex === highlightedIndex;
									const isRepo = candidate.kind === "repo";

									return (
										<div
											key={candidate.path}
											data-index={itemIndex}
											data-testid="open-project-candidate"
											data-kind={candidate.kind}
											className={cn(
												"group flex w-full items-center gap-8 rounded-sm px-8 py-6 text-left transition-colors",
												isHighlighted
													? "bg-control-bg-selected text-text-default"
													: "hover:bg-control-bg-hovered text-text-muted hover:text-text-default",
											)}
										>
											<button
												type="button"
												onClick={() => chooseTarget(candidate.path)}
												className="flex min-w-0 flex-1 items-center gap-8 text-left outline-none"
											>
												{isRepo ? (
													<GitBranch className="size-16 shrink-0 text-primary" />
												) : (
													<Folder className="size-16 shrink-0 text-text-muted" />
												)}
												<span className="flex min-w-0 flex-1 flex-col">
													<span className="flex items-center gap-6 truncate tr-text-ui text-text-default">
														<span className="truncate">{candidate.name}</span>
														{isRepo ? (
															<span className="shrink-0 rounded-full border border-primary-muted bg-primary-subtle px-4 tr-text-caption text-primary">
																{t("panels.openProjectPath.gitBadge")}
															</span>
														) : null}
													</span>
													<span className="truncate tr-text-metadata text-text-subtle">
														{candidate.path}
													</span>
												</span>
											</button>

											<button
												type="button"
												title={t("panels.openProjectPath.tabHint")}
												onClick={(e) => {
													e.stopPropagation();
													enterDirectory(candidate.path);
												}}
												className="flex size-24 shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors hover:bg-control-bg hover:text-text-default"
											>
												<ArrowRight className="size-16" />
											</button>
										</div>
									);
								})}
							</div>
						) : null}

						{!loading && finalPath && allItems.length === 0 ? (
							<div className="flex h-full min-h-[4rem] items-center justify-center tr-text-ui text-text-muted">
								{t("panels.openProjectPath.noMatches")}
							</div>
						) : null}
					</div>

					<DialogFooter className="flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex flex-wrap items-center gap-8 text-text-subtle tr-text-caption">
							<span className="flex items-center gap-4">
								<kbd className="rounded-sm border border-border-default bg-control-bg px-4 py-2 tr-code-text">
									⇥
								</kbd>
								<span>{t("panels.openProjectPath.tabHint")}</span>
							</span>
							<span className="flex items-center gap-4">
								<kbd className="rounded-sm border border-border-default bg-control-bg px-4 py-2 tr-code-text">
									↑↓
								</kbd>
								<span>{t("panels.openProjectPath.navigateHint")}</span>
							</span>
							<span className="flex items-center gap-4">
								<kbd className="rounded-sm border border-border-default bg-control-bg px-4 py-2 tr-code-text">
									↵
								</kbd>
								<span>{t("panels.openProjectPath.openHint")}</span>
							</span>
						</div>

						<div className="flex items-center justify-end gap-8">
							{onPickDirectory ? (
								<Button
									variant="ghost"
									iconLeft={FolderOpen}
									onClick={() => {
										setOpen(false);
										onPickDirectory();
									}}
								>
									{t("panels.openProjectPath.systemPicker")}
								</Button>
							) : null}
							<Button variant="outline" onClick={() => setOpen(false)}>
								{t("common.cancel")}
							</Button>
							<Button type="submit" data-testid="open-project-path-submit" disabled={!finalPath}>
								{t("panels.openProjectPath.submit")}
							</Button>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
