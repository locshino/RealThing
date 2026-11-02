import { join } from "node:path";

export function toolHomeEnv(home: string): Record<string, string> {
	return {
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: join(home, ".config"),
	};
}
