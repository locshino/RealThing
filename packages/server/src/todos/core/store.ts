import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	TODO_ARTIFACT_KINDS,
	TODO_ORIGINS,
	TODO_STATUSES,
	type Todo,
	type TodoArtifact,
	type TodoFile,
	type TodoGroup,
	type TodoGroupStatus,
	type TodoInput,
	type TodoOrigin,
	type TodoPatch,
	type TodoPlan,
	type TodoPromoteResult,
	type TodoStatus,
	type TodoUpdateResult,
} from "./types.ts";

const CONTEXT_DIR = ".realthing/context";

export const STORE_DIR = `${CONTEXT_DIR}/todos`;

function assertSafeScopeId(scopeId: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(scopeId)) {
		throw new Error(`Invalid scope id for TODO store: ${JSON.stringify(scopeId)}`);
	}
}

export function storeRel(scopeId = "workspace"): string {
	assertSafeScopeId(scopeId);
	return `${STORE_DIR}/${scopeId}.json`;
}

export function countItems(plan: TodoPlan): number {
	return plan.todos.length + plan.groups.reduce((n, g) => n + g.todos.length, 0);
}

export function flatItems(plan: TodoPlan): Todo[] {
	return [...plan.groups.flatMap((g) => g.todos), ...plan.todos];
}

export function groupStatus(group: TodoGroup): TodoGroupStatus {
	if (group.todos.length > 0 && group.todos.every((t) => t.status === "done")) return "done";
	if (group.todos.some((t) => t.status === "in_progress")) return "active";
	return "pending";
}

const CURRENT_VERSION = 6 as const;

const STATUS_SET: ReadonlySet<string> = new Set(TODO_STATUSES);
const ORIGIN_SET: ReadonlySet<string> = new Set(TODO_ORIGINS);
const ARTIFACT_KIND_SET: ReadonlySet<string> = new Set(TODO_ARTIFACT_KINDS);

function isStatus(v: unknown): v is TodoStatus {
	return typeof v === "string" && STATUS_SET.has(v);
}
function isOrigin(v: unknown): v is TodoOrigin {
	return typeof v === "string" && ORIGIN_SET.has(v);
}

function nowIso(): string {
	return new Date().toISOString();
}
function freshId(prefix: string): string {
	return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function flattenTitle(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

function sanitizeArtifacts(raw: unknown): TodoArtifact[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const out: TodoArtifact[] = [];
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const o = entry as Record<string, unknown>;
		if (typeof o.kind !== "string" || !ARTIFACT_KIND_SET.has(o.kind)) continue;
		const artifact: TodoArtifact = { kind: o.kind as TodoArtifact["kind"] };
		if (typeof o.path === "string" && o.path) artifact.path = o.path;
		if (typeof o.sha === "string" && o.sha) artifact.sha = o.sha;
		if (typeof o.label === "string" && o.label) artifact.label = o.label;
		if (artifact.kind === "commit" ? !artifact.sha : !artifact.path) continue;
		out.push(artifact);
	}
	return out.length > 0 ? out : undefined;
}

function sanitize(raw: unknown): Todo | null {
	if (typeof raw !== "object" || raw === null) return null;
	const o = raw as Record<string, unknown>;
	if (typeof o.id !== "string" || typeof o.title !== "string") return null;
	const now = nowIso();
	const origin: TodoOrigin = isOrigin(o.origin) ? o.origin : "user";
	const todo: Todo = {
		id: o.id,
		title: flattenTitle(o.title),
		status: isStatus(o.status) ? o.status : "pending",
		origin,
		createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
		updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
	};
	if (typeof o.note === "string" && o.note) todo.note = o.note;
	if (typeof o.summary === "string" && o.summary) todo.summary = o.summary;
	if (typeof o.verification === "string" && o.verification) todo.verification = o.verification;
	if (typeof o.commitSubject === "string" && o.commitSubject) todo.commitSubject = o.commitSubject;
	const artifacts = sanitizeArtifacts(o.artifacts);
	if (artifacts) todo.artifacts = artifacts;
	return todo;
}

function sanitizeGroup(raw: unknown): TodoGroup | null {
	if (typeof raw !== "object" || raw === null) return null;
	const o = raw as Record<string, unknown>;
	if (typeof o.title !== "string") return null;
	const todos = Array.isArray(o.todos)
		? o.todos.map(sanitize).filter((t): t is Todo => t !== null)
		: [];
	return {
		id: typeof o.id === "string" ? o.id : freshId("g"),
		title: flattenTitle(o.title),
		todos,
	};
}

function makeTodo(
	title: string,
	status: TodoStatus,
	origin: TodoOrigin,
	note?: string,
	artifacts?: TodoArtifact[],
	summary?: string,
	verification?: string,
): Todo {
	const now = nowIso();
	const todo: Todo = {
		id: freshId("t"),
		title: flattenTitle(title),
		status,
		origin,
		createdAt: now,
		updatedAt: now,
	};
	if (note) todo.note = note;
	if (summary) todo.summary = summary;
	if (verification) todo.verification = verification;
	const clean = sanitizeArtifacts(artifacts);
	if (clean) todo.artifacts = clean;
	return todo;
}

export class TodoStore {
	readonly file: string;

	constructor(root: string, scopeId = "workspace") {
		this.file = join(root, storeRel(scopeId));
	}

	read(): TodoPlan {
		if (!existsSync(this.file)) return { todos: [], groups: [] };
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(this.file, "utf8"));
		} catch {
			return { todos: [], groups: [] };
		}
		const file = parsed as Partial<TodoFile> | null;
		const todos = Array.isArray(file?.todos)
			? file.todos.map(sanitize).filter((t): t is Todo => t !== null)
			: [];
		const groups = Array.isArray(file?.groups)
			? file.groups.map(sanitizeGroup).filter((g): g is TodoGroup => g !== null)
			: [];
		const plan: TodoPlan = { todos, groups };
		if (typeof file?.summary === "string" && file.summary) plan.summary = file.summary;
		return plan;
	}

	setSummary(summary: string): void {
		const plan = this.read();
		const text = summary.trim();
		if (text) plan.summary = text;
		else delete plan.summary;
		this.write(plan);
	}

	flat(): Todo[] {
		return flatItems(this.read());
	}

	list(status?: TodoStatus): Todo[] {
		const all = this.flat();
		return status ? all.filter((t) => t.status === status) : all;
	}

	get(id: string): Todo | undefined {
		return this.flat().find((t) => t.id === id);
	}

	add(input: TodoInput): Todo {
		const todo = makeTodo(
			input.title,
			"pending",
			input.origin ?? "user",
			input.note,
			input.artifacts,
		);
		const plan = this.read();
		if (input.after !== undefined) {
			const lane = [plan.todos, ...plan.groups.map((g) => g.todos)].find((items) =>
				items.some((t) => t.id === input.after),
			);
			if (!lane) throw new Error(`No TODO with id "${input.after}" to insert after.`);
			lane.splice(lane.findIndex((t) => t.id === input.after) + 1, 0, todo);
			this.write(plan);
			return todo;
		}
		const groupTitle = input.group ? flattenTitle(input.group) : undefined;
		if (groupTitle) {
			let group = plan.groups.find((g) => g.title === groupTitle);
			if (!group) {
				group = { id: freshId("g"), title: groupTitle, todos: [] };
				plan.groups.push(group);
			}
			group.todos.push(todo);
		} else {
			plan.todos.push(todo);
		}
		this.write(plan);
		return todo;
	}

	private keepOneInProgress(plan: TodoPlan, keep?: string): Todo[] {
		const demoted: Todo[] = [];
		let kept = false;
		for (const item of flatItems(plan)) {
			if (item.status !== "in_progress") continue;
			if (item.id === keep || (keep === undefined && !kept)) {
				kept = true;
				continue;
			}
			item.status = "pending";
			item.updatedAt = nowIso();
			demoted.push(item);
		}
		return demoted;
	}

	update(id: string, patch: TodoPatch): TodoUpdateResult | undefined {
		const plan = this.read();
		const all = flatItems(plan);
		const todo = all.find((t) => t.id === id);
		if (!todo) return undefined;
		let paused: Todo[] = [];
		if (patch.title !== undefined) todo.title = flattenTitle(patch.title);
		if (patch.status !== undefined) {
			const wasDone = todo.status === "done";
			todo.status = patch.status;
			if (patch.status === "in_progress") paused = this.keepOneInProgress(plan, id);
			if (wasDone && patch.status !== "done") {
				delete todo.summary;
				delete todo.verification;
				delete todo.commitSubject;
			}
		}
		if (patch.note !== undefined) {
			if (patch.note) todo.note = patch.note;
			else delete todo.note;
		}
		if (patch.summary !== undefined) {
			if (patch.summary) todo.summary = patch.summary;
			else delete todo.summary;
		}
		if (patch.verification !== undefined) {
			if (patch.verification) todo.verification = patch.verification;
			else delete todo.verification;
		}
		if (patch.commitSubject !== undefined) {
			if (patch.commitSubject) todo.commitSubject = patch.commitSubject;
			else delete todo.commitSubject;
		}
		if (patch.artifacts !== undefined) {
			const clean = sanitizeArtifacts(patch.artifacts);
			if (clean) todo.artifacts = clean;
			else delete todo.artifacts;
		}
		todo.updatedAt = nowIso();
		this.write(plan);
		return { todo, paused };
	}

	remove(id: string): boolean {
		const plan = this.read();
		const before = countItems(plan);
		plan.todos = plan.todos.filter((t) => t.id !== id);
		const prevCounts = new Map<string, number>();
		for (const group of plan.groups) prevCounts.set(group.id, group.todos.length);
		for (const group of plan.groups) group.todos = group.todos.filter((t) => t.id !== id);
		plan.groups = plan.groups.filter((group) => {
			if (group.todos.length > 0) return true;
			return (prevCounts.get(group.id) ?? 0) === 0;
		});
		if (countItems(plan) === before) return false;
		this.write(plan);
		return true;
	}

	promote(id: string, titleOverride?: string): TodoPromoteResult {
		const plan = this.read();
		const idx = plan.todos.findIndex((t) => t.id === id);
		if (idx === -1) {
			const inGroup = plan.groups.some((g) => g.todos.some((t) => t.id === id));
			return { ok: false, reason: inGroup ? "grouped-step" : "unknown-id" };
		}
		const item = plan.todos[idx] as Todo;
		const title = flattenTitle(titleOverride !== undefined ? titleOverride : item.title);
		if (!title) return { ok: false, reason: "empty-title" };
		if (plan.groups.some((g) => g.title === title)) return { ok: false, reason: "title-collision" };
		plan.todos.splice(idx, 1);
		const group: TodoGroup = { id: item.id, title, todos: [] };
		plan.groups.push(group);
		this.write(plan);
		return { ok: true, group };
	}

	private write(plan: TodoPlan): void {
		const file: TodoFile = {
			version: CURRENT_VERSION,
			todos: plan.todos,
			groups: plan.groups,
		};
		if (plan.summary) file.summary = plan.summary;
		mkdirSync(dirname(this.file), { recursive: true });
		const tmp = `${this.file}.${randomUUID().slice(0, 8)}.tmp`;
		writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
		renameSync(tmp, this.file);
	}
}
