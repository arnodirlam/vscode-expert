import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
	type Disposable,
	languages,
	Position,
	ProgressLocation,
	Range,
	type TextDocument,
	TextEdit,
	window,
	workspace,
} from "vscode";
import * as Logger from "./logger";

export function formatDocument(targetText: string, document: TextDocument): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const workspaceFolders = workspace.workspaceFolders;

		if (!workspaceFolders || workspaceFolders.length === 0) {
			return reject(new Error("No workspace folder is open"));
		}

		const targetPath = document.fileName;
		const targetExt = path.extname(targetPath);

		// Create tmp file
		const tmpDir = path.join(os.tmpdir(), "vscode-elixir-mix-formatter");

		if (!fs.existsSync(tmpDir)) {
			fs.mkdirSync(tmpDir, { recursive: true });
		}

		const tmpFileName = path.normalize(
			`${tmpDir}/expert-${Math.random()
				.toString(36)
				.substring(7)
				.replace(/[^a-z0-9]+/g, "")}${targetExt}`,
		);

		try {
			fs.writeFileSync(tmpFileName, targetText);
		} catch (err) {
			Logger.error(`Could not create tmp file in "${tmpDir}": ${err}`);
			return reject(new Error(`Could not create tmp file in "${tmpDir}"`));
		}

		// Run mix formatter script
		try {
			const cwd = workspaceFolders[0].uri.fsPath;
			cp.execSync(`mix format ${tmpFileName}`, { cwd });
		} catch (err) {
			Logger.error(`Failed to format document: ${err}`);

			try {
				fs.unlinkSync(tmpFileName);
			} catch {
				// Ignore cleanup errors
			}

			return reject(new Error("Failed to format the document"));
		}

		// Get formatted text
		let formatted: string;
		try {
			formatted = fs.readFileSync(tmpFileName, "utf-8");
		} catch (err) {
			Logger.error(`Could not read formatted file: ${err}`);

			try {
				fs.unlinkSync(tmpFileName);
			} catch {
				// Ignore cleanup errors
			}

			return reject(new Error("Failed to read formatted document"));
		}

		// Remove tmp file
		try {
			fs.unlinkSync(tmpFileName);
		} catch {
			// Ignore cleanup errors
		}

		// Return new document text
		if (formatted.length > 0) {
			resolve(formatted);
		} else {
			reject(new Error("Formatter returned empty result"));
		}
	});
}

/**
 * Registers the Elixir formatter provider for VS Code.
 * Returns a Disposable that can be used to unregister the formatter.
 */
export function registerFormatter(): Disposable {
	return languages.registerDocumentFormattingEditProvider(
		[
			{ language: "elixir", scheme: "file" },
			{ language: "html-eex", scheme: "file" },
		],
		{
			provideDocumentFormattingEdits: (document: TextDocument) => {
				return window.withProgress(
					{
						location: ProgressLocation.Notification,
						title: "Mix Formatter: Formatting document",
					},
					() => {
						return new Promise<TextEdit[]>((resolve, reject) => {
							const targetText = document.getText();
							const lastLine = document.lineAt(document.lineCount - 1);
							const range = new Range(new Position(0, 0), lastLine.range.end);

							formatDocument(targetText, document)
								.then((text: string) => {
									resolve([new TextEdit(range, text)]);
								})
								.catch((err) => {
									if (err instanceof Error) {
										window.showErrorMessage(`Mix Formatter: ${err.message}`);
									}
									reject(err);
								});
						});
					},
				);
			},
		},
	);
}
