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

		const targetExt = path.extname(document.fileName);
		let tmpDir: string | undefined;

		try {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "expert-format-"));
			const tmpFile = path.join(tmpDir, `doc${targetExt}`);

			fs.writeFileSync(tmpFile, targetText);

			const cwd = workspaceFolders[0].uri.fsPath;
			cp.execSync(`mix format ${tmpFile}`, { cwd });

			const formatted = fs.readFileSync(tmpFile, "utf-8");

			if (formatted.length > 0) {
				resolve(formatted);
			} else {
				reject(new Error("Formatter returned empty result"));
			}
		} catch (err) {
			Logger.error(`Failed to format document: ${err}`);
			reject(new Error("Failed to format the document"));
		} finally {
			if (tmpDir) {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
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
