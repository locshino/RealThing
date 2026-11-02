import type { Project, Workspace } from "@realthing/contracts";
import type { BranchFacts } from "../../panels/branchStatusState";
import { BranchSegment } from "./BranchSegment";
import { ProjectSegment } from "./ProjectSegment";
import { WorkspaceSegment } from "./WorkspaceSegment";

export function LocationBar({
	project,
	workspace,
	branchStatus,
	onNewWorkspace,
}: {
	project: Project;
	workspace: Workspace | null;
	branchStatus: BranchFacts | null;
	onNewWorkspace: () => void;
}) {
	return (
		<div
			data-testid="scope-context"
			data-context={workspace ? "workspace" : "project-home"}
			className="flex min-w-0 flex-1 items-stretch self-stretch overflow-hidden"
		>
			<ProjectSegment project={project} atHome={workspace === null} />
			<WorkspaceSegment project={project} workspace={workspace} onNewWorkspace={onNewWorkspace} />
			{workspace ? <BranchSegment workspace={workspace} status={branchStatus} /> : null}
		</div>
	);
}
