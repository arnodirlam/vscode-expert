// biome-ignore-all lint/suspicious/noExplicitAny: mocks as any

import * as fs from "node:fs";
import assert from "node:assert";
import { afterEach, before, describe, it, mock } from "node:test";
import { workspace } from "vscode";

// Set by each test that needs to stub execSync; read by the mocked child_process
let execSyncImpl: ((cmd: string, _opts?: unknown) => void) | null = null;

function createDocument(fileName: string): { fileName: string } {
	return { fileName };
}

describe("formatDocument", () => {
	let formatDocument: (
		text: string,
		doc: { fileName: string },
	) => Promise<string>;

	before(async () => {
		mock.module("child_process", {
			namedExports: {
				execSync: (cmd: string, opts?: unknown) => {
					if (execSyncImpl) return execSyncImpl(cmd, opts);
					throw new Error("execSync not mocked for this test");
				},
			},
		});
		const formatter = await import("../formatter");
		formatDocument = formatter.formatDocument;
	});

	afterEach(() => {
		const defaultWorkspaceFolders = [
			{ uri: { path: "/test/workspace", fsPath: "/test/workspace" } },
		];
		workspace.workspaceFolders = defaultWorkspaceFolders as any;
		execSyncImpl = null;
	});

	it("rejects when no workspace folder is open", async () => {
		workspace.workspaceFolders = [] as any;

		await assert.rejects(
			formatDocument("def a do 1 end", createDocument("/a.ex")),
			{ message: "No workspace folder is open" },
		);
	});

	it("resolves with formatted text when mix format succeeds", async () => {
		const formattedOutput = "defmodule Formatted do\n  def ok, do: :ok\nend\n";
		execSyncImpl = (cmd: string) => {
			const filePath = cmd.replace(/^mix format\s+/, "").trim();
			fs.writeFileSync(filePath, formattedOutput);
		};

		const result = await formatDocument(
			"def a do 1 end",
			createDocument("/some/file.ex"),
		);

		assert.strictEqual(result, formattedOutput);
	});

	it("rejects when mix format fails (execSync throws)", async () => {
		execSyncImpl = () => {
			throw new Error("mix format failed");
		};

		await assert.rejects(
			formatDocument("def a do 1 end", createDocument("/a.ex")),
			{ message: "Failed to format the document" },
		);
	});

	it("rejects when formatter returns empty result", async () => {
		execSyncImpl = (cmd: string) => {
			const filePath = cmd.replace(/^mix format\s+/, "").trim();
			fs.writeFileSync(filePath, "");
		};

		await assert.rejects(
			formatDocument("def a do 1 end", createDocument("/a.ex")),
			{ message: "Formatter returned empty result" },
		);
	});
});
