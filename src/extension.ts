import * as vscode from 'vscode';

function getRelativePath(root: vscode.Uri, uri: vscode.Uri) {
	const rootSetps = root.path.split('/')
	const uriSetps = uri.path.split('/')
	let i = 0
	while (true) {
		i++
		if (i === rootSetps.length)
			return uriSetps.slice(i, uriSetps.length).join('/')
		if (rootSetps[i] !== uriSetps[i])
			throw new Error("Parse scene relative path fail.");
	}
}

async function getWorkspaceScenes(projectUri: vscode.Uri) {
	const pattern: string = '**/*.tscn';
	const include: vscode.GlobPattern = projectUri
		? new vscode.RelativePattern(projectUri, pattern)
		: pattern;
	return vscode.workspace.findFiles(include).then(
		uris => uris.map(uri => { return { uri, path: getRelativePath(projectUri, uri) } })
	)
}

function updateWorkSceneStatusBarItem(): void {
	workSceneStatusBarItem.text = `Scene: ${workScene || 'none'}`;
	workSceneStatusBarItem.show();
}

let workSceneStatusBarItem: vscode.StatusBarItem;
let runStatusBarItem: vscode.StatusBarItem;
let workScene: string = ''

export function activate(context: vscode.ExtensionContext) {
	const { subscriptions } = context
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showErrorMessage('Please open a valid workspace.')
		return
	}
	const rootWorkFolder = vscode.workspace.workspaceFolders[0]
	const rootUri = rootWorkFolder.uri

	subscriptions.push(vscode.commands.registerCommand('godotor.selectScene', async () => {
		const curScene = await vscode.window.showQuickPick(await getWorkspaceScenes(rootUri).then(scenes => scenes.map(scene => scene.path)), {
			placeHolder: 'select scene'
		});
		if (curScene)
			workScene = curScene, updateWorkSceneStatusBarItem()
	}))

	workSceneStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	workSceneStatusBarItem.command = 'godotor.selectScene';
	subscriptions.push(workSceneStatusBarItem);
	updateWorkSceneStatusBarItem();
	const godotExe = vscode.workspace.getConfiguration('godotor').get('godot.executablePath')
	subscriptions.push(vscode.commands.registerCommand('godotor.runScene', async () => {
		const runSceneTask = new vscode.Task(
			{ type: 'shell' },
			rootWorkFolder,
			'build',
			'shell',
			new vscode.ShellExecution(`dotnet build /property:GenerateFullPaths=true /consoleloggerparameters:NoSummary && ${godotExe} ${workScene}`)
		)
		vscode.tasks.executeTask(runSceneTask)
	}))
	runStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	runStatusBarItem.command = 'godotor.runScene';
	subscriptions.push(runStatusBarItem);
	runStatusBarItem.text = 'Run';
	runStatusBarItem.show();
}

// This method is called when your extension is deactivated
export function deactivate() { }
