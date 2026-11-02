import {
	type RemixiconComponentType,
	RiCodeSSlashLine,
	RiDownloadCloud2Line,
	RiFolder3Line,
	RiGitBranchLine,
	RiKeyboardBoxLine,
	RiLayoutTop2Line,
	RiPaletteLine,
	RiTerminalBoxLine,
	RiTranslate2,
} from "@remixicon/react";
import { LOCALES_PROTOCOL_VERSION } from "@realthing/contracts";
import type { MessageKey } from "@realthing/locales";
import { SettingsSection } from "@/store";

export interface SettingsNavSection {
	id: SettingsSection;
	label: MessageKey;
	icon: RemixiconComponentType;
	requiresInjectedContent?: true;
	requiresProtocolVersion?: number;
}

export interface SettingsNavGroup {
	label: MessageKey;
	sections: SettingsNavSection[];
}

const NAV_GROUPS: SettingsNavGroup[] = [
	{
		label: "settings.nav.group.interface",
		sections: [
			{ id: SettingsSection.Appearance, label: "settings.nav.appearance", icon: RiPaletteLine },
			{ id: SettingsSection.Editor, label: "settings.nav.editor", icon: RiCodeSSlashLine },
			{ id: SettingsSection.Files, label: "settings.nav.files", icon: RiFolder3Line },
			{
				id: SettingsSection.Language,
				label: "settings.nav.language",
				icon: RiTranslate2,
				requiresProtocolVersion: LOCALES_PROTOCOL_VERSION,
			},
			{ id: SettingsSection.Layout, label: "settings.nav.layout", icon: RiLayoutTop2Line },
			{ id: SettingsSection.Terminal, label: "settings.nav.terminal", icon: RiTerminalBoxLine },
			{
				id: SettingsSection.Keybindings,
				label: "settings.nav.keybindings",
				icon: RiKeyboardBoxLine,
			},
			{ id: SettingsSection.Git, label: "settings.nav.git", icon: RiGitBranchLine },
		],
	},
	{
		label: "settings.nav.group.system",
		sections: [
			{
				id: SettingsSection.Updates,
				label: "settings.nav.updates",
				icon: RiDownloadCloud2Line,
				requiresInjectedContent: true,
			},
		],
	},
];

function isAvailable(
	section: SettingsNavSection,
	protocolVersion: number | null,
	hasUpdates: boolean,
): boolean {
	return (
		(!section.requiresInjectedContent || hasUpdates) &&
		(section.requiresProtocolVersion === undefined ||
			(protocolVersion !== null && protocolVersion >= section.requiresProtocolVersion))
	);
}

export function settingsNavGroups(
	protocolVersion: number | null,
	hasUpdates: boolean,
): SettingsNavGroup[] {
	return filterSettingsNavGroups(NAV_GROUPS, protocolVersion, hasUpdates);
}

export function visibleSettingsNavGroups(
	protocolVersion: number | null,
	hasUpdates: boolean,
): SettingsNavGroup[] {
	return settingsNavGroups(protocolVersion, hasUpdates);
}

export function filterSettingsNavGroups(
	groups: SettingsNavGroup[],
	protocolVersion: number | null,
	hasUpdates: boolean,
): SettingsNavGroup[] {
	return groups
		.map((group) => ({
			...group,
			sections: group.sections.filter((s) => isAvailable(s, protocolVersion, hasUpdates)),
		}))
		.filter((group) => group.sections.length > 0);
}

export function resolveSettingsSection(
	section: SettingsSection,
	groups: SettingsNavGroup[],
): SettingsSection {
	const available = groups.flatMap((g) => g.sections);
	if (available.some((s) => s.id === section)) {
		return section;
	}
	if (available.some((s) => s.id === SettingsSection.Appearance)) {
		return SettingsSection.Appearance;
	}
	return available[0]?.id ?? SettingsSection.Appearance;
}
