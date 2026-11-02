import { t } from "@realthing/locales/react";

export function projectInitial(name: string): string {
	const first = [...name.trim()][0];
	return first ? first.toLocaleUpperCase() : "?";
}

export function pluralCommits(count: number): string {
	return t("shell.location.commits", { count });
}
