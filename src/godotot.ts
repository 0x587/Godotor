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

interface Configurations {
    executablePath: string | undefined
    displayMode: 'fullscreen' | 'maximized' | 'windowed'
    windowPosition: { x: number, y: number } | undefined
    windowResolution: { x: number, y: number } | undefined
    customArgs: string | undefined
}

export class GodotorExtension {
    private context!: vscode.ExtensionContext
    private config: Configurations = {
        executablePath: undefined,
        displayMode: 'windowed',
        windowPosition: undefined,
        windowResolution: undefined,
        customArgs: undefined
    }
    private channel: vscode.OutputChannel = vscode.window.createOutputChannel('Godotor')
    private workSceneStatusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)

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
        if (!this.config.executablePath) {
            vscode.window.showErrorMessage('Please input godot engine executable path')
        }
        let command = `${this.config.executablePath} ${this.workScene} `

        // display mode
        command += `--${this.config.displayMode} `

        // window position
        if (this.config.windowPosition && this.config.windowPosition.x && this.config.windowPosition.y)
            command += `--position ${this.config.windowPosition.x},${this.config.windowPosition.y} `

        // window resolution
        if (this.config.displayMode === 'windowed' && this.config.windowResolution
            && this.config.windowResolution.x && this.config.windowResolution.y)
            command += `--resolution ${this.config.windowResolution.x}x${this.config.windowResolution.y} `

        // custom args
        if (this.config.customArgs)
            command += `${this.config.customArgs}`

        return new vscode.Task(
            { type: runSceneTaskName },
            this.rootWorkFolder, runSceneTaskName, 'shell',
            new vscode.ShellExecution(command)
        )
    }

    public loadConfig() {
        const scene = this.context.workspaceState.get<string | undefined>('workScene')
        if (scene)
            this.workScene = scene
        const config = vscode.workspace.getConfiguration('godotor')
        this.config.executablePath = config.get<string>('godot.executablePath') || ''
        this.config.displayMode = config.get<'fullscreen' | 'maximized' | 'windowed'>('godot.displayMode') || 'windowed'
        const positionString = config.get<string>('godot.windowPosition') || undefined
        if (positionString) {
            const position = positionString.split(',')
            this.config.windowPosition = { x: parseInt(position[0]), y: parseInt(position[1]) }
        }
        const resolutionString = config.get<string>('godot.windowResolution') || undefined
        if (resolutionString) {
            const resolution = resolutionString.split('x')
            this.config.windowResolution = { x: parseInt(resolution[0]), y: parseInt(resolution[1]) }
        }
        this.config.customArgs = config.get<string>('godot.customArgs') || undefined
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
        this.setScene(curScene)
    }

    private setScene(scene: string | undefined) {
        if (!scene)
            return
        this.workScene = scene
        this.updateWorkSceneStatusBarItem()
        this.context.workspaceState.update('workScene', scene)
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
        console.log(this.running, this.building, this.watching);

        if (name === buildTaskName && exitCode === 0) {
            this.killScene()
            this.building = false
            vscode.tasks.executeTask(this.makeRunSceneTask())
            this.running = true
        }
        if (name === runSceneTaskName) {
            if (exitCode === 1)
                this.running = false, this.watching = false
            else
                this.running = false
        }
    }

    private killScene() {
        for (const taskExecution of vscode.tasks.taskExecutions)
            if (taskExecution.task.name === runSceneTaskName)
                taskExecution.terminate()
    }

    public onDocumentSaved(document: vscode.TextDocument) {
        if (!this.watching)
            return
        if (this.building)
            return
        this.onRunScene()
    }
}