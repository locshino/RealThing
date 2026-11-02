import type { NativeMenuBridge } from "@realthing/contracts";
import { DESKTOP_DIALOG_KEYS, DESKTOP_MENU_KEYS } from "@realthing/locales";
import { t } from "@realthing/locales/react";

function menuBridge(): NativeMenuBridge | undefined {
	const bridge: unknown = Reflect.get(globalThis, "__REALTHING_NATIVE_MENU__");
	return typeof bridge === "object" &&
		bridge !== null &&
		typeof Reflect.get(bridge, "setLabels") === "function"
		? (bridge as NativeMenuBridge)
		: undefined;
}

export function pushNativeMenuLabels(): void {
	const keys = [...DESKTOP_MENU_KEYS, ...DESKTOP_DIALOG_KEYS];
	menuBridge()?.setLabels(Object.fromEntries(keys.map((key) => [key, t(key)])));
}
