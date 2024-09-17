import * as vscode from 'vscode';
import { ScalrAuthenticationProvider } from './providers/authenticationProvider';
import { WorkspaceTreeDataProvider, WorkspaceItem } from './providers/workspaceProvider';
import { RunTreeDataProvider } from './providers/runProvider';
import { LogProvider } from './providers/logProvider';

export class ScalrFeature implements vscode.Disposable {
    constructor(private ctx: vscode.ExtensionContext) {
        const authProvider = new ScalrAuthenticationProvider(ctx);
        const runProvider = new RunTreeDataProvider(ctx);
        const workspaceDataProvider = new WorkspaceTreeDataProvider(ctx, runProvider);
        ctx.subscriptions.push(
            vscode.authentication.registerAuthenticationProvider(
                ScalrAuthenticationProvider.id,
                ScalrAuthenticationProvider.providerLabel,
                authProvider,
                { supportsMultipleAccounts: false }
            )
        );

        vscode.authentication.onDidChangeSessions((e) => {
            if (e.provider.id === ScalrAuthenticationProvider.id) {
                workspaceDataProvider.resetFilters();
                workspaceDataProvider.reset();
                workspaceDataProvider.refresh();
                runProvider.reset();
                runProvider.refresh();
            }
        });

        const logProvider = new LogProvider();
        vscode.workspace.onDidCloseTextDocument((doc) => {
            logProvider.stopStreaming(doc.uri);
        });

        ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('scalr-logs', logProvider));

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

            runProvider.reset();
            runProvider.refresh(selected);
        });

        const runView = vscode.window.createTreeView('runs', {
            canSelectMany: false,
            showCollapseAll: true,
            treeDataProvider: runProvider,
        });
        ctx.subscriptions.push(workspaceView, runView);
    }

    dispose() {
        //
    }
}
