import {
	type ResourceEnvironment,
	ResourceEnvironmentProvider,
	type ResourceFileReviewProps,
	type ResourceHost,
	ResourceHostProvider,
	type ResourceMarkdownProps,
	type ResourcePreferences,
	ResourcePreferencesProvider,
	type ResourceReviewSendProps,
	registerBundledResourceRenderers,
	type SurfaceReview,
} from "@realthing/resource-renderers";
import { type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cssColorToHex, usePhoneViewport } from "../lib";
import { SHIKI_FILE_LANGUAGES, shikiLanguageId } from "../lib/highlighter";
import { openFileComparisonInTab, openFileInTab } from "../panels/openTabs";
import { resourceBytesUrl } from "../panels/resourcePane";
import { selectFileChangeSince, useAppStore } from "../store";
import { resolveRealthingShikiTheme } from "../themes";
import { getTransport } from "../transport";

registerBundledResourceRenderers();

const EMPTY_SURFACE_REVIEW: SurfaceReview = {
	threads: [],
	commenting: {
		onSave: async () => {},
		onSend: async () => {},
	},
	actions: {
		onSendComment: async () => {},
		onDeleteComment: async () => {},
		onUpdateComment: async () => {},
	},
	focus: null,
	onFocusHandled: () => {},
};

function Markdown({
	text,
	className,
	remarkPlugins,
	rehypePlugins,
	urlTransform,
	components,
}: ResourceMarkdownProps) {
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={remarkPlugins ?? [remarkGfm]}
				rehypePlugins={rehypePlugins}
				urlTransform={urlTransform}
				components={components}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
}

function FileReview({ children }: ResourceFileReviewProps) {
	return children(EMPTY_SURFACE_REVIEW);
}

function ReviewSend(_props: ResourceReviewSendProps) {
	return null;
}

const HOST: ResourceHost = {
	markdown: Markdown,
	code: {
		languages: SHIKI_FILE_LANGUAGES,
		languageId: shikiLanguageId,
		theme: (options) => resolveRealthingShikiTheme({ ...options, toHex: cssColorToHex }),
	},
	bytesUrl: resourceBytesUrl,
	openFile: (workspaceId, path, options) => {
		void openFileInTab(workspaceId, path, options?.keep ? "keep" : "preview");
	},
	openComparison: (workspaceId, before, path) => {
		void openFileComparisonInTab(workspaceId, before, path, "keep");
	},
	readFile: (workspaceId, path) => getTransport().request("fs.readFile", { workspaceId, path }),
	readGitOriginal: (workspaceId, path) =>
		getTransport()
			.request("git.diffFile", { workspaceId, path, scope: { kind: "uncommitted" } })
			.then((res) => res.original)
			.catch(() => null),
	subscribeFileChanges: (workspaceId, onChange) =>
		useAppStore.subscribe((state, previous) => {
			const paths = selectFileChangeSince(state, previous, workspaceId);
			if (paths !== undefined) onChange(paths);
		}),
	FileReview,
	ReviewSend,
};

export function AppResourceHost({ children }: { children: ReactNode }) {
	const fileLineWidth = useAppStore((state) => state.fileLineWidth);
	const fileLineWidthBounded = useAppStore((state) => state.fileLineWidthBounded);
	const editorFontSize = useAppStore((state) => state.editorFontSize);
	const codeFontFamily = useAppStore((state) => state.codeFontFamily);
	const editorTabSize = useAppStore((state) => state.editorTabSize);
	const editorInsertSpaces = useAppStore((state) => state.editorInsertSpaces);
	const editorMinimap = useAppStore((state) => state.editorMinimap);
	const editorLineNumbers = useAppStore((state) => state.editorLineNumbers);
	const editorRenderWhitespace = useAppStore((state) => state.editorRenderWhitespace);
	const editorCursorStyle = useAppStore((state) => state.editorCursorStyle);
	const mobile = usePhoneViewport();
	const preferences = useMemo<ResourcePreferences>(
		() => ({
			fileLineWidth,
			fileLineWidthBounded,
			editorFontSize,
			editorFontFamily: codeFontFamily,
			editorTabSize,
			editorInsertSpaces,
			editorMinimap,
			editorLineNumbers,
			editorRenderWhitespace,
			editorCursorStyle,
		}),
		[
			fileLineWidth,
			fileLineWidthBounded,
			editorFontSize,
			codeFontFamily,
			editorTabSize,
			editorInsertSpaces,
			editorMinimap,
			editorLineNumbers,
			editorRenderWhitespace,
			editorCursorStyle,
		],
	);
	const environment = useMemo<ResourceEnvironment>(() => ({ mobile }), [mobile]);
	return (
		<ResourceHostProvider value={HOST}>
			<ResourcePreferencesProvider value={preferences}>
				<ResourceEnvironmentProvider value={environment}>{children}</ResourceEnvironmentProvider>
			</ResourcePreferencesProvider>
		</ResourceHostProvider>
	);
}
