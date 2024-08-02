import * as vscode from 'vscode';
import { ScalrAuthenticationProvider } from './providers/authenticationProvider';
import { WorkspaceTreeDataProvider, WorkspaceItem } from './providers/workspaceProvider';
import { RunTreeDataProvider } from './providers/runProvider';

export class ScalrFeature implements vscode.Disposable {
    constructor(
    private ctx: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    ) {
        this.ctx.subscriptions.push(
            vscode.commands.registerCommand('scalr.hello', () => {
                output.appendLine('Hello World from Scalr!');
            }),
        );
        const authProvider = new ScalrAuthenticationProvider(ctx);
        ctx.subscriptions.push(
            vscode.authentication.registerAuthenticationProvider(
                ScalrAuthenticationProvider.id,
                ScalrAuthenticationProvider.providerLabel,
                authProvider,
                { supportsMultipleAccounts: false },
            ),
        );

        const runProvider = new RunTreeDataProvider(ctx);

        const workspaceDataProvider = new WorkspaceTreeDataProvider(ctx, runProvider);
        const workspaceView = vscode.window.createTreeView('workspaces', {
            canSelectMany: false,
            showCollapseAll: true,
            treeDataProvider: workspaceDataProvider,
        });
        workspaceView.onDidChangeSelection((event) => { 
            if (event.selection.length <= 0) {
                return;
            }

            const selected = event.selection[0];
            if (!(selected instanceof WorkspaceItem)) {
                return;
            }

            runProvider.refresh(selected);
        });


        const runView = vscode.window.createTreeView('runs', {
            canSelectMany: false,
            showCollapseAll: true,
            treeDataProvider: runProvider,
        });
        ctx.subscriptions.push(
            workspaceView, runView,
        );

        
    }

    dispose() {
    //
    }
}
