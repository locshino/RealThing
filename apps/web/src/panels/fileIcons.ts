import {
	type RemixiconComponentType,
	RiBracesFill,
	RiBracesLine,
	RiCodeSSlashFill,
	RiCodeSSlashLine,
	RiCss3Fill,
	RiCss3Line,
	RiFileFill,
	RiFileLine,
	RiFileTextFill,
	RiFileTextLine,
	RiHtml5Fill,
	RiHtml5Line,
	RiImageFill,
	RiImageLine,
	RiLock2Fill,
	RiLock2Line,
	RiMarkdownFill,
	RiMarkdownLine,
	RiTableFill,
	RiTableLine,
	RiTerminalBoxFill,
	RiTerminalBoxLine,
} from "@remixicon/react";
import type { AppConfig } from "@realthing/contracts";

interface IconPair {
	line: RemixiconComponentType;
	fill: RemixiconComponentType;
}

const CODE_ICON: IconPair = { line: RiCodeSSlashLine, fill: RiCodeSSlashFill };
const CONFIG_ICON: IconPair = { line: RiBracesLine, fill: RiBracesFill };
const MARKDOWN_ICON: IconPair = { line: RiMarkdownLine, fill: RiMarkdownFill };
const DOC_ICON: IconPair = { line: RiFileTextLine, fill: RiFileTextFill };
const CSS_ICON: IconPair = { line: RiCss3Line, fill: RiCss3Fill };
const HTML_ICON: IconPair = { line: RiHtml5Line, fill: RiHtml5Fill };
const IMAGE_ICON: IconPair = { line: RiImageLine, fill: RiImageFill };
const SHELL_ICON: IconPair = { line: RiTerminalBoxLine, fill: RiTerminalBoxFill };
const LOCK_ICON: IconPair = { line: RiLock2Line, fill: RiLock2Fill };
const TABLE_ICON: IconPair = { line: RiTableLine, fill: RiTableFill };
const DEFAULT_ICON: IconPair = { line: RiFileLine, fill: RiFileFill };

const EXACT_NAME_ICONS: Readonly<Record<string, IconPair>> = {
	dockerfile: SHELL_ICON,
	makefile: SHELL_ICON,
	"bun.lock": LOCK_ICON,
	"package-lock.json": LOCK_ICON,
	"pnpm-lock.yaml": LOCK_ICON,
	"yarn.lock": LOCK_ICON,
	".env": LOCK_ICON,
};

const EXTENSION_ICONS: Readonly<Record<string, IconPair>> = {
	ts: CODE_ICON,
	tsx: CODE_ICON,
	js: CODE_ICON,
	jsx: CODE_ICON,
	py: CODE_ICON,
	go: CODE_ICON,
	rs: CODE_ICON,
	java: CODE_ICON,
	c: CODE_ICON,
	cpp: CODE_ICON,
	rb: CODE_ICON,
	php: CODE_ICON,
	swift: CODE_ICON,
	kt: CODE_ICON,
	json: CONFIG_ICON,
	jsonc: CONFIG_ICON,
	yaml: CONFIG_ICON,
	yml: CONFIG_ICON,
	toml: CONFIG_ICON,
	xml: CONFIG_ICON,
	md: MARKDOWN_ICON,
	mdx: MARKDOWN_ICON,
	txt: DOC_ICON,
	rst: MARKDOWN_ICON,
	css: CSS_ICON,
	scss: CSS_ICON,
	less: CSS_ICON,
	html: HTML_ICON,
	htm: HTML_ICON,
	png: IMAGE_ICON,
	jpg: IMAGE_ICON,
	jpeg: IMAGE_ICON,
	gif: IMAGE_ICON,
	svg: IMAGE_ICON,
	webp: IMAGE_ICON,
	ico: IMAGE_ICON,
	sh: SHELL_ICON,
	bash: SHELL_ICON,
	zsh: SHELL_ICON,
	fish: SHELL_ICON,
	ps1: SHELL_ICON,
	lock: LOCK_ICON,
	env: LOCK_ICON,
	csv: TABLE_ICON,
	tsv: TABLE_ICON,
	sql: TABLE_ICON,
	db: TABLE_ICON,
	sqlite: TABLE_ICON,
};

function resolveIconPair(name: string): IconPair {
	const baseName = (name.split("/").pop() ?? name).toLowerCase();
	const exact = EXACT_NAME_ICONS[baseName];
	if (exact) return exact;
	if (baseName.startsWith(".env.")) return LOCK_ICON;
	const dotIndex = baseName.lastIndexOf(".");
	if (dotIndex <= 0) return DEFAULT_ICON;
	const ext = baseName.slice(dotIndex + 1);
	return EXTENSION_ICONS[ext] ?? DEFAULT_ICON;
}

export function getFileIcon(
	name: string,
	isSelected: boolean,
	mode: AppConfig["explorerFileIcons"],
): RemixiconComponentType {
	if (mode === "minimal") {
		return isSelected ? RiFileFill : RiFileLine;
	}
	const pair = resolveIconPair(name);
	return isSelected ? pair.fill : pair.line;
}
