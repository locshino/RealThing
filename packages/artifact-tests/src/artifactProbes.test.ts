import { expect, test } from "bun:test";
import { hostEnvironment } from "./artifactProbes";

test("isolates both home variables without inheriting Windows case variants", () => {
	const inherited = {
		Home: "real-home",
		HOME: "another-real-home",
		UserProfile: "real-profile",
		Path: "real-path",
		SystemRoot: "system-root",
		UNDEFINED: undefined,
	};
	expect(
		hostEnvironment(
			{ HOME: "isolated-home", USERPROFILE: "isolated-home", PATH: "isolated-path" },
			[],
			inherited,
		),
	).toEqual({
		HOME: "isolated-home",
		USERPROFILE: "isolated-home",
		PATH: "isolated-path",
		SystemRoot: "system-root",
	});
	expect(inherited.UserProfile).toBe("real-profile");
});

test("unsets inherited environment case variants", () => {
	expect(
		hostEnvironment({}, ["REALTHING_DATA_DIR"], {
			realthing_data_dir: "real-data",
			REALTHING_DATA_DIR: "another-real-data",
			HOME: "isolated-home",
			USERPROFILE: "isolated-home",
		}),
	).toEqual({ HOME: "isolated-home", USERPROFILE: "isolated-home" });
});

test("native UI and host modes replace inherited control seams without retaining the other mode", () => {
	const inherited = {
		realthing_desktop_e2e_host: "1",
		realthing_desktop_navigation_probe_file: "real-navigation-file",
		realthing_desktop_ready_file: "real-ready-file",
		realthing_desktop_control_file: "real-control-file",
		HOME: "isolated-home",
		USERPROFILE: "isolated-home",
	};
	const modes: Record<string, string>[] = [
		{ REALTHING_DESKTOP_E2E_HOST: "1" },
		{ REALTHING_DESKTOP_NAVIGATION_PROBE_FILE: "isolated-navigation-file" },
	];
	for (const mode of modes) {
		const overrides = {
			...mode,
			REALTHING_DESKTOP_READY_FILE: "isolated-ready-file",
			REALTHING_DESKTOP_CONTROL_FILE: "isolated-control-file",
		};
		expect(
			hostEnvironment(
				overrides,
				["REALTHING_DESKTOP_E2E_HOST", "REALTHING_DESKTOP_NAVIGATION_PROBE_FILE"],
				inherited,
			),
		).toEqual({ ...overrides, HOME: "isolated-home", USERPROFILE: "isolated-home" });
	}
});
