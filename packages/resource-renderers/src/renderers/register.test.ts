import { expect, test } from "bun:test";
import { diffRendererCapabilities, registerResourceRenderer } from "../registry";
import { binaryRenderer } from "./binary";
import { codeRenderer } from "./code";
import { csvRenderer } from "./csv";
import { htmlRenderer } from "./html";
import { imageRenderer } from "./image";
import { jsonRenderer } from "./json";
import { lfsRenderer } from "./lfs";
import { markdownRenderer } from "./markdown";
import { notebookRenderer } from "./notebook";
import { pdfRenderer } from "./pdf";
import { svgRenderer } from "./svg";

const renderers = [
	binaryRenderer,
	codeRenderer,
	csvRenderer,
	htmlRenderer,
	imageRenderer,
	jsonRenderer,
	lfsRenderer,
	markdownRenderer,
	notebookRenderer,
	pdfRenderer,
	svgRenderer,
];

test("bundled renderer registrations declare only supported diff controls", () => {
	expect(
		Object.fromEntries(
			renderers.map((renderer) => [
				renderer.id,
				{
					copy: renderer.capabilities.copy,
					layout: renderer.capabilities.layout,
					whitespace: renderer.capabilities.whitespace,
				},
			]),
		),
	).toEqual({
		"realthing/binary": { copy: false, layout: false, whitespace: false },
		"realthing/code": { copy: true, layout: true, whitespace: true },
		"realthing/csv": { copy: true, layout: false, whitespace: false },
		"realthing/html": { copy: false, layout: false, whitespace: false },
		"realthing/image": { copy: false, layout: false, whitespace: false },
		"realthing/json": { copy: true, layout: false, whitespace: false },
		"realthing/lfs": { copy: false, layout: false, whitespace: false },
		"realthing/markdown": { copy: false, layout: false, whitespace: false },
		"realthing/notebook": { copy: true, layout: false, whitespace: false },
		"realthing/pdf": { copy: false, layout: false, whitespace: false },
		"realthing/svg": { copy: false, layout: false, whitespace: false },
	});
});

test("diff capabilities resolve from a path before content loads", () => {
	const disposers = renderers.map((renderer) => registerResourceRenderer(renderer));
	try {
		const scope = { kind: "uncommitted" } as const;
		const resolve = (path: string, selectedId?: string) => {
			const { layout, whitespace } = diffRendererCapabilities("ws", path, scope, selectedId, false);
			return { layout, whitespace };
		};
		expect({
			md: resolve("docs/a.md"),
			png: resolve("a.png"),
			pdf: resolve("a.pdf"),
			svg: resolve("a.svg"),
			ts: resolve("src/a.ts"),
			mdAsCode: resolve("docs/a.md", "realthing/code"),
		}).toEqual({
			md: { layout: false, whitespace: false },
			png: { layout: false, whitespace: false },
			pdf: { layout: false, whitespace: false },
			svg: { layout: false, whitespace: false },
			ts: { layout: true, whitespace: true },
			mdAsCode: { layout: true, whitespace: true },
		});
	} finally {
		for (const dispose of disposers.reverse()) dispose();
	}
});
