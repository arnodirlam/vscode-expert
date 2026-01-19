import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	Fixture,
	getFixturePath,
	type LanguageClient,
	State,
	waitForBuildComplete,
	waitForClientReady,
	waitForDiagnostics,
} from "../helpers";

describe("Extension E2E Tests", () => {
	let client: LanguageClient | undefined;

	it("should start the language client", async () => {
		// Activate extension and get client
		client = await activateExtension();
		assert.ok(client, "Language client should be available after activation");

		// Wait for server to reach Running state
		await waitForClientReady(client);
		assert.strictEqual(client.state, State.Running, "Client should be in Running state");
	});

	it("should complete project build", async () => {
		assert.ok(client, "Client should exist from previous test");

		// Wait for the "Building {project}" progress to complete
		await waitForBuildComplete(client);
	});

	it("should get diagnostics", async () => {
		assert.ok(client, "Client should exist from previous test");

		// Open fixture document
		const fixturePath = getFixturePath(Fixture.Diagnostics);
		const doc = await vscode.workspace.openTextDocument(fixturePath);
		await vscode.window.showTextDocument(doc);

		// Wait for diagnostics (should be quick now that build is complete)
		const diagnostics = await waitForDiagnostics(doc.uri);
		assert.ok(diagnostics.length > 0, "Should have received diagnostics");

		// Verify diagnostic content
		assert.strictEqual(diagnostics.length, 1, "Should have exactly 1 diagnostic");

		const diagnostic = diagnostics[0];
		assert.strictEqual(diagnostic.message, "undefined function foo/0");
		assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
		assert.deepStrictEqual(
			diagnostic.range,
			new vscode.Range(new vscode.Position(2, 4), new vscode.Position(3, 0)),
		);
	});

	it("should format Elixir document with mix format", async () => {
		// Formatter is registered on activation; does not require the language client
		const fixturePath = getFixturePath(Fixture.Unformatted);
		const doc = await vscode.workspace.openTextDocument(fixturePath);
		await vscode.window.showTextDocument(doc);

		const originalText = doc.getText();

		await vscode.commands.executeCommand("editor.action.formatDocument");

		const formattedText = doc.getText();
		assert.notStrictEqual(
			formattedText,
			originalText,
			"Document should be modified by formatter",
		);
		// mix format fixes indentation and spacing
		assert.ok(
			formattedText.includes("  def hello do"),
			"Should have correct indentation for def hello do",
		);
		assert.ok(
			formattedText.includes("def add(a, b)"),
			"Should add space after comma in def add(a, b)",
		);
	});
});
