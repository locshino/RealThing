import { useT } from "@realthing/locales/react";
import type { editor } from "monaco-editor/editor/editor.api.js";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
	type ResourceHost,
	useOptionalResourceHost,
	useResourceHost,
	useResourcePreferences,
} from "../host";
import type { ResourceDescriptor, ResourceViewProps, SurfaceReview } from "../registry";
import { MonacoReviewZones } from "./MonacoReviewZones";
import { applyGitGutterDecorations, computeGitGutterChanges } from "./monacoGitGutter";
import { decorateEditorContextMenus } from "./monacoMenuIcons";
import {
	createFileEditor,
	disposeFileEditor,
	ensureMonaco,
	fileEditorOptions,
	languageForPath,
	revealLineNow,
	syncFileModel,
	warmLanguage,
} from "./monacoSetup";
import {
	applyReviewDecorations,
	attachReviewCommenting,
	attachReviewThreads,
	type MonacoReviewZoneState,
	type ReviewCommenting,
} from "./reviewWidgets";

function focusLine(review: SurfaceReview): number | null {
	const range = review.focus?.anchor.selectors.find((selector) => selector.kind === "lineRange");
	return range?.kind === "lineRange" ? range.startLine : null;
}

function isEditorViewState(value: unknown): value is editor.ICodeEditorViewState {
	if (typeof value !== "object" || value === null) return false;
	return Array.isArray(Reflect.get(value, "cursorState")) && Reflect.has(value, "viewState");
}

const IDLE_WARM_LANGUAGES = [
	"typescript",
	"javascript",
	"json",
	"markdown",
	"yaml",
	"ini",
	"shellscript",
	"css",
	"html",
] as const;

export function warm(host: ResourceHost, resource: ResourceDescriptor): void {
	ensureMonaco(host.code);
	if (!resource.path) {
		for (let i = 0; i < IDLE_WARM_LANGUAGES.length; i++) {
			const lang = IDLE_WARM_LANGUAGES[i];
			if (lang) setTimeout(() => warmLanguage(lang), i * 25);
		}
		return;
	}
	setTimeout(() => warmLanguage(languageForPath(resource.path)), 0);
}

export default function MonacoEditor({
	resource,
	content,
	review,
	viewState,
	onViewState,
	onChangeContent,
	onSaveContent,
}: ResourceViewProps) {
	const t = useT();
	const prefs = useResourcePreferences();
	const { fileLineWidth, fileLineWidthBounded } = prefs;
	ensureMonaco(useResourceHost().code);
	const scope = useId().replace(/[^\w-]/g, "");
	const path = resource.path;
	const text = content.kind === "text" ? content.text : "";
	const commentLabel = t("review.widget.commentOnSelection");
	const options = fileEditorOptions(t, fileLineWidth, fileLineWidthBounded, resource.path, prefs);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const commentingRef = useRef<ReviewCommenting | null>(null);
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
	const threadsRef = useRef<ReturnType<typeof attachReviewThreads> | null>(null);
	const decorationsRef = useRef<string[]>([]);
	const freshMountRef = useRef(false);
	const suppressChangeRef = useRef(false);
	const appliedRef = useRef({ scope, path, text, options, onViewState });
	const latestRef = useRef({
		scope,
		path,
		text,
		options,
		commentLabel,
		viewState,
		review,
		onViewState,
		onChangeContent,
		onSaveContent,
	});
	const [reviewZones, setReviewZones] = useState<MonacoReviewZoneState>({
		threads: [],
		composer: null,
	});

	const host = useOptionalResourceHost();
	const gutterDecorationsRef = useRef<string[]>([]);
	const originalContentRef = useRef<string | null>(null);
	const gutterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const refreshGutter = useCallback(
		(original: string | null, textOverride?: string) => {
			originalContentRef.current = original;
			const codeEditor = editorRef.current;
			if (!codeEditor) return;
			const currentText = textOverride ?? codeEditor.getModel()?.getValue() ?? text;
			const changes = computeGitGutterChanges(original, currentText);
			gutterDecorationsRef.current = applyGitGutterDecorations(
				codeEditor,
				gutterDecorationsRef.current,
				changes,
			);
		},
		[text],
	);

	const scheduleGutterUpdate = useCallback((currentText: string) => {
		if (gutterTimerRef.current) clearTimeout(gutterTimerRef.current);
		gutterTimerRef.current = setTimeout(() => {
			gutterTimerRef.current = null;
			if (originalContentRef.current !== null && editorRef.current) {
				const changes = computeGitGutterChanges(originalContentRef.current, currentText);
				gutterDecorationsRef.current = applyGitGutterDecorations(
					editorRef.current,
					gutterDecorationsRef.current,
					changes,
				);
			}
		}, 75);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const workspaceId = resource.workspaceId;
		const filePath = resource.path;

		if (!host?.readGitOriginal || !workspaceId || !filePath) {
			refreshGutter(null);
			return;
		}

		const readGitOriginal = host.readGitOriginal;
		const loadBaseline = () => {
			readGitOriginal(workspaceId, filePath)
				.then((orig) => {
					if (!cancelled) refreshGutter(orig);
				})
				.catch(() => {
					if (!cancelled) refreshGutter(null);
				});
		};

		loadBaseline();

		const unsubscribe = host.subscribeFileChanges?.(workspaceId, (paths) => {
			if (cancelled) return;
			if (paths === null || paths.includes(filePath)) {
				loadBaseline();
			}
		});

		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [host, resource.workspaceId, resource.path, refreshGutter]);

	useLayoutEffect(() => {
		latestRef.current = {
			scope,
			path,
			text,
			options,
			commentLabel,
			viewState,
			review,
			onViewState,
			onChangeContent,
			onSaveContent,
		};
	});

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const mount = latestRef.current;
		const codeEditor = createFileEditor(container, mount);
		codeEditor.getModel()?.updateOptions({
			tabSize: mount.options.tabSize ?? 2,
			insertSpaces: mount.options.insertSpaces ?? true,
		});
		editorRef.current = codeEditor;
		freshMountRef.current = true;
		appliedRef.current = {
			scope: mount.scope,
			path: mount.path,
			text: mount.text,
			options: mount.options,
			onViewState: mount.onViewState,
		};
		const menuIcons = decorateEditorContextMenus(codeEditor);
		if (isEditorViewState(mount.viewState)) codeEditor.restoreViewState(mount.viewState);
		if (originalContentRef.current !== null) {
			refreshGutter(originalContentRef.current, mount.text);
		}
		const threads = mount.review ? attachReviewThreads(codeEditor, setReviewZones) : null;
		const commenting = threads
			? attachReviewCommenting(codeEditor, threads, mount.commentLabel)
			: null;
		threadsRef.current = threads;
		commentingRef.current = commenting;
		const contentSub = codeEditor.onDidChangeModelContent(() => {
			if (suppressChangeRef.current) return;
			const currentText = codeEditor.getModel()?.getValue();
			if (currentText === undefined) return;
			appliedRef.current = { ...appliedRef.current, text: currentText };
			latestRef.current.onChangeContent?.(currentText);
			scheduleGutterUpdate(currentText);
		});
		const blurSub = codeEditor.onDidBlurEditorText(() => {
			const currentText = codeEditor.getModel()?.getValue();
			if (currentText !== undefined) latestRef.current.onSaveContent?.(currentText);
		});
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				event.stopPropagation();
				const currentText = codeEditor.getModel()?.getValue();
				if (currentText !== undefined) latestRef.current.onSaveContent?.(currentText);
			}
		};
		container.addEventListener("keydown", handleKeyDown);
		return () => {
			const saved = codeEditor.saveViewState();
			if (saved) latestRef.current.onViewState?.(saved);
			container.removeEventListener("keydown", handleKeyDown);
			if (gutterTimerRef.current) clearTimeout(gutterTimerRef.current);
			if (editorRef.current) {
				applyGitGutterDecorations(editorRef.current, gutterDecorationsRef.current, []);
			}
			gutterDecorationsRef.current = [];
			originalContentRef.current = null;
			contentSub.dispose();
			blurSub.dispose();
			menuIcons.dispose();
			commenting?.dispose();
			threads?.dispose();
			threadsRef.current = null;
			commentingRef.current = null;
			editorRef.current = null;
			decorationsRef.current = [];
			disposeFileEditor(codeEditor);
		};
	}, [refreshGutter, scheduleGutterUpdate]);

	useLayoutEffect(() => {
		const codeEditor = editorRef.current;
		const applied = appliedRef.current;
		if (
			!codeEditor ||
			(applied.scope === scope && applied.path === path && applied.text === text)
		) {
			appliedRef.current = { ...applied, onViewState };
			return;
		}
		const pathChanged = applied.scope !== scope || applied.path !== path;
		if (pathChanged) {
			const saved = codeEditor.saveViewState();
			if (saved) applied.onViewState?.(saved);
		}
		suppressChangeRef.current = true;
		syncFileModel(codeEditor, { scope, path, text }, applied.text);
		codeEditor.getModel()?.updateOptions({
			tabSize: latestRef.current.options.tabSize ?? 2,
			insertSpaces: latestRef.current.options.insertSpaces ?? true,
		});
		suppressChangeRef.current = false;
		if (originalContentRef.current !== null) {
			const currentText = codeEditor.getModel()?.getValue() ?? text;
			const changes = computeGitGutterChanges(originalContentRef.current, currentText);
			gutterDecorationsRef.current = applyGitGutterDecorations(
				codeEditor,
				gutterDecorationsRef.current,
				changes,
			);
		}
		if (pathChanged) {
			if (isEditorViewState(viewState)) {
				codeEditor.restoreViewState(viewState);
			} else {
				codeEditor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
			}
			freshMountRef.current = true;
		}
		appliedRef.current = { ...applied, scope, path, text, onViewState };
	}, [scope, path, text, viewState, onViewState]);

	useLayoutEffect(() => {
		commentingRef.current?.setLabel(commentLabel);
	}, [commentLabel]);

	useEffect(() => {
		const codeEditor = editorRef.current;
		if (!codeEditor) return;
		appliedRef.current = { ...appliedRef.current, options };
		codeEditor.updateOptions(options);
		codeEditor.getModel()?.updateOptions({
			tabSize: prefs.editorTabSize ?? 2,
			insertSpaces: prefs.editorInsertSpaces ?? true,
		});
	}, [options, prefs.editorTabSize, prefs.editorInsertSpaces]);

	const closeComposer = () => threadsRef.current?.closeComposer();
	const layoutReviewZones = () => threadsRef.current?.layout();

	useLayoutEffect(() => {
		const codeEditor = editorRef.current;
		const freshMount = freshMountRef.current;
		freshMountRef.current = false;
		if (!review || !codeEditor) return;
		threadsRef.current?.setThreads(review.threads);
		decorationsRef.current = applyReviewDecorations(
			codeEditor,
			decorationsRef.current,
			review.threads,
		);
		const line = focusLine(review);
		if (line === null) return;
		if (freshMount) revealLineNow(codeEditor, line);
		else codeEditor.revealLineInCenter(line);
		review.onFocusHandled();
	}, [review]);

	return (
		<>
			<div ref={containerRef} className="h-full w-full text-left" />
			<MonacoReviewZones
				zones={reviewZones}
				review={review}
				onCloseComposer={closeComposer}
				onRendered={layoutReviewZones}
			/>
		</>
	);
}
