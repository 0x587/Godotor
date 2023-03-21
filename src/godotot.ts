import { randomInt } from 'crypto'
import * as vscode from 'vscode'

const getRelativePath = (root: vscode.Uri, uri: vscode.Uri) => {
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
const buildTaskName = 'GodotBuild'
const runSceneTaskName = 'GodotRunScene'

export class GodotorExtension {
    private context!: vscode.ExtensionContext
    private config!: vscode.WorkspaceConfiguration
    private channel: vscode.OutputChannel = vscode.window.createOutputChannel('Godotor')
    private workSceneStatusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)

    private godotExecutablePath: string = ''
    private workScene: string | undefined

    private rootWorkFolder!: vscode.WorkspaceFolder
    private rootUri!: vscode.Uri

    private watching: boolean = false
    private building: boolean = false
    private running: boolean = false

    constructor(context: vscode.ExtensionContext) {
        if (!vscode.workspace.workspaceFolders?.length) {
            vscode.window.showErrorMessage('Please open a valid workspace.')
            return
        }
        this.rootWorkFolder = vscode.workspace.workspaceFolders[0]
        this.rootUri = this.rootWorkFolder.uri

        this.context = context
        this.loadConfig()
        context.subscriptions.push(this.channel)
        context.subscriptions.push(this.workSceneStatusBarItem)
        this.workSceneStatusBarItem.command = 'godotor.selectScene';
        this.updateWorkSceneStatusBarItem()

        vscode.tasks.onDidEndTaskProcess(e => this.taskDidEndWatchDog(e))
    }

    private makeBuildTask() {
        return new vscode.Task(
            { type: buildTaskName },
            this.rootWorkFolder, buildTaskName, 'shell',
            new vscode.ShellExecution(`dotnet build /property:GenerateFullPaths=true /consoleloggerparameters:NoSummary`)
        )
    }

    private makeRunSceneTask() {
        if (!this.godotExecutablePath) {
            vscode.window.showErrorMessage('Please input godot engine executable path')
        }
        return new vscode.Task(
            { type: runSceneTaskName },
            this.rootWorkFolder, runSceneTaskName, 'shell',
            new vscode.ShellExecution(`${this.godotExecutablePath} ${this.workScene}`)
        )
    }

    public loadConfig() {
        this.config = vscode.workspace.getConfiguration('godotor')
        this.godotExecutablePath = this.config.get('godot.executablePath') || ''
    }

    private async getWorkspaceScenes() {
        const pattern: string = '**/*.tscn';
        const include: vscode.GlobPattern = new vscode.RelativePattern(this.rootUri, pattern)
        const uris = await vscode.workspace.findFiles(include)
        uris.map(uri => { return { uri, path: getRelativePath(this.rootUri, uri) } })

        return vscode.workspace.findFiles(include).then(
            uris => uris.map(uri => getRelativePath(this.rootUri, uri))
        )
    }

    private updateWorkSceneStatusBarItem() {
        this.workSceneStatusBarItem.text = `Scene: ${this.workScene || 'none'}`;
        this.workSceneStatusBarItem.show();
    }

    public async onSelectScene() {
        const curScene = await vscode.window.showQuickPick(await this.getWorkspaceScenes(), {
            placeHolder: 'select scene'
        });
        if (curScene)
            this.workScene = curScene, this.updateWorkSceneStatusBarItem()
    }

    public async onRunScene() {
        vscode.tasks.executeTask(this.makeBuildTask())
        this.building = true
        this.watching = true
    }

    private async taskDidEndWatchDog(e: vscode.TaskProcessEndEvent) {
        const { name } = e.execution.task
        const { exitCode } = e
        console.log(name, exitCode);
        if (name === buildTaskName && exitCode === 0) {
            if (this.running) {
                for (const taskExecution of vscode.tasks.taskExecutions) {
                    if (taskExecution.task.name === runSceneTaskName)
                        taskExecution.terminate(), this.running = false
                }
            }
            this.building = false
            vscode.tasks.executeTask(this.makeRunSceneTask())
            this.running = true
        }
        if (name === runSceneTaskName) {
            if (exitCode === 1)
                this.running = this.watching = false
            else
                this.running = false
        }
    }

    public onDocumentSaved(document: vscode.TextDocument) {
        if (!this.watching)
            return
        if (this.building)
            return
        this.onRunScene()
    }
}