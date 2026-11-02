import type { ExplorerSortOrder, FileNode } from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { describeResource, PENDING_TEXT_META } from "@realthing/resource-renderers";
import { LoadingRegion } from "@realthing/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { firstClickOnly } from "../lib";
import { selectFilesTreeView, type TabIntent, useAppStore } from "../store";
import { getTransport } from "../transport";
import { type ChangeMarks, statusLetter, statusMarkClass } from "./changesModel";
import { holdEditorWarm, useEditorWarm, warmOnHover, whenFilesTreeIdle } from "./editorWarm";
import { type ResolvedFolderChain, resolveFolderChain } from "./folderChains";
import { openFileInTab, prefetchFileContent } from "./openTabs";
import { TreeRow } from "./TreeRow";
import { useWorkspaceRead } from "./useWorkspaceRead";

type SetPathsExpanded = (paths: readonly string[], expanded: boolean) => void;
type WarmFile = ((path: string) => void) | undefined;

const PREWARM_ROOT_FILES_LIMIT = 32;
const PREWARM_ROOT_DIRS_LIMIT = 20;
const PREWARM_CHILD_FILES_LIMIT = 8;

interface TreeFocus {
	activePath: string | null;
	revealTarget: string | null;
	onRevealed: () => void;
}

const rootNodesCache = new Map<string, FileNode[]>();
const folderChainCache = new Map<string, ResolvedFolderChain<FileNode>>();
const dirReadInFlight = new Map<string, Promise<FileNode[]>>();
let watchingStore = false;

function folderKey(workspaceId: string, path: string): string {
	return `${workspaceId}\u0000${path}`;
}

function clearExplorerCaches(): void {
	rootNodesCache.clear();
	folderChainCache.clear();
	dirReadInFlight.clear();
}

function ensureStoreWatcher(): void {
	if (watchingStore) return;
	watchingStore = true;
	useAppStore.subscribe((state, previous) => {
		if (
			state.explorerSortOrder !== previous.explorerSortOrder ||
			state.explorerCompactFolders !== previous.explorerCompactFolders ||
			state.filesExclude !== previous.filesExclude ||
			state.filesShowHidden !== previous.filesShowHidden
		) {
			clearExplorerCaches();
			return;
		}
		if (state.removedWorkspaceIds === previous.removedWorkspaceIds) return;
		for (const workspaceId of Object.keys(state.removedWorkspaceIds)) {
			rootNodesCache.delete(workspaceId);
			const prefix = `${workspaceId}\u0000`;
			for (const key of folderChainCache.keys()) {
				if (key.startsWith(prefix)) folderChainCache.delete(key);
			}
		}
	});
}

function rememberRootNodes(workspaceId: string, nodes: FileNode[]): void {
	if (useAppStore.getState().removedWorkspaceIds[workspaceId]) return;
	ensureStoreWatcher();
	rootNodesCache.set(workspaceId, nodes);
}

function rememberFolderChain(
	workspaceId: string,
	path: string,
	chain: ResolvedFolderChain<FileNode>,
): void {
	if (useAppStore.getState().removedWorkspaceIds[workspaceId]) return;
	ensureStoreWatcher();
	folderChainCache.set(folderKey(workspaceId, path), chain);
}

function peekFolderChain(workspaceId: string, path: string): ResolvedFolderChain<FileNode> | null {
	return folderChainCache.get(folderKey(workspaceId, path)) ?? null;
}

function readWorkspaceDir(workspaceId: string, path: string): Promise<FileNode[]> {
	const key = folderKey(workspaceId, path);
	const existing = dirReadInFlight.get(key);
	if (existing) return existing;
	const request = getTransport()
		.request("fs.readDir", { workspaceId, path })
		.finally(() => {
			if (dirReadInFlight.get(key) === request) dirReadInFlight.delete(key);
		});
	dirReadInFlight.set(key, request);
	return request;
}

async function readFolderChain(
	workspaceId: string,
	node: FileNode,
	compactFolders = useAppStore.getState().explorerCompactFolders,
): Promise<ResolvedFolderChain<FileNode>> {
	if (!compactFolders) {
		const children = await readWorkspaceDir(workspaceId, node.path);
		return {
			label: node.name,
			path: node.path,
			paths: [node.path],
			deepest: node,
			children,
		};
	}
	return resolveFolderChain(node, (target) => readWorkspaceDir(workspaceId, target));
}

function prewarmChildFiles(
	workspaceId: string,
	children: readonly FileNode[],
	limit = PREWARM_CHILD_FILES_LIMIT,
): void {
	let count = 0;
	for (const child of children) {
		if (child.kind !== "file" || child.gitignored) continue;
		prefetchFileContent(workspaceId, child.path);
		count += 1;
		if (count >= limit) break;
	}
}

function prewarmChangedChildDirs(
	workspaceId: string,
	children: readonly FileNode[],
	changedDirs: ReadonlySet<string>,
): void {
	if (changedDirs.size === 0) return;
	for (const child of children) {
		if (child.kind !== "dir" || !changedDirs.has(child.path)) continue;
		if (peekFolderChain(workspaceId, child.path) !== null) continue;
		void readFolderChain(workspaceId, child)
			.then((chain) => rememberFolderChain(workspaceId, child.path, chain))
			.catch(() => undefined);
	}
}

function fileExtension(name: string): string {
	const dotIndex = name.lastIndexOf(".");
	return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
}

export function sortFileNodes(
	nodes: readonly FileNode[],
	sortOrder: ExplorerSortOrder = "default",
): FileNode[] {
	return [...nodes].sort((a, b) => {
		if (sortOrder === "mixed") {
			return a.name.localeCompare(b.name);
		}
		if (sortOrder === "filesFirst") {
			if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
			return a.name.localeCompare(b.name);
		}
		if (sortOrder === "type") {
			if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
			if (a.kind === "file") {
				const extCompare = fileExtension(a.name).localeCompare(fileExtension(b.name));
				if (extCompare !== 0) return extCompare;
			}
			return a.name.localeCompare(b.name);
		}
		return a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1;
	});
}

function expandChangedSubtreePaths(
	workspaceId: string,
	basePaths: readonly string[],
	changedDirs: ReadonlySet<string>,
): string[] {
	const result = [...basePaths];
	let current = result[result.length - 1];
	while (current !== undefined) {
		const prefix = `${current}/`;
		const directChangedChildren: string[] = [];
		for (const candidate of changedDirs) {
			if (candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes("/")) {
				directChangedChildren.push(candidate);
			}
		}
		if (directChangedChildren.length !== 1) break;
		const onlyChild = directChangedChildren[0];
		if (!onlyChild) break;
		const cachedChain = peekFolderChain(workspaceId, onlyChild);
		if (cachedChain) {
			for (const p of cachedChain.paths) result.push(p);
			current = cachedChain.path;
		} else {
			result.push(onlyChild);
			current = onlyChild;
		}
	}
	return result;
}

export function FileTree({
	workspaceId,
	marks,
	...focus
}: TreeFocus & { workspaceId: string; marks: ChangeMarks }) {
	const t = useT();
	const [nodes, setNodes] = useState<FileNode[] | null>(
		() => rootNodesCache.get(workspaceId) ?? null,
	);
	const expanded = useAppStore((s) => selectFilesTreeView(s, workspaceId).expanded);
	const explorerSortOrder = useAppStore((s) => s.explorerSortOrder);
	const explorerCompactFolders = useAppStore((s) => s.explorerCompactFolders);
	const filesExclude = useAppStore((s) => s.filesExclude);
	const filesShowHidden = useAppStore((s) => s.filesShowHidden);
	const settingsKey = `${explorerSortOrder}\u0000${explorerCompactFolders}\u0000${filesShowHidden}\u0000${filesExclude.join("\u0001")}`;
	const prevSettingsKeyRef = useRef(settingsKey);

	const expandedPaths = useMemo(() => new Set(expanded), [expanded]);
	const sortedNodes = useMemo(
		() => (nodes === null ? null : sortFileNodes(nodes, explorerSortOrder)),
		[nodes, explorerSortOrder],
	);
	const warm = useEditorWarm();
	const warmFile: WarmFile = warm
		? (path) => {
				warm(describeResource(workspaceId, path, PENDING_TEXT_META));
				prefetchFileContent(workspaceId, path);
			}
		: undefined;

	const setPathsExpanded: SetPathsExpanded = (paths, next) =>
		useAppStore.getState().setFilesTreeExpanded(workspaceId, paths, next);

	const { reload: reloadRoot } = useWorkspaceRead(workspaceId, (id) => readWorkspaceDir(id, "."), {
		onResult: (result, id) => {
			rememberRootNodes(id, result);
			setNodes(result);
		},
		onFailure: () => setNodes((prev) => prev ?? []),
		onSwitch: (id) => setNodes(rootNodesCache.get(id) ?? null),
		shouldReload: (paths) => paths.some((path) => !path.includes("/")),
	});

	useEffect(() => {
		if (prevSettingsKeyRef.current === settingsKey) return;
		prevSettingsKeyRef.current = settingsKey;
		clearExplorerCaches();
		reloadRoot();
	}, [settingsKey, reloadRoot]);

	const loading = sortedNodes === null;
	useEffect(() => (loading ? holdEditorWarm() : undefined), [loading]);

	useEffect(() => {
		if (!nodes || !warm) return;
		return whenFilesTreeIdle(
			() => {
				prewarmChildFiles(workspaceId, nodes, PREWARM_ROOT_FILES_LIMIT);
				let dirCount = 0;
				for (const node of nodes) {
					if (node.kind !== "dir" || node.gitignored) continue;
					if (peekFolderChain(workspaceId, node.path) === null) {
						void readFolderChain(workspaceId, node, explorerCompactFolders)
							.then((chain) => rememberFolderChain(workspaceId, node.path, chain))
							.catch(() => undefined);
					}
					dirCount += 1;
					if (dirCount >= PREWARM_ROOT_DIRS_LIMIT) break;
				}
			},
			{ timeout: 350, fallbackDelay: 100 },
		);
	}, [nodes, warm, workspaceId, explorerCompactFolders]);

	if (sortedNodes === null) return <LoadingRegion rows={8} className="px-4 py-4" />;
	if (sortedNodes.length === 0)
		return (
			<p className="px-4 py-4 tr-text-metadata text-text-muted">{t("panels.fileTree.empty")}</p>
		);
	return (
		<ul className="flex flex-col motion-safe:animate-reveal">
			{sortedNodes.map((node) => (
				<FileNodeRow
					key={node.path}
					node={node}
					workspaceId={workspaceId}
					marks={marks}
					focus={focus}
					expandedPaths={expandedPaths}
					setPathsExpanded={setPathsExpanded}
					warmFile={warmFile}
					sortOrder={explorerSortOrder}
					compactFolders={explorerCompactFolders}
					settingsKey={settingsKey}
				/>
			))}
		</ul>
	);
}

function FileNodeRow({
	node,
	workspaceId,
	marks,
	focus,
	expandedPaths,
	setPathsExpanded,
	warmFile,
	sortOrder,
	compactFolders,
	settingsKey,
}: {
	node: FileNode;
	workspaceId: string;
	marks: ChangeMarks;
	focus: TreeFocus;
	expandedPaths: ReadonlySet<string>;
	setPathsExpanded: SetPathsExpanded;
	warmFile: WarmFile;
	sortOrder: ExplorerSortOrder;
	compactFolders: boolean;
	settingsKey: string;
}) {
	const isDir = node.kind === "dir";
	const [directory, setDirectory] = useState<ResolvedFolderChain<FileNode> | null>(() =>
		isDir ? peekFolderChain(workspaceId, node.path) : null,
	);
	const pendingExpand = useRef(false);
	const prevSettingsKeyRef = useRef(settingsKey);

	const cachedDirectory = directory ?? (isDir ? peekFolderChain(workspaceId, node.path) : null);
	const label = cachedDirectory?.label ?? node.name;
	const representedPaths = cachedDirectory?.paths ?? [node.path];
	const expanded =
		expandedPaths.has(cachedDirectory?.path ?? node.path) || expandedPaths.has(node.path);
	const dirChanged =
		isDir && (marks.dirs.has(cachedDirectory?.path ?? node.path) || marks.dirs.has(node.path));
	const rawChildren = cachedDirectory?.children ?? null;
	const children = useMemo(
		() => (rawChildren === null ? null : sortFileNodes(rawChildren, sortOrder)),
		[rawChildren, sortOrder],
	);

	const { reload } = useWorkspaceRead(
		isDir && (expanded || dirChanged) ? workspaceId : null,
		(id) => readFolderChain(id, node),
		{
			onResult: (result, id) => {
				rememberFolderChain(id, node.path, result);
				setDirectory(result);
				if (dirChanged) prewarmChangedChildDirs(id, result.children, marks.dirs);
				if (expanded) prewarmChildFiles(id, result.children);
				if (!pendingExpand.current && !(expandedPaths.has(node.path) && result.paths.length > 1)) {
					return;
				}
				pendingExpand.current = false;
				const pathsToExpand = dirChanged
					? expandChangedSubtreePaths(id, result.paths, marks.dirs)
					: result.paths;
				setPathsExpanded(pathsToExpand, true);
			},
			onSwitch: (id) => {
				pendingExpand.current = false;
				setDirectory(isDir ? peekFolderChain(id, node.path) : null);
			},
			shouldReload: (paths) =>
				paths.some((changed) =>
					representedPaths.some((dir) => changed === dir || changed.startsWith(`${dir}/`)),
				),
		},
	);

	useEffect(() => {
		if (prevSettingsKeyRef.current === settingsKey) return;
		prevSettingsKeyRef.current = settingsKey;
		if (!isDir) return;
		setDirectory(null);
		if (expanded || dirChanged) reload();
	}, [settingsKey, isDir, expanded, dirChanged, reload]);

	const warmFolder = () => {
		if (!isDir) return;
		const existing = peekFolderChain(workspaceId, node.path);
		if (existing) {
			if (directory === null) setDirectory(existing);
			prewarmChildFiles(workspaceId, existing.children);
			return;
		}
		void readFolderChain(workspaceId, node, compactFolders)
			.then((chain) => {
				rememberFolderChain(workspaceId, node.path, chain);
				setDirectory(chain);
				prewarmChildFiles(workspaceId, chain.children);
			})
			.catch(() => undefined);
	};

	const toggleDirectory = () => {
		const nextExpanded = !expanded;
		pendingExpand.current = nextExpanded && cachedDirectory === null;
		if (cachedDirectory && directory === null) setDirectory(cachedDirectory);
		if (nextExpanded && cachedDirectory) prewarmChildFiles(workspaceId, cachedDirectory.children);
		const pathsToToggle =
			nextExpanded && dirChanged
				? expandChangedSubtreePaths(workspaceId, representedPaths, marks.dirs)
				: representedPaths;
		setPathsExpanded(pathsToToggle, nextExpanded);
		if (nextExpanded && directory !== null) reload();
	};
	const open = (intent: TabIntent) => void openFileInTab(workspaceId, node.path, intent);
	const fileStatus = isDir ? undefined : marks.files.get(node.path);
	const ignored = (cachedDirectory?.deepest ?? node).gitignored === true;
	const revealRow =
		!isDir && focus.revealTarget === node.path
			? (row: HTMLButtonElement | null) => {
					if (!row) return;
					row.scrollIntoView({ block: "nearest" });
					focus.onRevealed();
				}
			: undefined;

	return (
		<li>
			<TreeRow
				ref={revealRow}
				testid="file-node"
				kind={isDir ? "dir" : "file"}
				active={!isDir && focus.activePath === node.path}
				subtle={ignored}
				dataStatus={ignored ? "ignored" : undefined}
				expanded={expanded}
				label={label}
				labelClassName={
					fileStatus ? statusMarkClass(fileStatus) : dirChanged ? statusMarkClass("modified") : ""
				}
				trailing={
					fileStatus ? (
						<span
							data-testid="file-status"
							className={`shrink-0 tr-text-metadata ${statusMarkClass(fileStatus)}`}
						>
							{statusLetter(fileStatus)}
						</span>
					) : dirChanged ? (
						<span
							data-testid="file-folder-dot"
							className="mr-4 size-6 shrink-0 rounded-full bg-feedback-warning"
						/>
					) : undefined
				}
				onClick={isDir ? toggleDirectory : firstClickOnly(() => open("preview"))}
				onDoubleClick={isDir ? undefined : () => open("keep")}
				onWarm={
					!warmFile
						? undefined
						: isDir
							? (trigger) => (trigger === "focus" ? warmFolder() : warmOnHover(warmFolder))
							: (trigger) =>
									trigger === "focus" ? warmFile(node.path) : warmOnHover(() => warmFile(node.path))
				}
			/>
			{isDir && expanded && children && (
				<ul className="flex flex-col pl-tree-indent">
					{children.map((child) => (
						<FileNodeRow
							key={child.path}
							node={child}
							workspaceId={workspaceId}
							marks={marks}
							focus={focus}
							expandedPaths={expandedPaths}
							setPathsExpanded={setPathsExpanded}
							warmFile={warmFile}
							sortOrder={sortOrder}
							compactFolders={compactFolders}
							settingsKey={settingsKey}
						/>
					))}
				</ul>
			)}
		</li>
	);
}
