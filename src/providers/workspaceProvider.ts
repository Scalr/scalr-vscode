import * as vscode from 'vscode';
import { Workspace, Environment, Run, WorkspaceListingDocument} from '../api/types.gen';
import { getWorkspaces } from '../api/services.gen';
import { ScalrAuthenticationProvider } from './authenticationProvider';



export class WorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | vscode.TreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;

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
        });
      
        if (session === undefined) {
            return [];
        }



        const { data, error } = await getWorkspaces({
            query: {
                include: ['latest-run', 'environment'], 'page[size]':'100'
            }
        });
        console.log(data);
        
        if (error || !data) {
            vscode.window.showErrorMessage('Failed to fetch workspaces' + error);
            return [];
        }

        const wsDocument = data as WorkspaceListingDocument;

        const environmentMap = new Map<string, Environment>();
        const runsMap = new Map<string, Run>();
        console.log(wsDocument);

        for (const inc of wsDocument.included || []) {
            console.log(inc);
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

            return new WorkspaceItem(environment, workspace, run);
        });

    }


    
    dispose() {
        //
    }
}

class WorkspaceItem extends vscode.TreeItem {
    constructor(
        public readonly environment: Environment,
        public readonly workspace: Workspace,
        public readonly run?: Run
         
    ) {
        super(workspace.attributes.name, vscode.TreeItemCollapsibleState.None);

        this.description = `(${environment.attributes.name})`;
        
        //TODO: change icon based on run status
        console.log(run);

        this.iconPath = getRunStatusIcon(run?.attributes?.status);

        const text = `

    ## Workspace: ${workspace.attributes.name}

    ### Environment: ${environment.attributes.name}

    ### Run status ${run?.attributes?.status}


    `;

        this.tooltip = new vscode.MarkdownString(text);
    }   
}



/**
 * 
 * 
 * @param status 
 * @returns 
 */
function getRunStatusIcon(status?: string): vscode.ThemeIcon {
    console.log(status);

    switch (status) {
    // in progress
    case 'pending':
    case 'plan_queued':
    case 'apply_queued':
        return new vscode.ThemeIcon('testing-queued-icon', new vscode.ThemeColor('charts.gray'));
    case 'pending':
    case 'policy_checking':
    case 'const_estimating':
    case 'applying':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.gray'));
    case 'discarded':
    case 'canceled':
        return new vscode.ThemeIcon('testing-cancel-icon', new vscode.ThemeColor('charts.gray'));
    case 'planned':
    case 'policy_override':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
    case 'applied':
    case 'planned_and_finished':
    case 'policy_checked':
        return new vscode.ThemeIcon('testing-passed-icon', new vscode.ThemeColor('charts.green'));
    }

    return new vscode.ThemeIcon('dash');
}

