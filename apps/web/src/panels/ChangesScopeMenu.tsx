import {
	RiCheckLine as Check,
	RiArrowDownSLine as ChevronDown,
	RiGitCommitLine as GitCommitHorizontal,
	RiGitPullRequestLine as GitCompare,
} from "@remixicon/react";
import type { GitCommit, GitDiffScope } from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@realthing/ui/dropdown-menu";
import { LoadingRegion } from "@realthing/ui/skeleton";
import { useRef, useState } from "react";
import { useNow } from "@/components/useNow";
import { relativeTime } from "@/lib";
import { getTransport } from "../transport";
import { scopeLabel, scopeTitle } from "./changesModel";

export function ChangesScopeMenu({
	workspaceId,
	scope,
	onSelectScope,
}: {
	workspaceId: string;
	scope: GitDiffScope;
	onSelectScope: (scope: GitDiffScope) => void;
}) {
	const t = useT();
	const now = useNow();
	const [open, setOpen] = useState(false);
	const [commits, setCommits] = useState<GitCommit[] | null>(null);
	const [hasUncommitted, setHasUncommitted] = useState<boolean | null>(null);

	const generation = useRef(0);
	const label = scopeLabel(t, scope, commits ?? []);

	const load = () => {
		const mine = ++generation.current;
		const live = () => generation.current === mine;
		void getTransport()
			.request("git.listCommits", { workspaceId })
			.then(({ commits: list }) => {
				if (live()) setCommits(list);
			})
			.catch(() => {
				if (live()) setCommits([]);
			});
		void getTransport()
			.request("git.status", { workspaceId, scope: { kind: "uncommitted" } })
			.then(({ changes }) => {
				if (live()) setHasUncommitted(changes.length > 0);
			})
			.catch(() => {
				if (live()) setHasUncommitted(null);
			});
	};

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) load();
			}}
		>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="m"
					iconLeft={GitCompare}
					iconRight={ChevronDown}
					data-testid="changes-scope-trigger"
					data-open={open}
					aria-label={t("changes.scope.title", { label })}
					tooltip={scopeTitle(t, scope, commits ?? [])}
					className="min-w-0"
				>
					<span data-testid="changes-scope-label" className="truncate">
						{label}
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-w-[22rem]">
				<DropdownMenuItem
					data-testid="changes-scope-all"
					data-active={scope.kind === "branch" ? true : undefined}
					onSelect={() => onSelectScope({ kind: "branch" })}
				>
					<Check className={scope.kind === "branch" ? "" : "invisible"} />
					{t("changes.scope.all")}
				</DropdownMenuItem>
				<DropdownMenuItem
					data-testid="changes-scope-uncommitted"
					data-active={scope.kind === "uncommitted" ? true : undefined}
					disabled={hasUncommitted === false && scope.kind !== "uncommitted"}
					onSelect={() => onSelectScope({ kind: "uncommitted" })}
				>
					<Check className={scope.kind === "uncommitted" ? "" : "invisible"} />
					{hasUncommitted === false
						? t("changes.scopeMenu.noUncommitted")
						: t("changes.scopeMenu.uncommitted")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel>{t("changes.scopeMenu.commits")}</DropdownMenuLabel>
				{commits === null ? (
					<LoadingRegion
						rows={3}
						label={t("changes.scopeMenu.loadingCommits")}
						className="px-8 py-4"
					/>
				) : commits.length === 0 ? (
					<DropdownMenuItem disabled>{t("changes.scopeMenu.noCommits")}</DropdownMenuItem>
				) : (
					commits.map((commit) => {
						const active = scope.kind === "commit" && scope.sha === commit.sha;
						return (
							<DropdownMenuItem
								key={commit.sha}
								data-testid="changes-scope-commit"
								data-sha={commit.sha}
								data-active={active ? true : undefined}
								onSelect={() => onSelectScope({ kind: "commit", sha: commit.sha })}
							>
								<Check className={active ? "" : "invisible"} />
								<GitCommitHorizontal />
								<span className="flex min-w-0 flex-col">
									<span className="truncate">{commit.subject || commit.shortSha}</span>
									<span className="truncate tr-text-metadata text-text-muted">
										{commit.shortSha} · {commit.author}
										{commit.committedAt
											? ` · ${relativeTime(t, Date.parse(commit.committedAt), now)}`
											: ""}
									</span>
								</span>
							</DropdownMenuItem>
						);
					})
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
