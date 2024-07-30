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



        const { data, error } = await getWorkspaces({ query: { include: ['environment', 'latest-run'] } });
        
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
        this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));

        const text = `
    ## Workspace: ${workspace.attributes.name}

    ### Environment: ${environment.attributes.name}


    `;

        this.tooltip = new vscode.MarkdownString(text);
    }
    
}

