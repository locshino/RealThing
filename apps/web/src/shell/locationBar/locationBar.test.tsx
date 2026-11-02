import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BranchStatus, Project, Workspace } from "@realthing/contracts";
import { TooltipProvider } from "@realthing/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { LocationBar } from "./LocationBar";
import { pluralCommits, projectInitial } from "./locationModel";
import { chipClass, pillClass } from "./Segment";

const project: Project = { id: "p1", name: "realthing-copy", path: "/repo" } as Project;
const worktree: Workspace = {
	id: "w1",
	projectId: "p1",
	name: "Image selection coordinates bug",
	branch: "fix-image-region-comment-coords",
	worktreePath: "/repo/.worktrees/w1",
	baseBranch: "origin/main",
};
const userOwned: Workspace = {
	id: "w0",
	projectId: "p1",
	kind: "default",
	name: "Default",
	branch: "main",
	worktreePath: "/repo",
	baseBranch: "main",
};

function render(workspace: Workspace | null, branchStatus: BranchStatus | null = null) {
	return renderToStaticMarkup(
		<TooltipProvider>
			<LocationBar
				project={project}
				workspace={workspace}
				branchStatus={branchStatus}
				onNewWorkspace={() => {}}
			/>
		</TooltipProvider>,
	);
}

const testids = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);

const status = (over: Partial<BranchStatus> = {}): BranchStatus => ({
	hasOrigin: true,
	provider: "github",
	published: true,
	pushesElsewhere: false,
	ahead: 0,
	behind: 0,
	aheadOfBase: 2,
	onBase: false,
	...over,
});

test("a worktree renders project, workspace and branch · from base segments", () => {
	const html = render(worktree);
	expect(html).toContain('data-context="workspace"');
	const ids = testids(html);
	expect(ids).toEqual(
		expect.arrayContaining([
			"scope-project-segment",
			"scope-project",
			"scope-workspace-segment",
			"scope-name",
			"scope-branch-segment",
			"scope-branch",
			"scope-base",
		]),
	);
	expect(ids).not.toContain("scope-remote-segment");
	expect(html).toContain(">Image selection coordinates bug<");
	expect(html).toContain(">fix-image-region-comment-coords<");
	expect(html).toContain(">origin/main<");
	const caption = /Branch<span[^>]*>· from <span data-testid="scope-base">origin\/main<\/span>/;
	expect(html).toMatch(caption);
});

test("diverged branch status adds the Remote chips", () => {
	const html = render(worktree, status({ ahead: 2, behind: 0 }));
	const ids = testids(html);
	expect(ids).toEqual(expect.arrayContaining(["scope-remote-segment", "scope-remote-unpushed"]));
	expect(ids).not.toContain("scope-remote-behind");
	expect(html).toContain(">2 to push");
});

test("a user-owned workspace shows a plain Branch caption", () => {
	const html = render(userOwned, status({ ahead: 0, behind: 3 }));
	expect(html).not.toContain("scope-base");
	expect(html).not.toContain("· from");
	expect(testids(html)).toContain("scope-remote-behind");
	expect(html).toContain(">3 behind");
});

test("project home keeps only the Project and Workspace segments", () => {
	const html = render(null);
	expect(html).toContain('data-context="project-home"');
	expect(html).toContain(">Project home<");
	const ids = testids(html);
	expect(ids).not.toContain("scope-branch-segment");
});

test("segments are separated by space alone and the first one starts flush", () => {
	const html = render(worktree, status({ ahead: 2, behind: 0 }));
	const segmentClasses = [
		...html.matchAll(/data-testid="(scope-[a-z]+-segment)" class="([^"]*)"/g),
	].map(([, id, classes]) => [id, classes?.split(/\s+/) ?? []] as const);
	expect(segmentClasses.map(([id]) => id)).toEqual([
		"scope-project-segment",
		"scope-workspace-segment",
		"scope-branch-segment",
		"scope-remote-segment",
	]);
	for (const [id, classes] of segmentClasses) {
		expect(classes.filter((c) => /(^|:)border/.test(c))).toEqual([]);
		if (id === "scope-project-segment") {
			expect(classes).toContain("pl-0");
			expect(classes).not.toContain("pl-8");
		} else if (id === "scope-workspace-segment") {
			expect(classes).toEqual(expect.arrayContaining(["pl-0", "sm:pl-8"]));
		} else {
			expect(classes).toContain("pl-8");
		}
	}
});

test("every strip value shares one text style and no caption switches typeface", () => {
	const html = render(worktree, status({ ahead: 2, behind: 0 }));
	for (const id of ["scope-project-name", "scope-name", "scope-branch"]) {
		expect(html).toMatch(new RegExp(`data-testid="${id}" class="[^"]*\\btr-title-section\\b`));
	}
	expect(html).not.toContain("tr-code-text");
	const pill = pillClass.split(/\s+/);
	expect(pill.filter((c) => /^text-text-/.test(c))).toEqual(["text-text-muted"]);
});

test("every interactive control in the drag strip opts out of dragging", () => {
	expect(pillClass.split(/\s+/)).toContain("window-no-drag");
	expect(chipClass("success", true).split(/\s+/)).toContain("window-no-drag");
	expect(chipClass("success").split(/\s+/)).not.toContain("window-no-drag");
	const html = render(worktree, status({ ahead: 2, behind: 0 }));
	for (const tag of html.matchAll(/<(?:button|a|input)\b[^>]*class="([^"]*)"/g)) {
		expect(tag[1]?.split(/\s+/)).toContain("window-no-drag");
	}
});

test("status chips rest on their tone's tinted step and hover to the muted one", () => {
	for (const tone of ["success", "warning", "info"] as const) {
		const classes = chipClass(tone, true).split(/\s+/);
		expect(classes).toContain(`bg-feedback-${tone}-subtle`);
		expect(classes).toContain(`text-feedback-${tone}`);
		expect(classes).toContain(`hover:bg-feedback-${tone}-muted`);
		expect(classes).toContain("window-no-drag");
	}
	const neutral = chipClass("neutral").split(/\s+/);
	expect(neutral).toContain("bg-control-bg-selected");
	expect(neutral).toContain("text-text-muted");
	expect(neutral).not.toContain("window-no-drag");
});

test("the location bar never hard-codes typography or colour outside the token system", () => {
	for (const file of [
		"Segment.tsx",
		"BranchSegment.tsx",
		"WorkspaceSegment.tsx",
		"ProjectSegment.tsx",
	]) {
		const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
		expect(source).not.toMatch(/\btext-\[|\bfont-(?:mono|sans|medium|semibold)\b|#[0-9a-f]{3,8}\b/);
	}
});

test("project initials and commit plurals", () => {
	expect(projectInitial("realthing-copy")).toBe("T");
	expect(projectInitial("  émile")).toBe("É");
	expect(projectInitial("")).toBe("?");
	expect(pluralCommits(1)).toBe("1 commit");
	expect(pluralCommits(2)).toBe("2 commits");
});
