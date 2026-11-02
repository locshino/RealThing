import {
	RiCheckLine as Check,
	RiArrowDownSLine as ChevronDown,
	RiArrowRightSLine as ChevronRight,
	RiCircleLine as Circle,
	RiErrorWarningLine as CircleAlert,
	RiCheckboxCircleLine as CircleCheck,
	RiRecordCircleLine as CircleDot,
	RiFileCopyLine as Copy,
	RiDownloadLine as Download,
	RiGitBranchLine as GitBranch,
	RiGitCommitLine as GitCommitHorizontal,
	RiLoader4Line as Loader2,
	RiMore2Line as MoreVertical,
	RiAddLine as Plus,
	RiShieldCheckLine as ShieldCheck,
} from "@remixicon/react";
import type {
	GitFileChange,
	TodoGroupItem,
	TodoItem,
	TodoPlan,
	TodoStatus,
} from "@realthing/contracts";
import { type Translator, t as translate, useT } from "@realthing/locales/react";
import { Button, IconButton } from "@realthing/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@realthing/ui/dropdown-menu";
import { LoadingRegion } from "@realthing/ui/skeleton";
import { IconTooltip } from "@realthing/ui/tooltip";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useInsertionEffect,
	useRef,
	useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { tupleKey } from "../lib";
import { isConnectedGeneration, selectWorkspaceById, toast, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { statusLetter } from "./changesModel";
import { DiffStatBadge } from "./DiffStatBadge";
import { openDiffInTab } from "./openTabs";
import { PlanCommitsMenu } from "./PlanCommitsMenu";
import { FileRow } from "./planFileRow";

export type ItemChangeSet =
	| { kind: "commit"; sha: string; files: GitFileChange[] }
	| { kind: "paths"; paths: string[] };

export interface ItemRevision {
	sha: string;
	files?: GitFileChange[];
}

export function itemRevisions(item: TodoItem): ItemRevision[] {
	return (item.artifacts ?? []).flatMap((a) =>
		a.kind === "commit" && a.sha ? [{ sha: a.sha, ...(a.files ? { files: a.files } : {}) }] : [],
	);
}

export function itemChangeSet(item: TodoItem): ItemChangeSet | null {
	const artifacts = item.artifacts ?? [];
	const paths = artifacts.flatMap((a) => (a.kind === "change" && a.path ? [a.path] : []));
	if (paths.length > 0) return { kind: "paths", paths };
	const commits = itemRevisions(item);
	for (let i = commits.length - 1; i >= 0; i--) {
		const rev = commits[i];
		if (rev?.files && rev.files.length > 0)
			return { kind: "commit", sha: rev.sha, files: rev.files };
	}
	return null;
}

export function changeSetStat(files: GitFileChange[]): {
	count: number;
	added: number;
	removed: number;
} {
	return {
		count: files.length,
		added: files.reduce((sum, f) => sum + (f.added ?? 0), 0),
		removed: files.reduce((sum, f) => sum + (f.removed ?? 0), 0),
	};
}

export function changeSetCounts(set: ItemChangeSet): {
	count: number;
	added: number;
	removed: number;
} {
	return set.kind === "paths"
		? { count: set.paths.length, added: 0, removed: 0 }
		: changeSetStat(set.files);
}

export function groupProgress(group: TodoGroupItem): { done: number; total: number } {
	return {
		done: group.todos.filter((t) => t.status === "done").length,
		total: group.todos.length,
	};
}

export function flatItems(plan: TodoPlan): TodoItem[] {
	return [...plan.groups.flatMap((g) => g.todos), ...plan.todos];
}

export function planSummary(plan: TodoPlan): {
	done: number;
	total: number;
	current: TodoItem | undefined;
} {
	const all = flatItems(plan);
	return {
		done: all.filter((t) => t.status === "done").length,
		total: all.length,
		current: all.find((t) => t.status === "in_progress"),
	};
}

export function verificationStatus(verification: string): "claimed" | "unverified" {
	return /\b(not\s+verified|unverified|no\s+verification)\b/i.test(verification)
		? "unverified"
		: "claimed";
}

export function adoptedCommits(plan: TodoPlan): TodoItem[] {
	return plan.adoptedCommits ?? [];
}

export function planCompletionSummary(plan: TodoPlan): string | undefined {
	if (!plan.summary) return undefined;
	const all = flatItems(plan);
	if (all.length === 0 || all.some((t) => t.status !== "done")) return undefined;
	return plan.summary;
}

export function planStaleSummary(plan: TodoPlan): string | undefined {
	if (!plan.summary) return undefined;
	const all = flatItems(plan);
	if (all.length === 0) return undefined;
	return all.some((t) => t.status !== "done") ? plan.summary : undefined;
}

export interface PlanSections {
	activeGroups: TodoGroupItem[];
	activeLoose: TodoItem[];
	pendingGroups: TodoGroupItem[];
	pendingLoose: TodoItem[];
	doneGroups: TodoGroupItem[];
	doneLoose: TodoItem[];
}

export function planSections(plan: TodoPlan): PlanSections {
	const s: PlanSections = {
		activeGroups: [],
		activeLoose: [],
		pendingGroups: [],
		pendingLoose: [],
		doneGroups: [],
		doneLoose: [],
	};
	for (const group of plan.groups) {
		if (group.status === "active") s.activeGroups.push(group);
		else if (group.status === "done") s.doneGroups.push(group);
		else s.pendingGroups.push(group);
	}
	for (const todo of plan.todos) {
		if (todo.status === "in_progress") s.activeLoose.push(todo);
		else if (todo.status === "done") s.doneLoose.push(todo);
		else s.pendingLoose.push(todo);
	}
	return s;
}

function planChangeTotals(plan: TodoPlan): { files: number } {
	const paths = new Set<string>();
	for (const item of flatItems(plan)) {
		const set = itemChangeSet(item);
		if (!set) continue;
		if (set.kind === "paths") for (const path of set.paths) paths.add(path);
		else for (const file of set.files) paths.add(file.path);
	}
	return { files: paths.size };
}

function checkbox(item: TodoItem): string {
	if (item.status === "done") return "[x]";
	if (item.status === "in_progress") return "[~]";
	return "[ ]";
}

function plusMinus(added: number, removed: number): string {
	const parts = [...(added > 0 ? [`+${added}`] : []), ...(removed > 0 ? [`−${removed}`] : [])];
	return parts.join(" ");
}

function flattenInline(text: string): string {
	return text
		.split("\n")
		.map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
		.filter(Boolean)
		.join(" · ");
}

function itemLines(t: Translator, item: TodoItem): string[] {
	const head = `- ${checkbox(item)} ${item.title}`;
	const summary = [
		...(item.status === "done" && item.summary ? [`    - _${flattenInline(item.summary)}_`] : []),
		...(item.status === "done" && item.verification
			? [
					`    - ${t("chat.planExport.verified", { verification: flattenInline(item.verification) })}`,
				]
			: []),
	];
	const set = itemChangeSet(item);
	if (!set) return [head, ...summary];
	if (set.kind === "paths") {
		return [head, ...summary, ...set.paths.map((path) => `    - ${path}`)];
	}
	const { count, added, removed } = changeSetStat(set.files);
	const stat = plusMinus(added, removed);
	const countText = t("chat.planExport.files", { count });
	const statLine = [`\`${set.sha.slice(0, 7)}\``, countText, ...(stat ? [stat] : [])].join(" · ");
	return [
		`${head} — ${statLine}`,
		...summary,
		...set.files.map((f) => {
			const fileStat = plusMinus(f.added ?? 0, f.removed ?? 0);
			return `    - \`${statusLetter(f.status)}\` ${f.path}${fileStat ? ` · ${fileStat}` : ""}`;
		}),
	];
}

export function planToMarkdown(t: Translator, plan: TodoPlan, title: string): string {
	const all = flatItems(plan);
	const done = all.filter((item) => item.status === "done").length;
	const lines: string[] = [
		`# ${t("chat.planExport.title", { title })}`,
		"",
		t("chat.planExport.progress", { done, total: all.length }),
	];
	if (all.length > 0 && done === all.length) {
		const files = planChangeTotals(plan).files;
		const overall = planCompletionSummary(plan);
		if (overall || files > 0) {
			const facts = [t("chat.planExport.stepsDone", { count: done })];
			if (files > 0) facts.push(t("chat.planExport.files", { count: files }));
			lines.push(
				"",
				`## ${t("chat.planExport.summary")}`,
				"",
				facts.join(" · "),
				...(overall ? ["", overall] : []),
			);
		}
	}

	for (const group of plan.groups) {
		const progress = groupProgress(group);
		lines.push(
			"",
			`## ${group.title} — ${progress.done}/${progress.total}`,
			...group.todos.flatMap((item) => itemLines(t, item)),
		);
	}
	if (plan.todos.length > 0) {
		lines.push(
			"",
			...(plan.groups.length > 0 ? [`### ${t("chat.planExport.other")}`] : []),
			...plan.todos.flatMap((item) => itemLines(t, item)),
		);
	}
	const adopted = plan.adoptedCommits ?? [];
	const unattributed = plan.unattributed ?? [];
	if (all.length === 0 && adopted.length === 0 && unattributed.length === 0) {
		lines.push("", `_${t("chat.planExport.empty")}_`);
	}

	if (adopted.length > 0) {
		lines.push(
			"",
			`## ${t("chat.planExport.committedOutside")}`,
			...adopted.flatMap((item) => itemLines(t, item)),
		);
	}

	if (unattributed.length > 0) {
		lines.push(
			"",
			`## ${t("chat.planExport.outside")}`,
			...unattributed.map((f) => {
				const fileStat = plusMinus(f.added ?? 0, f.removed ?? 0);
				return `- \`${statusLetter(f.status)}\` ${f.path}${fileStat ? ` · ${fileStat}` : ""}`;
			}),
		);
	}

	return `${lines.join("\n")}\n`;
}

const todoRefetchBus = new Map<string, Set<() => void>>();

function subscribeTodoRefetch(key: string, listener: () => void): () => void {
	let set = todoRefetchBus.get(key);
	if (!set) {
		set = new Set();
		todoRefetchBus.set(key, set);
	}
	set.add(listener);
	return () => {
		const current = todoRefetchBus.get(key);
		current?.delete(listener);
		if (current && current.size === 0) todoRefetchBus.delete(key);
	};
}

function signalTodoRefetch(key: string, except?: () => void): void {
	const listeners = todoRefetchBus.get(key);
	if (!listeners) return;
	for (const listener of [...listeners]) {
		if (listener === except) continue;
		listener();
	}
}

export interface WorkspaceTodos {
	data: TodoPlan | null;
	failed: boolean;
	add: (title: string, surface?: "page" | "rail") => Promise<void>;
	remove: (id: string) => Promise<void>;
	openPlan: () => void;
	openChanges: (target: { sha: string } | { path: string }) => void;
}

export function useWorkspaceTodos(workspaceId: string): WorkspaceTodos {
	const [data, setData] = useState<TodoPlan | null>(null);
	const [failed, setFailed] = useState(false);
	const status = useAppStore((state) => state.status);
	const connectionGeneration = useAppStore((state) => state.connectionGeneration);
	const fsTick = useAppStore((state) => state.fsChangesByWorkspace[workspaceId]?.tick ?? 0);
	const identity = tupleKey("workspace-todos", workspaceId);
	const currentIdentity = useRef(identity);
	const readGeneration = useRef(0);
	const selfListenerRef = useRef<(() => void) | null>(null);
	const initializedIdentity = useRef<string | null>(null);

	useInsertionEffect(() => {
		currentIdentity.current = identity;
	}, [identity]);

	const live = useCallback(
		(expectedIdentity: string) => {
			const state = useAppStore.getState();
			return (
				currentIdentity.current === expectedIdentity && !state.removedWorkspaceIds[workspaceId]
			);
		},
		[workspaceId],
	);

	useEffect(() => {
		if (status !== "connected" || connectionGeneration === 0) return;
		let cancelled = false;
		const effectIdentity = identity;
		const effectConnectionGeneration = connectionGeneration;
		const load = (reset: boolean) => {
			const mine = ++readGeneration.current;
			if (reset) {
				setData(null);
				setFailed(false);
			}
			getTransport()
				.request("todo.list", { workspaceId })
				.then((plan) => {
					if (
						!cancelled &&
						readGeneration.current === mine &&
						isConnectedGeneration(useAppStore.getState(), effectConnectionGeneration) &&
						live(effectIdentity)
					) {
						setData(plan);
						setFailed(false);
					}
				})
				.catch(() => {
					if (
						!cancelled &&
						reset &&
						readGeneration.current === mine &&
						isConnectedGeneration(useAppStore.getState(), effectConnectionGeneration) &&
						live(effectIdentity)
					) {
						setFailed(true);
					}
				});
		};
		const reset = initializedIdentity.current !== identity;
		initializedIdentity.current = identity;
		load(reset);
		let refetch: ReturnType<typeof setTimeout> | undefined;
		const scheduleRefetch = () => {
			if (refetch) clearTimeout(refetch);
			refetch = setTimeout(() => load(false), 250);
		};
		selfListenerRef.current = scheduleRefetch;
		const unsubscribeBus = subscribeTodoRefetch(identity, scheduleRefetch);
		return () => {
			cancelled = true;
			readGeneration.current += 1;
			if (refetch) clearTimeout(refetch);
			unsubscribeBus();
		};
	}, [connectionGeneration, identity, live, status, workspaceId]);

	const prevFsTick = useRef(fsTick);
	useEffect(() => {
		if (prevFsTick.current === fsTick) return;
		prevFsTick.current = fsTick;
		selfListenerRef.current?.();
	}, [fsTick]);

	const broadcastWrite = (key: string): void =>
		signalTodoRefetch(key, selfListenerRef.current ?? undefined);

	const reloadPlan = async (): Promise<boolean> => {
		const requestIdentity = identity;
		const requestState = useAppStore.getState();
		const requestConnectionGeneration =
			requestState.status === "connected" ? requestState.connectionGeneration : null;
		const mine = ++readGeneration.current;
		const plan = await getTransport()
			.request("todo.list", { workspaceId })
			.catch(() => null);
		if (!plan) return false;
		const current = useAppStore.getState();
		if (
			requestConnectionGeneration !== null &&
			current.connectionGeneration !== requestConnectionGeneration &&
			readGeneration.current === mine &&
			live(requestIdentity)
		) {
			return reloadPlan();
		}
		if (readGeneration.current !== mine || !live(requestIdentity)) return false;
		setData(plan);
		return true;
	};

	const add = async (rawTitle: string, surface: "page" | "rail" = "page") => {
		const title = rawTitle.trim();
		if (!title) return;
		const requestIdentity = identity;
		const todo = await getTransport().request("todo.add", {
			workspaceId,
			title,
			surface,
		});
		if (!live(requestIdentity)) return;
		readGeneration.current += 1;
		setData((prev) =>
			prev &&
			![...prev.todos, ...prev.groups.flatMap((group) => group.todos)].some(
				(candidate) => candidate.id === todo.id,
			)
				? { ...prev, todos: [...prev.todos, todo] }
				: prev,
		);
		broadcastWrite(requestIdentity);
	};

	const openPlan = () => {
		const state = useAppStore.getState();
		const workspace = selectWorkspaceById(state, workspaceId);
		const title = workspace?.name ?? translate("shell.workbench.panel.plan");
		void getTransport()
			.request("todo.list", { workspaceId, opened: "page" })
			.catch(() => {});
		state.openDoc({
			kind: "plan",
			id: `${workspaceId}:plan`,
			workspaceId,
			name: title,
		});
	};

	const openChanges = (target: { sha: string } | { path: string }) => {
		const store = useAppStore.getState();
		if ("sha" in target) {
			store.setDiffScope(workspaceId, { kind: "commit", sha: target.sha });
			store.revealChanges(workspaceId);
			return;
		}
		store.setDiffScope(workspaceId, { kind: "branch" });
		store.requestChangesView(workspaceId, target.path);
	};

	const remove = async (id: string): Promise<void> => {
		const requestIdentity = identity;
		setData((prev) => {
			if (!prev) return prev;
			return {
				...prev,
				todos: prev.todos.filter((t) => t.id !== id),
				groups: prev.groups.map((g) => ({ ...g, todos: g.todos.filter((t) => t.id !== id) })),
			};
		});
		try {
			await getTransport().request("todo.remove", { workspaceId, id });
		} catch (error) {
			if (live(requestIdentity)) await reloadPlan();
			toast.error(errorText(error), translate("chat.todo.removeFailed"));
			return;
		}
		if (!live(requestIdentity)) return;
		await reloadPlan();
		broadcastWrite(identity);
	};

	return {
		data,
		failed,
		add,
		remove,
		openPlan,
		openChanges,
	};
}

const VERIFICATION_PROSE = [
	"min-w-0 max-w-none break-words text-text-muted",
	"[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
	"[&_p]:my-2 [&_strong]:text-text-default",
	"[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-16 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-16 [&_li]:my-2",
].join(" ");

export function SectionLabel({ label }: { label: string }) {
	return <div className="px-4 py-4 tr-text-eyebrow text-text-muted">{label}</div>;
}

export function PlanStatusIcon({ status }: { status: TodoStatus }) {
	if (status === "done") return <Check className="size-12 shrink-0 text-primary" />;
	if (status === "in_progress") return <CircleDot className="size-12 shrink-0 text-primary" />;
	return <Circle className="size-12 shrink-0 text-text-muted" />;
}

function PlanMarkdown({ text, className }: { text: string; className?: string }) {
	return (
		<div className={`tr-prose-chat ${className ?? ""}`}>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
		</div>
	);
}

function VerificationGlyph({ verification }: { verification: string }) {
	const status = verificationStatus(verification);
	const Icon = status === "claimed" ? ShieldCheck : CircleAlert;
	return (
		<span title={verification} className="inline-flex">
			<Icon
				data-testid="todo-verification-glyph"
				data-status={status}
				aria-label={verification}
				className={`size-14 shrink-0 ${
					status === "claimed" ? "text-feedback-success" : "text-feedback-warning"
				}`}
			/>
		</span>
	);
}

function VerificationBadge({ verification }: { verification: string }) {
	const t = useT();
	const status = verificationStatus(verification);
	const Icon = status === "claimed" ? ShieldCheck : CircleAlert;
	return (
		<div
			data-testid="todo-verification"
			data-status={status}
			title={
				status === "claimed"
					? t("chat.plan.verificationClaimed")
					: t("chat.plan.verificationMissing")
			}
			className="flex min-w-0 items-start gap-4 tr-text-metadata"
		>
			<Icon
				className={`mt-2 size-14 shrink-0 ${
					status === "claimed" ? "text-feedback-success" : "text-feedback-warning"
				}`}
			/>
			<PlanMarkdown text={verification} className={`min-w-0 flex-1 ${VERIFICATION_PROSE}`} />
		</div>
	);
}

function ChangeSetBlock({
	item,
	workspaceId,
	onOpenCommit,
}: {
	item: TodoItem;
	workspaceId: string;
	onOpenCommit: (sha: string) => void;
}) {
	const t = useT();
	const [expanded, setExpanded] = useState(false);
	const set = itemChangeSet(item);
	if (!set) return null;
	const Chevron = expanded ? ChevronDown : ChevronRight;
	const { count, added, removed } = changeSetCounts(set);
	return (
		<div
			className="mt-4"
			data-testid="plan-change-set"
			data-kind={set.kind}
			data-expanded={expanded}
		>
			<div className="flex items-center gap-8 px-4">
				<IconTooltip
					label={expanded ? t("plan.changeSet.hideFiles") : t("plan.changeSet.showFiles")}
				>
					<button
						type="button"
						data-testid="plan-change-set-toggle"
						aria-expanded={expanded}
						onClick={() => setExpanded((v) => !v)}
						className="flex min-h-32 min-w-0 items-center gap-4 rounded-sm px-4 py-2 text-left hover:bg-control-bg-hovered"
					>
						<Chevron className="size-16 shrink-0 text-text-muted" />
						<span className="shrink-0 tr-text-metadata text-text-subtle">
							{t("plan.fileCount", { count })}
						</span>
					</button>
				</IconTooltip>
				{set.kind === "commit" ? (
					<>
						<IconTooltip label={t("plan.changeSet.openCommit")}>
							<button
								type="button"
								data-testid="plan-commit-chip"
								onClick={() => onOpenCommit(set.sha)}
								className="flex min-h-32 shrink-0 items-center gap-4 rounded-sm px-4 py-2 tr-code-text text-text-subtle hover:bg-control-bg-hovered hover:text-text-default"
							>
								<GitCommitHorizontal className="size-14" />
								{set.sha.slice(0, 7)}
							</button>
						</IconTooltip>
						<DiffStatBadge added={added} removed={removed} />
					</>
				) : null}
			</div>
			{expanded ? (
				set.kind === "paths" ? (
					<ul className="flex flex-col">
						{set.paths.map((path) => (
							<FileRow
								key={path}
								file={{ path, status: "modified" }}
								onOpen={() => void openDiffInTab(workspaceId, { kind: "branch" }, path, "preview")}
							/>
						))}
					</ul>
				) : (
					<ul className="flex flex-col">
						{set.files.map((file) => (
							<FileRow
								key={file.path}
								file={file}
								onOpen={() =>
									void openDiffInTab(
										workspaceId,
										{ kind: "commit", sha: set.sha },
										file.path,
										"preview",
									)
								}
							/>
						))}
					</ul>
				)
			) : null}
		</div>
	);
}

const PLAN_CARD_CLASS =
	"mb-16 rounded-md border border-border-default bg-container-elevated-bg p-12";

type StageState = "done" | "active" | "pending";

function StageGlyph({ state }: { state: StageState }) {
	const Icon = state === "done" ? CircleCheck : state === "active" ? CircleDot : Circle;
	return (
		<Icon
			className={`size-14 shrink-0 ${
				state === "done"
					? "text-feedback-success"
					: state === "active"
						? "text-primary"
						: "text-text-muted"
			}`}
		/>
	);
}

function RevisionsBlock({
	item,
	onOpenCommit,
}: {
	item: TodoItem;
	onOpenCommit: (sha: string) => void;
}) {
	const t = useT();
	const revisions = itemRevisions(item);
	if (revisions.length < 2) return null;
	return (
		<div data-testid="plan-revisions">
			<span className="px-4 tr-text-eyebrow text-text-subtle">{t("plan.revisions.title")}</span>
			<ol className="flex flex-col">
				{revisions.map((rev, index) => {
					const stat = rev.files ? changeSetStat(rev.files) : null;
					return (
						<li
							key={rev.sha}
							data-testid="plan-revision"
							data-sha={rev.sha}
							className="flex items-center gap-8 px-4"
						>
							<span className="w-20 shrink-0 text-right tr-text-metadata text-text-muted">
								#{index + 1}
							</span>
							<button
								type="button"
								onClick={() => onOpenCommit(rev.sha)}
								title={t("plan.revisions.openCommit")}
								className="flex min-h-8 shrink-0 items-center gap-4 rounded-sm px-4 py-2 tr-code-text text-text-subtle hover:bg-control-bg-hovered hover:text-text-default"
							>
								<GitCommitHorizontal className="size-14" />
								{rev.sha.slice(0, 7)}
							</button>
							{stat ? <DiffStatBadge added={stat.added} removed={stat.removed} /> : null}
							{index === revisions.length - 1 ? (
								<span className="tr-text-metadata text-text-subtle">
									{t("plan.revisions.current")}
								</span>
							) : null}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

function ItemBlock({
	item,
	workspaceId,
	onOpenCommit,
}: {
	item: TodoItem;
	workspaceId: string;
	onOpenCommit: (sha: string) => void;
}) {
	const t = useT();
	const hideStatusGlyph = item.status === "done";
	const set = itemChangeSet(item);
	const counts = set ? changeSetCounts(set) : null;
	const fileCount = counts?.count ?? 0;
	const hasDetails = Boolean(item.note || item.summary || item.verification || set !== null);
	const collapsible = hasDetails;
	const [expanded, setExpanded] = useState(false);
	const detailsClass = collapsible ? "hidden group-data-[expanded=true]:flex" : "flex";
	return (
		<li
			id={`plan-item-${item.id}`}
			data-testid="plan-item"
			data-status={item.status}
			data-expanded={collapsible ? expanded : undefined}
			className="group py-2"
		>
			<div className="flex items-start gap-8 rounded-sm p-4 transition-colors group-hover:bg-control-bg-hovered">
				<span className="flex min-h-24 shrink-0 items-center">
					{hideStatusGlyph ? (
						<span className="size-12 shrink-0" aria-hidden="true" />
					) : (
						<PlanStatusIcon status={item.status} />
					)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<div className="flex min-h-8 items-center gap-8">
						{collapsible ? (
							<button
								type="button"
								data-testid="plan-item-toggle"
								aria-expanded={expanded}
								onClick={() => setExpanded((v) => !v)}
								title={expanded ? t("plan.item.hideDetails") : t("plan.item.showDetails")}
								className="flex min-w-0 flex-1 items-center gap-8 rounded-sm text-left"
							>
								<ChevronRight className="size-14 shrink-0 text-text-muted transition-transform group-data-[expanded=true]:rotate-90" />
								<span className="min-w-0 flex-1 break-words tr-title-section text-text-default">
									{item.title}
								</span>
							</button>
						) : (
							<span className="flex min-w-0 flex-1 items-center gap-8">
								<span className="size-14 shrink-0" />
								<span className="min-w-0 flex-1 break-words tr-title-section text-text-default">
									{item.title}
								</span>
							</span>
						)}
					</div>
					{collapsible && (item.summary || item.verification || set) ? (
						<div
							data-testid="plan-item-meta"
							className="flex flex-col gap-2 tr-text-metadata text-text-subtle group-data-[expanded=true]:hidden"
						>
							{item.status === "done" && item.summary ? (
								<span data-testid="plan-item-summary-preview" className="flex items-start gap-8">
									<span className="size-14 shrink-0" />
									<PlanMarkdown
										text={item.summary}
										className={`min-w-0 flex-1 line-clamp-1 ${SUMMARY_PROSE}`}
									/>
								</span>
							) : null}
							{item.verification || set ? (
								<span className="flex items-center gap-8">
									<span className="size-14 shrink-0" />
									{item.verification ? (
										<VerificationGlyph verification={item.verification} />
									) : null}
									{set ? <span>{t("plan.fileCount", { count: fileCount })}</span> : null}
									{set?.kind === "commit" && counts ? (
										<span className="flex items-center gap-8 max-sm:hidden">
											<span className="tr-code-text">{set.sha.slice(0, 7)}</span>
											<DiffStatBadge added={counts.added} removed={counts.removed} />
										</span>
									) : null}
								</span>
							) : null}
						</div>
					) : null}
				</div>
			</div>
			{hasDetails ? (
				<div
					className={`mt-2 ml-24 flex-col gap-2 border-border-default border-l pl-12 ${detailsClass}`}
				>
					{item.note ? <div className="tr-text-metadata text-text-subtle">{item.note}</div> : null}
					{item.status === "done" && item.summary ? (
						<div data-testid="plan-item-summary">
							<PlanMarkdown text={item.summary} className={`tr-text-metadata ${SUMMARY_PROSE}`} />
						</div>
					) : null}
					{item.status === "done" && item.verification ? (
						<VerificationBadge verification={item.verification} />
					) : null}
					<ChangeSetBlock item={item} workspaceId={workspaceId} onOpenCommit={onOpenCommit} />
					<RevisionsBlock item={item} onOpenCommit={onOpenCommit} />
				</div>
			) : null}
		</li>
	);
}

const SUMMARY_PROSE = [
	"max-w-none break-words text-text-muted",
	"[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
	"[&_h1]:mt-12 [&_h1]:mb-8 [&_h1]:tr-title-dialog [&_h1]:text-text-default",
	"[&_h2]:mt-12 [&_h2]:mb-8 [&_h2]:tr-title-dialog [&_h2]:text-text-default",
	"[&_h3]:mt-12 [&_h3]:mb-4 [&_h3]:tr-title-section [&_h3]:text-text-default",
	"[&_h4]:mt-8 [&_h4]:mb-4 [&_h4]:tr-title-section [&_h4]:text-text-default",
	"[&_p]:my-4 [&_strong]:text-text-default",
	"[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
	"[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-16 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-16 [&_li]:my-2",
	"[&_li>ul]:my-2 [&_li>ol]:my-2 [&_li_p]:my-2",
	"[&_code]:rounded-xs [&_code]:bg-container-elevated-bg [&_code]:px-4 [&_code]:py-2 [&_code]:tr-code-text [&_code]:text-text-default",
	"[&_pre]:my-8 [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:border [&_pre]:border-border-default [&_pre]:bg-container-elevated-bg [&_pre]:p-8",
	"[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:tr-code-text",
	"[&_blockquote]:my-8 [&_blockquote]:border-primary-muted [&_blockquote]:border-l-2 [&_blockquote]:pl-8 [&_blockquote]:text-text-muted",
	"[&_hr]:my-12 [&_hr]:h-px [&_hr]:border-0 [&_hr]:bg-border-default",
].join(" ");

function PlanSummary({ summary, stale = false }: { summary: string; stale?: boolean }) {
	const t = useT();
	return (
		<div className={`${PLAN_CARD_CLASS} flex flex-col gap-8`}>
			<div className="flex flex-wrap items-center gap-x-8 gap-y-2">
				<span className="tr-text-eyebrow text-text-subtle">{t("plan.summary.title")}</span>
				{stale ? (
					<span
						data-testid="plan-summary-stale"
						title={t("plan.summary.staleTitle")}
						className="flex items-center gap-4 tr-text-metadata text-text-muted"
					>
						<Loader2 className="size-14 shrink-0 animate-spin text-text-muted" />
						{t("plan.summary.updating")}
					</span>
				) : null}
			</div>
			<div data-testid="plan-overall-summary" className="max-h-[40vh] overflow-y-auto">
				<PlanMarkdown text={summary} className={`tr-text-ui ${SUMMARY_PROSE}`} />
			</div>
		</div>
	);
}

function GroupSection({
	group,
	workspaceId,
	onOpenCommit,
}: {
	group: TodoGroupItem;
	workspaceId: string;
	onOpenCommit: (sha: string) => void;
}) {
	const t = useT();
	const { done, total } = groupProgress(group);
	const empty = group.todos.length === 0;
	return (
		<section className="mb-16" data-testid="plan-group" data-empty={empty || undefined}>
			<h2 className="mb-4 flex items-baseline gap-8 border-border-default border-b pb-4 tr-title-dialog text-text-default">
				<span className="min-w-0 flex-1 break-words">{group.title}</span>
				<span className="shrink-0 tr-text-eyebrow text-text-subtle">
					{empty ? t("plan.group.planning") : `${done}/${total}`}
				</span>
			</h2>
			{empty ? (
				<p
					data-testid="plan-group-planning"
					className="flex items-center gap-8 px-4 py-4 tr-text-metadata text-text-subtle"
				>
					<Loader2 className="size-14 shrink-0 animate-spin text-primary" />
					{t("plan.group.forming")}
				</p>
			) : null}
			<ul className="flex flex-col">
				{group.todos.map((item) => (
					<ItemBlock
						key={item.id}
						item={item}
						workspaceId={workspaceId}
						onOpenCommit={onOpenCommit}
					/>
				))}
			</ul>
		</section>
	);
}

function downloadMarkdown(markdown: string, title: string): void {
	const blob = new Blob([markdown], { type: "text/markdown" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `plan-${title.replace(/[^\w-]+/g, "-").toLowerCase() || "plan"}.md`;
	a.click();
	URL.revokeObjectURL(url);
}

function PlanComposer({
	icon: Icon,
	placeholder,
	testId,
	autoFocus = false,
	onSubmit,
	onClose,
}: {
	icon: typeof Plus;
	placeholder: string;
	testId: string;
	autoFocus?: boolean;
	onSubmit: (text: string) => Promise<void> | void;
	onClose?: (() => void) | undefined;
}) {
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const submitting = useRef(false);
	useEffect(() => {
		if (autoFocus) inputRef.current?.focus();
	}, [autoFocus]);
	const submit = async () => {
		const text = draft.trim();
		if (!text || submitting.current) return;
		submitting.current = true;
		const send = async () => {
			await onSubmit(text);
			setDraft("");
		};
		await send()
			.catch(() => {})
			.finally(() => {
				submitting.current = false;
			});
	};
	return (
		<div className="mt-8 flex items-start gap-8 rounded-sm border border-control-border-default bg-control-bg px-12 py-8 transition-colors focus-within:border-control-border-active">
			<Icon className="mt-2 size-14 shrink-0 text-text-muted" />
			<textarea
				ref={inputRef}
				data-testid={testId}
				rows={1}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						void submit();
					} else if (e.key === "Escape" && onClose) {
						onClose();
					}
				}}
				placeholder={placeholder}
				className="field-sizing-content max-h-[10rem] min-w-0 flex-1 resize-none overflow-x-hidden overflow-y-auto bg-transparent tr-text-ui text-text-default outline-none placeholder:text-text-muted"
			/>
		</div>
	);
}

function PlanCardSection({
	testId,
	label,
	Icon,
	iconClass,
	children,
}: {
	testId: string;
	label: string;
	Icon: typeof CircleDot;
	iconClass: string;
	children: ReactNode;
}) {
	return (
		<section data-testid={testId} className={PLAN_CARD_CLASS}>
			<div className="mb-8 flex items-center gap-8">
				<Icon className={`size-14 shrink-0 ${iconClass}`} />
				<h2 className="min-w-0 flex-1 tr-title-dialog text-text-default">{label}</h2>
			</div>
			{children}
		</section>
	);
}

function SessionBlock({
	activeGroups,
	activeLoose,
	pendingGroups,
	pendingLoose,
	allDone,
	onAdd,
	renderGroup,
	renderItem,
}: {
	activeGroups: TodoGroupItem[];
	activeLoose: TodoItem[];
	pendingGroups: TodoGroupItem[];
	pendingLoose: TodoItem[];
	allDone: boolean;
	onAdd: (title: string) => Promise<void>;
	renderGroup: (group: TodoGroupItem) => ReactNode;
	renderItem: (item: TodoItem) => ReactNode;
}) {
	const t = useT();
	const [adding, setAdding] = useState(false);
	const hasActive = activeGroups.length > 0 || activeLoose.length > 0;
	const hasPending = pendingGroups.length > 0 || pendingLoose.length > 0;
	const hasAny = hasActive || hasPending;
	const idleEmpty = !hasAny && !allDone;
	return (
		<section data-testid="plan-now-executing" className={PLAN_CARD_CLASS}>
			<div className="mb-8 flex items-center gap-8">
				<CircleDot className="size-14 shrink-0 text-primary" />
				<h2 className="shrink-0 tr-title-dialog text-text-default">{t("plan.session.now")}</h2>
				<Button
					variant="ghost"
					size="m"
					iconLeft={Plus}
					data-testid="plan-add-task"
					onClick={() => setAdding((v) => !v)}
					tooltip={t("plan.session.addTaskTitle")}
					className="ml-auto shrink-0"
				>
					{t("plan.session.task")}
				</Button>
			</div>
			{hasActive ? (
				<>
					{activeGroups.map(renderGroup)}
					{activeLoose.length > 0 ? (
						<ul className="flex flex-col">{activeLoose.map(renderItem)}</ul>
					) : null}
				</>
			) : null}
			{hasPending ? (
				<>
					{hasActive ? <SectionLabel label={t("plan.session.upNext")} /> : null}
					{pendingGroups.map(renderGroup)}
					{pendingLoose.length > 0 ? (
						<ul className="flex flex-col">{pendingLoose.map(renderItem)}</ul>
					) : null}
				</>
			) : null}
			{idleEmpty && !adding ? (
				<button
					type="button"
					data-testid="plan-now-idle"
					data-glance="waiting"
					onClick={() => setAdding(true)}
					title={t("plan.session.addTask")}
					className="group flex w-full items-center gap-8 rounded-sm px-4 py-2 text-left tr-text-ui text-text-subtle transition-colors hover:bg-control-bg-hovered hover:text-text-default"
				>
					<span className="min-w-0 flex-1">{t("plan.session.empty")}</span>
					<span className="flex shrink-0 items-center gap-4 text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
						<Plus className="size-14" />
						{t("plan.session.addTask")}
					</span>
				</button>
			) : null}
			{adding ? (
				<PlanComposer
					icon={Plus}
					testId="plan-add-input"
					placeholder={t("plan.session.addPlaceholder")}
					autoFocus
					onSubmit={onAdd}
					onClose={() => setAdding(false)}
				/>
			) : null}
		</section>
	);
}

export default function PlanPane({ workspaceId }: { workspaceId: string; sessionId?: string }) {
	const t = useT();
	const plan = useWorkspaceTodos(workspaceId);
	const pushToast = useAppStore((s) => s.pushToast);
	const workspace = useAppStore((s) => selectWorkspaceById(s, workspaceId));
	const title = workspace?.name ?? t("shell.workbench.panel.plan");

	if (plan.data === null) {
		if (plan.failed) {
			return (
				<div className="flex h-full items-center justify-center text-text-subtle tr-text-ui">
					{t("plan.pane.loadFailed")}
				</div>
			);
		}
		return <LoadingRegion rows={8} className="h-full p-12" />;
	}
	const data = plan.data;
	const { done, total } = planSummary(data);
	const sections = planSections(data);
	const adopted = adoptedCommits(data);
	const onOpenCommit = (sha: string) => plan.openChanges({ sha });
	const allItems = [...flatItems(data), ...adopted];
	const commitCount = allItems.reduce((n, item) => n + itemRevisions(item).length, 0);
	const buildDone = total > 0 && done === total;
	const staleSummary = planStaleSummary(data);
	const summaryProse = buildDone ? planCompletionSummary(data) : staleSummary;
	const buildState: StageState = buildDone ? "done" : "active";

	const exportMarkdown = () => planToMarkdown(t, data, title);
	const copyMarkdown = () => {
		void navigator.clipboard
			.writeText(exportMarkdown())
			.then(() =>
				pushToast({
					variant: "success",
					title: t("plan.copied.title"),
					message: t("plan.copied.message"),
				}),
			)
			.catch(() =>
				pushToast({
					variant: "error",
					title: t("plan.copyFailed.title"),
					message: t("plan.copyFailed.message"),
				}),
			);
	};

	const renderGroup = (group: TodoGroupItem): ReactNode => (
		<GroupSection
			key={group.id}
			group={group}
			workspaceId={workspaceId}
			onOpenCommit={onOpenCommit}
		/>
	);
	const renderItem = (item: TodoItem): ReactNode => (
		<ItemBlock key={item.id} item={item} workspaceId={workspaceId} onOpenCommit={onOpenCommit} />
	);

	return (
		<div
			data-testid="plan-pane"
			className="h-full overflow-auto bg-container-content-bg motion-safe:animate-reveal"
		>
			<div className="mx-auto max-w-[52rem] px-16 py-16">
				<header className="mb-16 flex items-center gap-12">
					<div className="min-w-0 flex-1">
						<h1 className="truncate tr-heading-sm text-text-default">
							{t("plan.header.title", { title })}
						</h1>
						<div
							data-testid="plan-progress"
							className="flex flex-wrap items-center gap-4 tr-text-metadata text-text-subtle"
						>
							<StageGlyph state={buildState} />
							<span>{t("plan.header.done", { done, total })}</span>
						</div>
						{workspace ? (
							<div
								data-testid="plan-context"
								className="mt-2 flex flex-wrap items-center gap-8 tr-text-metadata text-text-subtle"
							>
								<span className="flex min-w-0 items-center gap-4">
									<GitBranch className="size-12 shrink-0" />
									<span className="truncate">
										{workspace.baseBranch} ← {workspace.branch}
									</span>
								</span>
								<PlanCommitsMenu
									workspaceId={workspaceId}
									reloadSignal={commitCount}
									onOpenCommit={onOpenCommit}
								/>
								{workspace.diffStats ? (
									<DiffStatBadge
										added={workspace.diffStats.added}
										removed={workspace.diffStats.removed}
									/>
								) : null}
							</div>
						) : null}
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton
								size="l"
								icon={MoreVertical}
								label={t("plan.menu.label")}
								data-testid="plan-menu"
								wrapTrigger
								className="shrink-0"
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" data-testid="plan-menu-content">
							<DropdownMenuItem data-testid="plan-copy-markdown" onSelect={() => copyMarkdown()}>
								<Copy />
								{t("common.copy")}
							</DropdownMenuItem>
							<DropdownMenuItem
								data-testid="plan-save-markdown"
								onSelect={() => downloadMarkdown(exportMarkdown(), title)}
							>
								<Download />
								{t("plan.menu.saveMarkdown")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>
				{summaryProse ? <PlanSummary summary={summaryProse} stale={!buildDone} /> : null}
				<SessionBlock
					activeGroups={sections.activeGroups}
					activeLoose={sections.activeLoose}
					pendingGroups={sections.pendingGroups}
					pendingLoose={sections.pendingLoose}
					allDone={buildDone}
					onAdd={(taskTitle) => plan.add(taskTitle, "page")}
					renderGroup={renderGroup}
					renderItem={renderItem}
				/>
				{sections.doneGroups.length > 0 || sections.doneLoose.length > 0 ? (
					<PlanCardSection
						testId="plan-done-section"
						label={t("chat.todo.status.done")}
						Icon={CircleCheck}
						iconClass="text-feedback-success"
					>
						{sections.doneGroups.map(renderGroup)}
						{sections.doneLoose.length > 0 ? (
							<ul className="flex flex-col">{sections.doneLoose.map(renderItem)}</ul>
						) : null}
					</PlanCardSection>
				) : null}
				{adopted.length > 0 ? (
					<section className="mb-16" data-testid="plan-adopted-commits">
						<h2 className="mb-4 flex items-baseline gap-8 border-border-default border-b pb-4 tr-title-dialog text-text-default">
							<span className="min-w-0 flex-1 truncate">{t("plan.adopted.title")}</span>
							<span className="shrink-0 tr-text-eyebrow text-text-subtle">
								{t("plan.adopted.count", { count: adopted.length })}
							</span>
						</h2>
						<p className="mb-4 px-4 tr-text-metadata text-text-subtle">
							{t("plan.adopted.description")}
						</p>
						<ul className="flex flex-col">
							{adopted.map((item) => (
								<ItemBlock
									key={item.id}
									item={item}
									workspaceId={workspaceId}
									onOpenCommit={onOpenCommit}
								/>
							))}
						</ul>
					</section>
				) : null}
				{data.unattributed && data.unattributed.length > 0 ? (
					<section className="mb-16" data-testid="plan-unattributed">
						<h2 className="mb-4 flex items-baseline gap-8 border-border-default border-b pb-4 tr-title-dialog text-text-default">
							<span className="min-w-0 flex-1 truncate">{t("plan.unattributed.title")}</span>
							<span className="shrink-0 tr-text-eyebrow text-text-subtle">
								{t("plan.fileCount", { count: data.unattributed.length })}
							</span>
						</h2>
						<p className="mb-4 px-4 tr-text-metadata text-text-subtle">
							{t("plan.unattributed.description")}
						</p>
						<ul className="flex flex-col">
							{data.unattributed.map((file) => (
								<FileRow
									key={file.path}
									file={file}
									onOpen={() =>
										void openDiffInTab(workspaceId, { kind: "uncommitted" }, file.path, "preview")
									}
								/>
							))}
						</ul>
					</section>
				) : null}
			</div>
		</div>
	);
}
