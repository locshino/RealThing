import {
	RiCheckLine as Check,
	RiArrowDownSLine as ChevronDown,
	RiArrowRightSLine as ChevronRight,
	RiCircleLine as Circle,
	RiCloseLine as Close,
	RiFileTextLine as FileText,
	RiLoaderLine as LoaderCircle,
	RiAddLine as Plus,
	RiUser3Line as UserRound,
} from "@remixicon/react";
import type { TodoGroupItem, TodoItem, TodoPlan, TodoStatus } from "@realthing/contracts";
import type { MessageKey } from "@realthing/locales";
import { useT } from "@realthing/locales/react";
import { IconButton } from "@realthing/ui/button";
import { cn } from "@realthing/ui/utils";
import { useEffect, useState } from "react";
import { getTransport } from "../transport";
import {
	groupProgress,
	type ItemChangeSet,
	itemChangeSet,
	PlanStatusIcon,
	planSections,
	SectionLabel,
	useWorkspaceTodos,
} from "./PlanPane";

type ChangeTarget = { sha: string } | { path: string };

const STATUS_LABEL = {
	in_progress: "chat.todo.status.inProgress",
	pending: "chat.todo.status.pending",
	done: "chat.todo.status.done",
} satisfies Record<TodoStatus, MessageKey>;

function TodoAddRow({
	onAdd,
	onOpenPlan,
}: {
	onAdd: (title: string) => Promise<void>;
	onOpenPlan?: () => void;
}) {
	const t = useT();
	const [draft, setDraft] = useState("");
	const submit = async () => {
		const title = draft.trim();
		if (!title) return;
		try {
			await onAdd(title);
			setDraft("");
		} catch {}
	};
	return (
		<div className="flex items-center gap-8 px-8 py-4">
			<Plus className="size-14 shrink-0 text-text-muted" />
			<input
				data-testid="todo-add-input"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") void submit();
				}}
				placeholder={t("chat.todo.addPlaceholder")}
				className="min-w-0 flex-1 bg-transparent tr-text-ui text-text-default outline-none placeholder:text-text-muted"
			/>
			{onOpenPlan ? (
				<IconButton
					icon={FileText}
					data-testid="todo-open-plan"
					onClick={onOpenPlan}
					label={t("chat.todo.openPlan")}
					tooltip={t("chat.todo.openPlanTooltip")}
					className="shrink-0"
				/>
			) : null}
		</div>
	);
}

function ChangeSetChip({
	set,
	onOpen,
}: {
	set: ItemChangeSet;
	onOpen: (target: ChangeTarget) => void;
}) {
	const t = useT();
	const [expanded, setExpanded] = useState(false);
	const count = set.kind === "commit" ? set.files.length : set.paths.length;
	const open = () => {
		if (set.kind === "commit") return onOpen({ sha: set.sha });
		if (set.paths.length === 1 && set.paths[0]) return onOpen({ path: set.paths[0] });
		setExpanded((v) => !v);
	};
	return (
		<div className="min-w-0">
			<button
				type="button"
				data-testid="todo-changes-chip"
				data-kind={set.kind}
				onClick={open}
				title={
					set.kind === "commit"
						? t("chat.todo.reviewCommit", { sha: set.sha.slice(0, 7) })
						: t("chat.todo.reviewFiles")
				}
				className="tr-text-metadata text-text-subtle underline-offset-2 hover:text-text-default hover:underline"
			>
				{t("chat.todo.files", { count })}
			</button>
			{expanded && set.kind === "paths" ? (
				<ul className="mt-4 flex flex-col gap-4">
					{set.paths.map((path) => (
						<li key={path}>
							<button
								type="button"
								data-testid="todo-change-path"
								onClick={() => onOpen({ path })}
								title={path}
								className="block max-w-full truncate tr-text-metadata text-text-subtle hover:text-text-default hover:underline"
							>
								{path}
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function TodoRow({
	todo,
	onOpenChanges,
	onRemove,
}: {
	todo: TodoItem;
	onOpenChanges?: ((target: ChangeTarget) => void) | undefined;
	onRemove?: ((id: string) => Promise<void>) | undefined;
}) {
	const t = useT();
	const changeSet = onOpenChanges ? itemChangeSet(todo) : null;
	return (
		<li
			data-testid="todo-row"
			data-row
			data-status={todo.status}
			className="group flex items-center gap-8 rounded-sm px-4 py-4 hover:bg-control-bg-hovered"
		>
			<span className="shrink-0" title={t(STATUS_LABEL[todo.status])}>
				<PlanStatusIcon status={todo.status} />
			</span>
			<div className="min-w-0 flex-1">
				<div
					className={cn(
						"truncate tr-text-ui",
						todo.status === "done" ? "text-text-muted" : "text-text-default",
					)}
				>
					{todo.title}
				</div>
				{changeSet && onOpenChanges ? (
					<ChangeSetChip set={changeSet} onOpen={onOpenChanges} />
				) : null}
			</div>
			{todo.origin === "user" ? (
				<span
					data-testid="todo-origin-user"
					title={t("chat.todo.userOrigin")}
					className="shrink-0 text-text-muted"
				>
					<UserRound className="size-14" />
				</span>
			) : null}
			{onRemove && todo.status !== "done" ? (
				<IconButton
					icon={Close}
					size="s"
					data-testid="todo-remove"
					label={t("chat.todo.remove")}
					onClick={() => {
						void onRemove(todo.id);
					}}
					className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
				/>
			) : null}
		</li>
	);
}

function GroupBlock({
	group,
	onOpenChanges,
	onRemove,
}: {
	group: TodoGroupItem;
	onOpenChanges?: ((target: ChangeTarget) => void) | undefined;
	onRemove?: ((id: string) => Promise<void>) | undefined;
}) {
	const t = useT();
	const status = group.status;
	const { done, total } = groupProgress(group);
	const empty = group.todos.length === 0;
	return (
		<div
			className="mb-8"
			data-testid="todo-group"
			data-status={status}
			data-empty={empty || undefined}
		>
			<div className="flex items-center gap-8 px-4 py-4">
				{status === "active" ? (
					<PlanStatusIcon status="in_progress" />
				) : (
					<Circle className="size-12 shrink-0 text-text-muted" />
				)}
				<span
					className={cn(
						"min-w-0 flex-1 truncate",
						status === "active"
							? "tr-title-compact text-text-default"
							: "tr-text-ui text-text-muted",
					)}
				>
					{group.title}
				</span>
				<span
					data-testid="todo-group-progress"
					className="shrink-0 tr-text-eyebrow text-text-muted"
				>
					{empty ? t("chat.todo.planning") : `${done}/${total}`}
				</span>
			</div>
			{empty ? (
				<p
					data-testid="todo-group-planning"
					className="ml-12 flex items-center gap-8 border-border-default border-l py-4 pl-8 tr-text-metadata text-text-subtle"
				>
					<LoaderCircle className="size-12 shrink-0 animate-spin text-primary" />
					{t("chat.todo.planForming")}
				</p>
			) : null}
			<ul className="ml-12 flex flex-col border-border-default border-l pl-8">
				{group.todos.map((todo) => (
					<TodoRow key={todo.id} todo={todo} onOpenChanges={onOpenChanges} onRemove={onRemove} />
				))}
			</ul>
		</div>
	);
}

function DoneGroup({
	group,
	onOpenChanges,
}: {
	group: TodoGroupItem;
	onOpenChanges?: ((target: ChangeTarget) => void) | undefined;
}) {
	const t = useT();
	const [expanded, setExpanded] = useState(false);
	const Chevron = expanded ? ChevronDown : ChevronRight;
	return (
		<div className="mb-8">
			<button
				type="button"
				data-testid="todo-group-done"
				data-expanded={expanded}
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-8 rounded-sm px-4 py-4 text-left hover:bg-control-bg-hovered"
			>
				<Chevron className="size-16 shrink-0 text-text-muted" />
				<Check className="size-12 shrink-0 text-primary" />
				<span className="min-w-0 flex-1 truncate tr-text-ui text-text-muted">{group.title}</span>
				<span className="shrink-0 tr-text-eyebrow text-text-muted">
					{t("chat.todo.steps", { count: group.todos.length })}
				</span>
			</button>
			{expanded ? (
				<ul className="ml-12 flex flex-col border-border-default border-l pl-8">
					{group.todos.map((todo) => (
						<TodoRow key={todo.id} todo={todo} onOpenChanges={onOpenChanges} />
					))}
				</ul>
			) : null}
		</div>
	);
}

function LooseList({
	items,
	onOpenChanges,
	onRemove,
}: {
	items: TodoItem[];
	onOpenChanges?: ((target: ChangeTarget) => void) | undefined;
	onRemove?: ((id: string) => Promise<void>) | undefined;
}) {
	if (items.length === 0) return null;
	return (
		<ul className="flex flex-col">
			{items.map((todo) => (
				<TodoRow key={todo.id} todo={todo} onOpenChanges={onOpenChanges} onRemove={onRemove} />
			))}
		</ul>
	);
}

function TodoRows({
	plan,
	onOpenChanges,
	onRemove,
}: {
	plan: TodoPlan;
	onOpenChanges?: ((target: ChangeTarget) => void) | undefined;
	onRemove?: ((id: string) => Promise<void>) | undefined;
}) {
	const t = useT();
	const s = planSections(plan);
	const hasTodo = s.pendingGroups.length > 0 || s.pendingLoose.length > 0;
	const hasDone = s.doneGroups.length > 0 || s.doneLoose.length > 0;
	const rowProps = { onOpenChanges, onRemove };
	return (
		<>
			{s.activeGroups.map((group) => (
				<GroupBlock key={group.id} group={group} {...rowProps} />
			))}
			<LooseList items={s.activeLoose} {...rowProps} />
			{hasTodo ? <SectionLabel label={t("chat.todo.status.pending")} /> : null}
			{s.pendingGroups.map((group) => (
				<GroupBlock key={group.id} group={group} {...rowProps} />
			))}
			<LooseList items={s.pendingLoose} {...rowProps} />
			{hasDone ? <SectionLabel label={t("chat.todo.status.done")} /> : null}
			{s.doneGroups.map((group) => (
				<DoneGroup key={group.id} group={group} onOpenChanges={onOpenChanges} />
			))}
			<LooseList items={s.doneLoose} {...rowProps} />
		</>
	);
}

export default function PlanRailPane({ workspaceId }: { workspaceId: string; sessionId?: string }) {
	const t = useT();
	const plan = useWorkspaceTodos(workspaceId);
	useEffect(() => {
		void getTransport()
			.request("todo.list", { workspaceId, opened: "rail" })
			.catch(() => {});
	}, [workspaceId]);

	if (plan.data === null) {
		return (
			<div
				data-testid="plan-rail-loading"
				className="flex h-full items-center justify-center p-16 text-text-subtle tr-text-ui"
			>
				{plan.failed ? t("plan.rail.loadFailed") : t("common.loading")}
			</div>
		);
	}

	const empty = plan.data.todos.length === 0 && plan.data.groups.length === 0;

	return (
		<div
			data-testid="plan-rail-pane"
			data-glance="waiting"
			className="flex h-full min-h-0 flex-col overflow-hidden"
		>
			<div className="shrink-0 border-border-muted border-b">
				<TodoAddRow onAdd={(title) => plan.add(title, "rail")} onOpenPlan={plan.openPlan} />
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-4">
				{empty ? (
					<p className="px-4 py-4 text-text-muted tr-text-metadata">{t("plan.rail.empty")}</p>
				) : (
					<TodoRows plan={plan.data} onOpenChanges={plan.openChanges} onRemove={plan.remove} />
				)}
			</div>
		</div>
	);
}
