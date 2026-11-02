import {
	RiFolderOpenLine as FolderOpen,
	RiHome2Line as House,
	RiRocketLine as Rocket,
	RiSparkling2Line as Sparkles,
} from "@remixicon/react";
import { useT } from "@realthing/locales/react";
import { useState } from "react";
import { PRODUCT_NAME } from "../constants/branding";
import { useAppStore } from "../store";
import { AddProjectMenu } from "./AddProjectMenu";
import { enterDefaultWorkspace } from "./defaultWorkspace";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { useOpenProject } from "./useOpenProject";
import { Card } from "./WelcomeCard";

export function WelcomePanel() {
	const t = useT();
	const projects = useAppStore((s) => s.projects);
	const recentProjects = useAppStore((s) => s.recentProjects);
	const selectedProjectId = useAppStore((s) => s.selectedProjectId);
	const [dialogProjectId, setDialogProjectId] = useState<string | null>(null);

	const project = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

	const { openProject, enterHostPath, startNewProject, cloneRepository, dialogs } = useOpenProject(
		(opened) => {
			useAppStore.getState().selectProject(opened.id, { reveal: true });
			void enterDefaultWorkspace(opened.id);
		},
	);
	const noProjects = project == null;

	const projectFolderCard = (projectId: string) => (
		<Card
			icon={House}
			title={t("panels.welcome.projectFolderTitle")}
			subtitle={t("panels.welcome.projectFolderSubtitle")}
			onClick={() => void enterDefaultWorkspace(projectId)}
			className="motion-safe:animate-reveal"
		/>
	);

	const openProjectCard = (primary: boolean) => (
		<AddProjectMenu
			recentProjects={recentProjects}
			onOpen={enterHostPath}
			onEnterHostPath={enterHostPath}
			onClone={cloneRepository}
			onOpenRecent={(path) => void openProject(path)}
			align="start"
		>
			<Card
				cta={primary}
				primary={primary}
				icon={FolderOpen}
				title={t("panels.welcome.openProjectTitle")}
				subtitle={t("panels.welcome.openProjectSubtitle")}
			/>
		</AddProjectMenu>
	);

	const noProjectCards = () => (
		<>
			<Card
				cta
				primary
				icon={Sparkles}
				title={t("panels.welcome.startNewTitle")}
				subtitle={t("panels.welcome.startNewSubtitle")}
				onClick={startNewProject}
			/>
			{openProjectCard(false)}
		</>
	);

	return (
		<div
			data-testid="welcome"
			className="flex h-full min-h-0 flex-col items-center justify-center-safe overflow-auto px-24 py-24 text-center"
		>
			<h1
				data-testid="welcome-title"
				className="tr-brand-hero max-w-[640px] break-words text-primary"
			>
				{project ? project.name : PRODUCT_NAME}
			</h1>

			<div className="mt-24 flex flex-wrap justify-center gap-12">
				{noProjects ? (
					noProjectCards()
				) : (
					<>
						<Card
							cta
							primary
							icon={Rocket}
							title={t("panels.welcome.startBuildingTitle")}
							subtitle={t("panels.welcome.startBuildingSubtitle")}
							onClick={() => setDialogProjectId(project.id)}
							className="motion-safe:animate-reveal"
						/>
						{projectFolderCard(project.id)}
					</>
				)}
			</div>

			{dialogProjectId ? (
				<NewWorkspaceDialog
					open
					projectId={dialogProjectId}
					onOpenChange={(o) => {
						if (!o) setDialogProjectId(null);
					}}
				/>
			) : null}
			{dialogs}
		</div>
	);
}
