import * as vscode from 'vscode';
import { Workspace, Environment, Run, WorkspaceListingDocument} from '../api/types.gen';
import { getWorkspaces } from '../api/services.gen';
import { ScalrAuthenticationProvider, ScalrSession } from './authenticationProvider';
import { getRunStatusIcon, RunTreeDataProvider } from './runProvider';



export class WorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | vscode.TreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;

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
        );


    }
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            return this.getWorkspaces();
        }
        
        return Promise.resolve([]);
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
                'page[size]': '100',
                // @ts-ignore TODO:ape this is must be fixed in our product
                sort: ['-updated-at'] 
            }
        });
        
        if (error || !data) {
            vscode.window.showErrorMessage('Failed to fetch workspaces' + error);
            return [];
        }

        const wsDocument = data as WorkspaceListingDocument;

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

class WorkspaceItem extends vscode.TreeItem {
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
        this.tooltip.appendMarkdown(`#### Environment: *${this.environment.attributes.name}* \n`);
        this.tooltip.appendMarkdown('___\n\n');
        this.tooltip.appendMarkdown(`#### ID: *${this.workspace.id}* \n`);
        this.tooltip.appendMarkdown(`Run Status: $(${this.iconPath.id}) ${run?.attributes?.status} \n`);
        this.tooltip.appendMarkdown('___\n\n');
        this.tooltip.appendMarkdown('| | |\n');
        this.tooltip.appendMarkdown('--|--\n');
        this.tooltip.appendMarkdown(`| **Iac Platform**         | ${workspace.attributes['iac-platform']}\n`);
        this.tooltip.appendMarkdown(`| **Terraform Version** | ${workspace.attributes['terraform-version']}|\n`);
        this.tooltip.appendMarkdown(`| **Updated**           | ${workspace.attributes['updated-at']}|\n`);
    }   
}

