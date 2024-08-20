import * as vscode from 'vscode';
import { Workspace, Environment, Run, WorkspaceListingDocument} from '../api/types.gen';
import { getWorkspaces } from '../api/services.gen';
import { ScalrAuthenticationProvider, ScalrSession } from './authenticationProvider';
import { getRunStatusIcon, RunTreeDataProvider } from './runProvider';
import { Pagination } from '../@types/api';



export class WorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | vscode.TreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;
    
    private nextPage: null | number = null;
    private workspaces: vscode.TreeItem[] = [];


    constructor(
        private ctx: vscode.ExtensionContext,
        private runProvider: RunTreeDataProvider
    ) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand(
                'workspace.open',
                (ws: WorkspaceItem) => {
                    vscode.env.openExternal(ws.webLink);
                },
            ),
            vscode.commands.registerCommand(
                'workspace.loadMore',
                () => {
                    this.refresh();
                },
            ),
            vscode.commands.registerCommand(
                'workspace.refresh',
                (ws?: WorkspaceItem | LoadMoreItem) => {
                    ws = undefined;


                    this.workspaces = [];
                    this.nextPage = null;
                    this.refresh();
                    this.runProvider.reset();
                    this.runProvider.refresh(ws);
                },
            ),
        );
    }
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([element]);
        }

        return this.buildChildren();
    }

    private async buildChildren(): Promise<vscode.TreeItem[]> {
        this.workspaces = [...this.workspaces, ...(await this.getWorkspaces())];

        const workspaces = this.workspaces.slice(0);
        if (this.nextPage !== null) {
            workspaces.push(new LoadMoreItem
            ());
        }

        return workspaces;
    }

    refresh(): void {
        this.didChangeTreeData.fire();
    }

    private async getWorkspaces(): Promise<vscode.TreeItem[]> {
        const session = await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
            createIfNone: false,
        }) as ScalrSession;
      
        if (session === undefined) {
            return [];
        }

        const { data, error } = await getWorkspaces({
            query: {
                include: ['latest-run', 'environment'],
                page: {
                    number: this.nextPage || 1
                },
                // @ts-ignore TODO:ape this is must be fixed in our product
                sort: ['-updated-at'] 
            }
        });
        
        if (error || !data) {
            vscode.window.showErrorMessage('Failed to fetch workspaces' + error);
            return [];
        }

        const wsDocument = data as WorkspaceListingDocument;
        const pagination = wsDocument.meta?.pagination as Pagination;
        this.nextPage = pagination['next-page'];
        const environmentMap = new Map<string, Environment>();
        const runsMap = new Map<string, Run>();

        for (const inc of wsDocument.included || []) {
            if ((inc as Environment).type === 'environments') {
                environmentMap.set(inc.id as string , inc as Environment);
            } else if ((inc as Run).type === 'runs') {
                runsMap.set(inc.id as string, inc as Run);
            }
        }

        const workspaces = wsDocument.data || [];

        return workspaces.map(workspace => {
            const environment = environmentMap.get(workspace.relationships.environment.data.id) as Environment;
            const run = workspace.relationships['latest-run']?.data ? runsMap.get(workspace.relationships['latest-run'].data.id) : undefined;

            return new WorkspaceItem(session.baseUrl, environment, workspace, run);
        });

    }


    
    dispose() {
        //
    }
}

export class WorkspaceItem extends vscode.TreeItem {
    public readonly webLink: vscode.Uri;

    constructor(
        public readonly host: string,
        public readonly environment: Environment,
        public readonly workspace: Workspace,
        public readonly run?: Run,
         
    ) {
        super(workspace.attributes.name, vscode.TreeItemCollapsibleState.None);

        this.description = `(${environment.attributes.name})`;

        this.iconPath = getRunStatusIcon(run?.attributes?.status);

        this.webLink = vscode.Uri.parse(`${this.host}/e/${environment.id}/workspaces/${workspace.id}/`, true);

        this.tooltip = new vscode.MarkdownString(undefined, true);
        this.tooltip.appendMarkdown(`## $(${this.iconPath.id}) [${this.workspace.attributes.name}](${this.webLink})\n\n`);
        this.tooltip.appendMarkdown(`#### Environment: ${this.environment.attributes.name} \n`);
        this.tooltip.appendMarkdown('___\n\n');
        this.tooltip.appendMarkdown(`#### ID: ${this.workspace.id} \n`);
        this.tooltip.appendMarkdown(`**Run Status**: $(${this.iconPath.id}) ${run?.attributes?.status} \n`);
        this.tooltip.appendMarkdown('___\n\n');
        this.tooltip.appendMarkdown('| | |\n');
        this.tooltip.appendMarkdown('--|--\n');
        this.tooltip.appendMarkdown(`| **Iac Platform**         | ${workspace.attributes['iac-platform']}\n`);
        this.tooltip.appendMarkdown(`| **Terraform Version** | ${workspace.attributes['terraform-version']}|\n`);
        this.tooltip.appendMarkdown(`| **Updated**           | ${workspace.attributes['updated-at']}|\n`);
    }   
}

class LoadMoreItem extends vscode.TreeItem {
    constructor() {
        super('Load more...', vscode.TreeItemCollapsibleState.None);
  
        this.iconPath = new vscode.ThemeIcon('more', new vscode.ThemeColor('charts.gray'));
        this.command = {
            command: 'workspace.loadMore',
            title: 'Load more',
        };
    }
}

