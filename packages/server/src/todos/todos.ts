import type {
	GitFileChange,
	TodoArtifact,
	TodoItem,
	TodoPlan,
	TodoStatus,
} from "@realthing/contracts";
import { gitStatus, listCommits } from "../git";
import { getWorkspace } from "../workspaces";
import {
	flatItems,
	groupStatus,
	type Todo as StoredItem,
	type TodoPlan as StoredPlan,
	TodoStore,
} from "./core";

const workspaceLocks = new Map<string, Promise<unknown>>();

function enqueueTodoMutation<T>(workspaceId: string, fn: () => T | Promise<T>): Promise<T> {
	const prev = workspaceLocks.get(workspaceId) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	workspaceLocks.set(
		workspaceId,
		next.then(
			() => undefined,
			() => undefined,
		),
	);
	return next;
}

function storeFor(workspaceId: string): TodoStore {
	return new TodoStore(getWorkspace(workspaceId).worktreePath, "workspace");
}

const commitFilesCache = new Map<string, GitFileChange[]>();

async function resolveCommitFiles(
	workspaceId: string,
	sha: string,
): Promise<GitFileChange[] | undefined> {
	const key = `${workspaceId}\u0000${sha}`;
	const hit = commitFilesCache.get(key);
	if (hit) return hit;
	try {
		const files = (await gitStatus(workspaceId, { kind: "commit", sha })).changes;
		commitFilesCache.set(key, files);
		return files;
	} catch {
		return undefined;
	}
}

async function toWireItem(workspaceId: string, item: StoredItem): Promise<TodoItem> {
	if (!item.artifacts) return item;
	const artifacts = await Promise.all(
		item.artifacts.map(async (a): Promise<TodoArtifact> => {
			if (a.kind !== "commit" || !a.sha) return a;
			const files = await resolveCommitFiles(workspaceId, a.sha);
			return files ? { ...a, files } : a;
		}),
	);
	return { ...item, artifacts };
}

function commitShas(item: StoredItem): string[] {
	return (item.artifacts ?? []).flatMap((a) => (a.kind === "commit" && a.sha ? [a.sha] : []));
}

async function resolveAdoptedCommits(workspaceId: string, plan: StoredPlan): Promise<TodoItem[]> {
	try {
		const owned = new Set(flatItems(plan).flatMap(commitShas));
		const { commits } = await listCommits(workspaceId);
		const adopted = commits.filter((c) => !owned.has(c.sha));
		if (adopted.length === 0) return [];
		return await Promise.all(
			adopted.map(async (c): Promise<TodoItem> => {
				const id = `commit:${c.sha}`;
				const at = c.committedAt || new Date().toISOString();
				const synthetic: StoredItem = {
					id,
					title: c.subject || c.sha.slice(0, 12),
					status: "done",
					origin: "adopted",
					artifacts: [{ kind: "commit", sha: c.sha, ...(c.subject ? { label: c.subject } : {}) }],
					createdAt: at,
					updatedAt: at,
				};
				return toWireItem(workspaceId, synthetic);
			}),
		);
	} catch {
		return [];
	}
}

export async function listTodos(params: { workspaceId: string }): Promise<TodoPlan> {
	const plan = storeFor(params.workspaceId).read();
	const wire: TodoPlan = {
		todos: await Promise.all(plan.todos.map((t) => toWireItem(params.workspaceId, t))),
		groups: await Promise.all(
			plan.groups.map(async (group) => ({
				...group,
				todos: await Promise.all(group.todos.map((t) => toWireItem(params.workspaceId, t))),
				status: groupStatus(group),
			})),
		),
	};
	if (plan.summary) wire.summary = plan.summary;
	const adoptedCommits = await resolveAdoptedCommits(params.workspaceId, plan);
	if (adoptedCommits.length > 0) wire.adoptedCommits = adoptedCommits;
	return wire;
}

export function countOpenTodos(params: { workspaceId: string }): number {
	return openTodoCount(storeFor(params.workspaceId).read());
}

export function openTodoCount(plan: StoredPlan): number {
	return flatItems(plan).filter((item) => item.status !== "done").length;
}

export function addTodo(params: {
	workspaceId: string;
	title: string;
	note?: string;
}): Promise<TodoItem> {
	return enqueueTodoMutation(params.workspaceId, () => {
		const title = params.title?.trim();
		if (!title) throw new Error("A TODO title is required.");
		const input: { title: string; note?: string; origin: "user" } = {
			title,
			origin: "user",
		};
		if (params.note !== undefined) input.note = params.note;
		return storeFor(params.workspaceId).add(input);
	});
}

export function updateTodo(params: {
	workspaceId: string;
	id: string;
	status?: TodoStatus;
	title?: string;
	note?: string;
}): Promise<TodoItem> {
	return enqueueTodoMutation(params.workspaceId, () => {
		const patch: { status?: TodoStatus; title?: string; note?: string } = {};
		if (params.status !== undefined) patch.status = params.status;
		if (params.title !== undefined) patch.title = params.title;
		if (params.note !== undefined) patch.note = params.note;
		const result = storeFor(params.workspaceId).update(params.id, patch);
		if (!result) throw new Error(`No TODO with id "${params.id}".`);
		return result.todo;
	});
}

export function removeTodo(params: { workspaceId: string; id: string }): Promise<{ ok: true }> {
	return enqueueTodoMutation(params.workspaceId, () => {
		const store = storeFor(params.workspaceId);
		const item = store.get(params.id);
		if (!item) return { ok: true } as const;
		store.remove(params.id);
		return { ok: true } as const;
	});
}
