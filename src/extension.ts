import * as vscode from 'vscode';

import { GodotorExtension } from './godotot';

export function activate(context: vscode.ExtensionContext) {
	const extension = new GodotorExtension(context)
	const { subscriptions } = context

	subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(() => {
			extension.loadConfig();
		}),
		vscode.commands.registerCommand('godotor.selectScene', async () => {
			extension.onSelectScene()
		}),
		vscode.commands.registerCommand('godotor.runScene', async () => {
			extension.onRunScene()
		}),
		// vscode.workspace.onWillSaveTextDocument((e: vscode.TextDocumentWillSaveEvent) => {
		// 	e.waitUntil(extension.onWillSaveDocument(e.document))
		// }),
		vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
			extension.onDocumentSaved(document)
		}),
	)
}

// This method is called when your extension is deactivated
export function deactivate() { }
