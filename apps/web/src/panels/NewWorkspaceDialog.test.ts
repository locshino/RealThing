import { describe, expect, test } from "bun:test";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";

describe("NewWorkspaceDialog", () => {
	test("exports NewWorkspaceDialog component", () => {
		expect(typeof NewWorkspaceDialog).toBe("function");
	});
});
