import * as vscode from 'vscode';
import { Workspace, Environment, Run, WorkspaceListingDocument} from '../api/types.gen';
import { getWorkspaces } from '../api/services.gen';
import { ScalrAuthenticationProvider, ScalrSession } from './authenticationProvider';



export class WorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | vscode.TreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;


    constructor(
        private ctx: vscode.ExtensionContext,
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

        const text = `
## $(${this.iconPath.id}) [${this.workspace.attributes.name}](${this.webLink})

#### ID: *${this.workspace.id}*

Run Status: $(${this.iconPath.id}) ${run?.attributes?.status}

___
| | |
--|--
| **Iac Platform**         | ${this.workspace.attributes['iac-platform']}
| **Terraform Version** | ${this.workspace.attributes['terraform-version']}|
| **Updated**           | ${this.workspace.attributes['updated-at']}|

`;

        this.tooltip = new vscode.MarkdownString(text, true);
    }   
}



/**
 * 
 * 
 * @param status 
 * @returns 
 */
function getRunStatusIcon(status?: string): vscode.ThemeIcon {

    switch (status) {
    // in progress
    case 'pending':
    case 'plan_queued':
    case 'apply_queued':
        return new vscode.ThemeIcon('watch', new vscode.ThemeColor('charts.gray'));
    case 'pending':
    case 'policy_checking':
    case 'const_estimating':
    case 'applying':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.gray'));
    case 'discarded':
    case 'canceled':
        return new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.gray'));
    case 'planned':
    case 'policy_override':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
    case 'applied':
    case 'planned_and_finished':
    case 'policy_checked':
        return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
    case 'errored':
        return new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.red'));
    }

    return new vscode.ThemeIcon('dash');
}

