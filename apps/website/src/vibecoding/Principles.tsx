import { BookOpenText, ListTodo, ListTree, View } from "lucide-react";
import type { Positioning } from "./positioning";
import { Reveal } from "./Reveal";
import { Subtitle } from "./Subtitle";

const transparency = {
	n: "01",
	Icon: View,
	title: "See every change across your workspace",
	body: "No hidden state. Every modified file, branch diff, and terminal command is visible in real-time across your active worktrees.",
};

const parallelism = {
	n: "03",
	Icon: ListTree,
	title: "Work on multiple branches without the mess",
	body: "Each task runs inside its own isolated Git worktree. Develop five distinct features in parallel without dealing with lock files, dirty indexes, or branch switching.",
};

const COPY: Record<
	Positioning,
	{ heading: string; subtitle: string; principles: (typeof transparency)[] }
> = {
	control: {
		heading: "Designed for high-trust development",
		subtitle:
			"We believe in structured, high-clarity software engineering.\u00a0\nEvery workspace combines code editing, isolated worktrees, multi-scope diff review, and clear plans.",
		principles: [
			transparency,
			{
				n: "02",
				Icon: ListTodo,
				title: "Clarify requirements before building",
				body: "Capture a scoped workspace plan and architectural outline before writing code. Review the approach, adjust the constraints, and build with confidence.",
			},
			parallelism,
			{
				n: "04",
				Icon: BookOpenText,
				title: "Keep your project's memory",
				body: "Keep requirements, module boundaries, and architecture decisions in a linked spec graph right alongside your code.",
			},
		],
	},
	compounding: {
		heading: "Designed to compound",
		subtitle:
			"Context shouldn't vanish between tasks.\u00a0\nRealThing keeps your specs, workspace plans, and worktrees organized in one place.",
		principles: [
			transparency,
			{
				n: "02",
				Icon: ListTodo,
				title: "Plan first — keep the plan",
				body: "Draft a workspace plan before touching code. Approved designs land in living specs and stay with the project.",
			},
			parallelism,
			{
				n: "04",
				Icon: BookOpenText,
				title: "Living specs, not stale docs",
				body: "Requirements, boundaries, and decisions live in a linked graph that stays updated as the code evolves.",
			},
		],
	},
};

export function Principles({ positioning }: { positioning: Positioning }) {
	const copy = COPY[positioning];
	return (
		<section
			id="features"
			className="scroll-mt-16 border-b border-border-muted bg-container-header-bg"
		>
			<div className="mx-auto max-w-[1200px] px-6 py-12 sm:py-24">
				<Reveal>
					<p className="label-mono">Foundational principles</p>
					<h2 className="font-display mt-4 text-2xl font-normal sm:text-3xl lg:whitespace-nowrap">
						{copy.heading}
					</h2>
					<Subtitle className="subtitle-wide mt-5">{copy.subtitle}</Subtitle>
				</Reveal>
				<div className="mt-8 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
					{copy.principles.map((p, i) => (
						<Reveal key={p.n} delay={i * 70} className="h-full">
							<article className="h-full rounded-lg border border-border bg-container-card-bg p-5">
								<p.Icon className="text-primary" size={24} strokeWidth={1.5} aria-hidden="true" />
								<h3 className="mt-6 text-sm font-semibold">{p.title}</h3>
								<p className="mt-3 text-xs leading-relaxed text-text-muted">{p.body}</p>
							</article>
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}
