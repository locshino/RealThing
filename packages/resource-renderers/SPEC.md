---
id: module-resource-renderers
type: module-design
status: active
title: "@realthing/resource-renderers — file and diff renderers, registry and surfaces"
parent: architecture
depends-on: [module-contracts, module-locales, module-ui]
references: [submodule-web-panels]
---

## Responsibility

Everything that turns a workspace resource into a viewable, diffable surface: the resource description
and renderer registry, the eleven bundled file/diff renderers (code, markdown, binary, LFS, image, SVG,
CSV, JSON, notebook, PDF, HTML), and the shared Monaco, Pierre, and markdown-document machinery they run
on. It is presentation: it owns no content loading, tabs, or navigation — a host supplies those.

## Public surface

One barrel, `@realthing/resource-renderers` (`src/index.ts`):

- **Host seam (`./host`):** `MarkdownRehypePlugins`, `ResourceCodeHost`, `ResourceCodeLanguage`,
  `ResourceEnvironmentProvider`, `ResourceFileReviewProps`, `ResourceHost`, `ResourceHostProvider`,
  `ResourceMarkdown`, `ResourceMarkdownProps`, `ResourcePreferences`, `ResourcePreferencesProvider`,
  `ResourceReviewSendProps`, `ResourceScope`, `ResourceScopeProvider`, `useOptionalResourceHost`,
  `useResourceScope`.
- **Registry (`./registry`):** `AnchorDraft`, `anchorLabel`, `canonicalWorkspacePath`, `describeResource`,
  `diffRendererCapabilities`, `diffResourceMeta`, `HunkActions`, `HunkTriage`, `isPlaceable`,
  `outdatedReason`, `PENDING_TEXT_META`, `ResourceAnchorCapability`, `ResourceContent`,
  `ResourceDescriptor`, `ResourceDiffProps`, `ResourceEnvironment`, `ResourceIntent`, `ResourceRenderer`,
  `ResourceViewModule`, `ResourceViewProps`, `ReviewThread`, `ReviewThreadActions`,
  `registerResourceRenderer`, `rendererImplementationKey`, `resolveRenderers`, `resourceContent`,
  `SurfaceReview`, `threadLabel`.
- **Renderers & support:** `createAskAgentRequest`, `registerBundledResourceRenderers`,
  `ReviewDraftContext`, `ReviewDraftPersistence`, `GuardedRendererDiff`, `surfaceLineCount`,
  `VIRTUALIZED_DIFF_LINES`, `RendererLayout`, `RendererToggles`, `ResourcePreview`,
  `ResourcePreviewLayout`, `ResourcePreviewProps`, `ReviewThreadCard`, `RendererView`,
  `usePreloadResourceView`, `useRendererSelection`, `UnplacedReviewStrip`, `useScrollViewState`,
  `viewStateScrollTop`.

Renderer implementations are never exported; they stay behind each registration's dynamic
`loadView`/`loadDiff`, and the large-diff estimate, the notice, and the lazy diff mount stay behind
`GuardedRendererDiff`.

## Host seam

A host wraps renderers in `ResourceHostProvider` with one static `ResourceHost` value:

- `markdown` — the component that renders markdown (`ResourceMarkdownProps`).
- `code` — the code-highlighting host (`languages` with grammar loaders, `languageId` canonicalization, and
  the code `theme` resolved from CSS variables). Monaco is page-global: the first preload `warm` or
  `MonacoEditor` initializes it from its host's `code` once (`ensureMonaco`).
- `bytesUrl(workspaceId, path, oid?)` — the host byte route for images, PDFs, and relative markdown assets.
- `openFile(workspaceId, path, { keep? })` and `openComparison(workspaceId, before, path)` — navigation for
  relative document links (preview) and explicit Open-in-tab actions (keep).
- `readFile(workspaceId, path)` and `subscribeFileChanges(workspaceId, onChange)` — `ResourcePreview`'s
  content and live refresh.
- `readGitOriginal(workspaceId, path)` — optional baseline content lookup for Git gutter indicators.
- `FileReview` and `ReviewSend` — optional host surface slots.

The reader's line-width preference (`fileLineWidth` / `fileLineWidthBounded`) arrives separately through
`ResourcePreferencesProvider`; only `MonacoEditor` reads it. The phone class arrives through
`ResourceEnvironmentProvider` (`ResourceEnvironment`, `{ mobile }`).

`ResourceRenderer.loadView(environment)` receives the same `ResourceEnvironment` (`{ mobile }`) used for
resolution, so the code renderer picks Pierre `File` on phone-class viewports and Monaco otherwise without
reading a viewport global.

## Boundary

- **Allowed deps:** `@realthing/contracts` (types), `@realthing/locales` (the `MessageKey` type and
  `./react` for its UI strings — `useT`, `<T>`, `localeOf`), `@realthing/ui` primitives, React, and the
  renderer engines (`monaco-editor`, `@shikijs/monaco`, `shiki`, `@pierre/diffs`, `pdfjs-dist`,
  `react-markdown`, `rehype-raw`, `rehype-sanitize`, `diff`, `jsondiffpatch`, `react-virtuoso`,
  `node-htmldiff`).
- **Forbidden:** the web app (store, transport, panels, shell, lib, themes) and the server.
  `scripts/check-module-boundaries.ts` enforces it; only `apps/web` consumes the package.
- UI text follows [[architecture]] Decision 17: renderer chrome renders through `useT()`'s translator
  (`viewer.*` keys) and `check:i18n` scans `packages/resource-renderers/src` like the app.
- Styling follows the app's token rules: the Tailwind `@source`, the colour/spacing/typography guards, and
  the React Compiler census all scan `packages/resource-renderers/src`.

## Bundled renderers

Bundled candidates are registered once by `registerBundledResourceRenderers()`:

- `realthing/code` — renders source diffs with Pierre `FileDiff` (virtualized above
  `VIRTUALIZED_DIFF_LINES`) and desktop files with Monaco (`PierreFile` on phone-class viewports); supports
  copy, split/inline layout, and whitespace controls.
- `realthing/markdown` — renders markdown previews and worker-isolated `RenderedDiff`.
- `realthing/binary` — reports byte sizes for binary resources.
- `realthing/lfs` — claims `application/vnd.git-lfs` pointer files and displays object metadata.
- `realthing/image` — renders raster images with zoom and 2-up, swipe, onion-skin, and difference-blend
  diff modes.
- `realthing/svg` — renders vectors inside a sandboxed `srcdoc` iframe with CSP `default-src 'none';
  img-src data:; style-src 'unsafe-inline'`.
- `realthing/csv` — RFC-4180 parser with automatic delimiter sniffing and virtualized table view/diff.
- `realthing/json` — JSONC-tolerant positional scanner with tree view and `jsondiffpatch` unified diff.
- `realthing/notebook` — nbformat-4 notebook viewer and cell-aligned diff with sandboxed HTML/SVG outputs.
- `realthing/pdf` — lazy-loaded pdf.js paged canvas viewer and synchronized 2-up/swipe/onion/difference
  diff.
- `realthing/html` — sanitized HTML preview in a `sandbox=""` iframe with Desktop/Tablet/Phone/Fill
  viewport scaling.
