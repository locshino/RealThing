---
id: module-ui
type: module-design
status: draft
title: Shared host UI primitives
parent: architecture
depends-on: [module-contracts, module-locales]
references: [web-color, web-spacing, web-typography]
---

## Responsibility

The owned shadcn/Radix primitives shared by the web app and resource renderers. Presentational only:
feature state, theme selection, and token generation stay with the app.

## Boundary

Primitives expose per-file `@realthing/ui/<primitive>` subpaths, not a root component barrel; this keeps
lazy chunks independent and preserves the shadcn convention. `./utils` exposes `cn`; `./theme` exposes
only `onThemeSwap`, a DOM MutationObserver subscription to the completed `data-theme` signal, with
explicit cleanup. It knows nothing about the theme catalog or preferences.

Workspace imports may reach `contracts` and `@realthing/locales/react` (the shared i18next instance, for
primitive-owned strings such as the dialog's screen-reader Close and the toast's Dismiss label) only.
External dependencies are React, Radix, cmdk, react-resizable-panels, Remix Icon,
class-variance-authority, clsx, and tailwind-merge. Host internals, app stores, transport, and theme
runtime are forbidden. Tokens remain global CSS variables generated under `apps/web/src/styles`;
utilities follow [[web-color]], [[web-spacing]], and [[web-typography]].

## Button system

`button` is the one implementation of an action button: `Button` (text, optional `iconLeft` /
`iconRight`), `IconButton` (icon only — `label` is required and becomes both the `aria-label` and the shared
`IconTooltip`), `buttonVariants` for a non-button element that must look like one, `buttonDataAttributes`
giving such an element the same `data-slot` / `data-variant` / `data-size` / `data-icon-only` /
`data-selected` contract the components render, and `withIconClass(Icon, classes)` for a tinted or
animated glyph.

- **Variants** (five): `primary`, `soft-primary`, `outline`, `ghost`, `destructive`. `tone`
  (`warning` | `danger`) is the sanctioned label colour on `ghost` and `outline`.
- **Sizes** (three): `s` (20px), `m` (24px, default for `IconButton`), `l` (32px, default for `Button`).
- **States** live in the component: hover, pressed, focus-visible, disabled, loading, and selected.
- **Rows**: a list row that paints its own hover or selected fill carries `data-row`, and a `ghost`
  button inside it takes `container-elevated-bg` for hover, pressed, focus-visible, and selected.
- **Call sites own placement only**: margins, flex/grid placement, `w-full`, positioning, responsive
  visibility, and whole-button hover reveal.

## Primitive invariants

The per-file surface is `button`, `switch`, `dialog`, `dropdown-menu`, `context-menu`, `menu-styles`,
`popover`, `command` (cmdk combobox body), `textarea`, `tooltip`, `resizable`, `toast`, `toggle-segment`
(the slim header toggle), `skeleton` (`SkeletonRows` / `LoadingRegion`), and `attention-line`
(`AttentionLine`), alongside `utils` and `theme`.

- Switch exposes native disabled behavior and `role="switch"`/`aria-checked`, not visible On/Off
  text. Every modal dialog's overlay carries `data-modal-layer`, and `useModalLayerOpen()` reports
  whether one is open. Dialog accepts `hideClose` for chromeless surfaces. `DialogPanel` renders Radix
  content in place without a portal or overlay for caller-positioned, non-modal dialogs.
- React 19 refs pass through controls; dialog/popover portals preserve accessible focus and scroll
  behavior. Popover accepts a host Dialog container for scroll-lock compatibility.
- Icon-only controls use `IconTooltip` with `aria-label`, not native `title`; one root `TooltipProvider`
  sets the delay.
- Context and dropdown menus share menu geometry and token classes.
- Toast exposes `ToastProvider`/`Toast`/`ToastViewport`/`ToastTitle`/`ToastDescription`/`ToastAction`/
  `ToastClose` and `toastVariants` (`error`/`success`/`warning`/`info`).
- Resizable handles paint a 1 px line at their leading edge; the pointer hit area extends only into the
  following panel.
- Primitives use only the host's token utilities, never shadcn's default oklch palette.
