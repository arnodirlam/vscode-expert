// biome-ignore-all lint/suspicious/noExplicitAny: mocks as any

import assert from "node:assert";
import * as fs from "node:fs";
import { afterEach, before, describe, it, mock } from "node:test";
import { workspace } from "vscode";

// Set by each test that needs to stub execSync; read by the mocked child_process
let execSyncImpl: ((cmd: string, _opts?: unknown) => void) | null = null;

// Set by tests that need to control getWorkspaceFolder; default returns first workspace
let getWorkspaceFolderImpl: ((uri: any) => any) | null = null;

type MockDocument = {
	fileName: string;
	uri: { scheme?: string; fsPath: string };
	languageId?: string;
};

function createDocument(fileName: string): MockDocument {
	return { fileName, uri: { fsPath: fileName } };
}

function createUntitledDocument(languageId: string): MockDocument {
	return {
		fileName: "Untitled-1",
		uri: { scheme: "untitled", fsPath: "" },
		languageId,
	};
}

describe("formatDocument", () => {
	let formatDocument: (text: string, doc: MockDocument) => Promise<string>;

	before(async () => {
		mock.module("child_process", {
			namedExports: {
				execSync: (cmd: string, opts?: unknown) => {
					if (execSyncImpl) {
						return execSyncImpl(cmd, opts);
					}
					throw new Error("execSync not mocked for this test");
				},
			},
		});

		mock.method(workspace, "getWorkspaceFolder", (uri: any) => {
			if (getWorkspaceFolderImpl) {
				return getWorkspaceFolderImpl(uri);
			}
			return workspace.workspaceFolders?.[0];
		});

		const formatter = await import("../formatter");
		formatDocument = formatter.formatDocument as (
			text: string,
			doc: MockDocument,
		) => Promise<string>;
	});

	afterEach(() => {
		const defaultWorkspaceFolders = [
			{ uri: { path: "/test/workspace", fsPath: "/test/workspace" } },
		];
		workspace.workspaceFolders = defaultWorkspaceFolders as any;
		execSyncImpl = null;
		getWorkspaceFolderImpl = null;
	});

	it("rejects when no workspace folder is open", async () => {
		workspace.workspaceFolders = [] as any;

		await assert.rejects(formatDocument("def a do 1 end", createDocument("/a.ex")), {
			message: "No workspace folder is open",
		});
	});

	it("resolves with formatted text when mix format succeeds", async () => {
		const formattedOutput = "defmodule Formatted do\n  def ok, do: :ok\nend\n";
		execSyncImpl = (cmd: string) => {
			const filePath = cmd.replace(/^mix format\s+/, "").trim();
			fs.writeFileSync(filePath, formattedOutput);
		};

		const result = await formatDocument("def a do 1 end", createDocument("/some/file.ex"));

		assert.strictEqual(result, formattedOutput);
	});

	it("rejects when mix format fails (execSync throws)", async () => {
		execSyncImpl = () => {
			throw new Error("mix format failed");
		};

		await assert.rejects(formatDocument("def a do 1 end", createDocument("/a.ex")), {
			message: "Failed to format the document",
		});
	});

	it("rejects when formatter returns empty result", async () => {
		execSyncImpl = (cmd: string) => {
			const filePath = cmd.replace(/^mix format\s+/, "").trim();
			fs.writeFileSync(filePath, "");
		};

		await assert.rejects(formatDocument("def a do 1 end", createDocument("/a.ex")), {
			message: "Formatter returned empty result",
		});
	});

	it("uses document's workspace folder as cwd", async () => {
		const secondWorkspace = { uri: { fsPath: "/second/workspace" } };
		workspace.workspaceFolders = [{ uri: { fsPath: "/first/workspace" } }, secondWorkspace] as any;

		getWorkspaceFolderImpl = () => secondWorkspace;

		let capturedCwd: string | undefined;
		execSyncImpl = (cmd: string, opts?: any) => {
			capturedCwd = opts?.cwd;
			const filePath = cmd.replace(/^mix format\s+/, "").trim();
			fs.writeFileSync(filePath, "formatted\n");
		};

		await formatDocument("code", createDocument("/second/workspace/file.ex"));

		assert.strictEqual(capturedCwd, "/second/workspace");
	});

	it("falls back to first workspace when document is outside any folder", async () => {
		workspace.workspaceFolders = [
			{ uri: { fsPath: "/first/workspace" } },
			{ uri: { fsPath: "/second/workspace" } },
		] as any;

		getWorkspaceFolderImpl = () => undefined;

		let capturedCwd: string | undefined;
		execSyncImpl = (cmd: string, opts?: any) => {
			capturedCwd = opts?.cwd;
			const filePath = cmd.replace(/^mix format\s+/, "").trim();
			fs.writeFileSync(filePath, "formatted\n");
		};

		await formatDocument("code", createDocument("/outside/workspace/file.ex"));

		assert.strictEqual(capturedCwd, "/first/workspace");
	});

	describe("untitled documents", () => {
		it("uses .ex extension for untitled elixir files", async () => {
			const formattedOutput = "defmodule Test do\n  def ok, do: :ok\nend\n";
			let capturedFilePath: string | undefined;
			execSyncImpl = (cmd: string) => {
				const filePath = cmd.replace(/^mix format\s+/, "").trim();
				capturedFilePath = filePath;
				fs.writeFileSync(filePath, formattedOutput);
			};

			const result = await formatDocument(
				"defmodule Test do def ok, do: :ok end",
				createUntitledDocument("elixir"),
			);

			assert.ok(capturedFilePath?.endsWith(".ex"));
			assert.strictEqual(result, formattedOutput);
		});

		it("uses .heex extension for untitled html-eex files", async () => {
			const formattedOutput = "<div>\n  <p>Hello</p>\n</div>\n";
			let capturedFilePath: string | undefined;
			execSyncImpl = (cmd: string) => {
				const filePath = cmd.replace(/^mix format\s+/, "").trim();
				capturedFilePath = filePath;
				fs.writeFileSync(filePath, formattedOutput);
			};

			const result = await formatDocument(
				"<div><p>Hello</p></div>",
				createUntitledDocument("html-eex"),
			);

			assert.ok(capturedFilePath?.endsWith(".heex"));
			assert.strictEqual(result, formattedOutput);
		});

		it("uses first workspace folder for untitled files", async () => {
			workspace.workspaceFolders = [
				{ uri: { fsPath: "/first/workspace" } },
				{ uri: { fsPath: "/second/workspace" } },
			] as any;

			getWorkspaceFolderImpl = () => undefined;

			let capturedCwd: string | undefined;
			execSyncImpl = (cmd: string, opts?: any) => {
				capturedCwd = opts?.cwd;
				const filePath = cmd.replace(/^mix format\s+/, "").trim();
				fs.writeFileSync(filePath, "formatted\n");
			};

			await formatDocument("code", createUntitledDocument("elixir"));

			assert.strictEqual(capturedCwd, "/first/workspace");
		});

		it("rejects untitled files when no workspace is open", async () => {
			workspace.workspaceFolders = [] as any;

			await assert.rejects(
				formatDocument("def a do 1 end", createUntitledDocument("elixir")),
				{
					message: "No workspace folder is open",
				},
			);
		});
	});
});
