import { expect, test } from "bun:test";
import { WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION } from "@realthing/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { useAppStore } from "@/store";
import { TerminalSettings, WindowsShellSettings } from "./TerminalSettings";

test("the Windows shell picker is hidden off Windows", () => {
	const markup = renderToStaticMarkup(
		<WindowsShellSettings
			platform="darwin"
			protocolVersion={WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION}
			value="auto"
			onSelect={() => {}}
		/>,
	);

	expect(markup).toBe("");
});

test("the Windows shell picker is hidden against older hosts", () => {
	const markup = renderToStaticMarkup(
		<WindowsShellSettings
			platform="win32"
			protocolVersion={WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION - 1}
			value="auto"
			onSelect={() => {}}
		/>,
	);

	expect(markup).toBe("");
});

test("Windows shows all four choices with the configured one active", () => {
	const markup = renderToStaticMarkup(
		<WindowsShellSettings
			platform="win32"
			protocolVersion={WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION}
			value="cmd"
			onSelect={() => {}}
		/>,
	);

	expect(markup).toContain("Windows shell");
	expect(markup).toContain('data-testid="terminal-shell-auto" data-active="false"');
	expect(markup).toContain('data-testid="terminal-shell-pwsh" data-active="false"');
	expect(markup).toContain('data-testid="terminal-shell-powershell" data-active="false"');
	expect(markup).toContain('data-testid="terminal-shell-cmd" data-active="true"');
});

test("TerminalSettings renders font, cursor, scrollback, and custom shell controls", () => {
	const initial = useAppStore.getInitialState();
	const prev = {
		terminalFontSize: initial.terminalFontSize,
		terminalCursorStyle: initial.terminalCursorStyle,
		terminalCursorBlink: initial.terminalCursorBlink,
		terminalScrollbackLines: initial.terminalScrollbackLines,
		terminalReplayKb: initial.terminalReplayKb,
		terminalShellPath: initial.terminalShellPath,
		terminalShellArgs: initial.terminalShellArgs,
	};
	Object.assign(initial, {
		terminalFontSize: 15,
		terminalCursorStyle: "bar",
		terminalCursorBlink: false,
		terminalScrollbackLines: 10000,
		terminalReplayKb: 64,
		terminalShellPath: "/bin/zsh",
		terminalShellArgs: ["--login", "-i"],
	});
	try {
		const markup = renderToStaticMarkup(<TerminalSettings />);

		expect(markup).toContain('data-testid="settings-terminal"');
		expect(markup).toContain('data-testid="terminal-font-size-input"');
		expect(markup).toContain('value="15"');
		expect(markup).toContain('data-testid="terminal-cursor-style-bar" data-active="true"');
		expect(markup).toContain('data-testid="terminal-cursor-blink-switch" data-active="false"');
		expect(markup).toContain('data-testid="terminal-scrollback-lines-input"');
		expect(markup).toContain('value="10000"');
		expect(markup).toContain('data-testid="terminal-replay-64" data-active="true"');
		expect(markup).toContain('data-testid="terminal-shell-path-input"');
		expect(markup).toContain('value="/bin/zsh"');
		expect(markup).toContain('data-testid="terminal-shell-args-input"');
		expect(markup).toContain('value="--login -i"');
	} finally {
		Object.assign(initial, prev);
	}
});
