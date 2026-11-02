import { expect, test } from "bun:test";
import { join, sep } from "node:path";
import { toolHomeEnv } from "./toolHomes";

test("every tool home resolves under the given home and every outside override is cleared", () => {
	const home = join(sep, "sandbox", "home");
	for (const value of Object.values(toolHomeEnv(home))) {
		expect(value === "" || value === home || value.startsWith(`${home}${sep}`)).toBe(true);
	}
	expect(toolHomeEnv(home).XDG_CONFIG_HOME).toBe(join(home, ".config"));
});
