import type { Positioning } from "./positioning";
import { Reveal } from "./Reveal";

type Card = { n: string; title: string; body: string; tag?: string };

const sharedCards = {
	workspaces: {
		n: "02",
		title: "Parallel workspaces",
		body: "Separate Git worktrees keep concurrent tasks from editing the same checkout.",
	},
	changeStream: {
		n: "03",
		title: "Multi-scope diffs",
		body: "Interactive diff review across branch, uncommitted changes, and individual commits.",
	},
	terminals: {
		n: "04",
		title: "Integrated terminal",
		body: "Real PTY terminal tabs scoped directly to each workspace directory.",
	},
	editor: {
		n: "06",
		title: "Fast code editor",
		body: "Edit files, inspect symbols, and navigate your repository without leaving the workspace.",
	},
} satisfies Record<string, Card>;

const CARDS: Record<Positioning, Card[]> = {
	control: [
		{
			n: "01",
			title: "Workspace plans",
			body: "Keep task plans and feature outlines right beside your code.",
		},
		sharedCards.workspaces,
		sharedCards.changeStream,
		sharedCards.terminals,
		{
			n: "05",
			title: "Linked project context",
			body: "Searchable specs preserve requirements, boundaries, and architecture decisions.",
		},
		sharedCards.editor,
	],
	compounding: [
		{
			n: "01",
			title: "Living specs",
			body: "Architecture and module specs stay versioned alongside the code they describe.",
		},
		sharedCards.workspaces,
		sharedCards.changeStream,
		sharedCards.terminals,
		{
			n: "05",
			title: "Workspace plans",
			body: "Structure tasks and implementation steps for every active worktree.",
		},
		sharedCards.editor,
	],
};

export function Capabilities({ positioning }: { positioning: Positioning }) {
	const cards = CARDS[positioning];
	return (
		<section id="capabilities" className="scroll-mt-16 border-b border-border-muted">
			<div className="mx-auto max-w-[1200px] px-6 py-12 sm:py-24">
				<Reveal>
					<p className="label-mono">Capabilities</p>
					<h2 className="font-display mt-4 text-2xl font-normal sm:text-3xl">
						Complete engine overview
					</h2>
				</Reveal>
				<Reveal delay={80}>
					<div className="mt-12 -mr-6 flex snap-x gap-5 overflow-x-auto pr-6 pb-2">
						{cards.map((c) => (
							<article
								key={c.n}
								className="w-[240px] shrink-0 snap-start rounded-lg border border-border bg-background p-5"
							>
								<p className="text-[13.2px] tracking-widest text-text-muted">[ {c.n} ]</p>
								<h3 className="mt-6 flex flex-wrap items-center gap-2 text-sm font-semibold">
									{c.title}
									{c.tag && (
										<span className="rounded-sm border border-primary-muted bg-primary-subtle px-1.5 py-0.5 text-[11px] font-normal tracking-[0.05em] text-primary uppercase">
											{c.tag}
										</span>
									)}
								</h3>
								<p className="mt-3 text-xs leading-relaxed text-text-muted">{c.body}</p>
							</article>
						))}
					</div>
				</Reveal>
			</div>
		</section>
	);
}
