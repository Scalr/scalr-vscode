import * as vscode from 'vscode';
import { ScalrAuthenticationProvider } from './providers/authenticationProvider';

export class ScalrFeature implements vscode.Disposable {
    constructor(
        private ctx: vscode.ExtensionContext,
        output: vscode.OutputChannel
    ) {
        this.ctx.subscriptions.push(
            vscode.commands.registerCommand('scalr.hello', () => {
                output.appendLine('Hello World from Scalr!');
            })
        );
        console.log('Congratulations, your extension "scalr2" is now active!');

        const authProvider = new ScalrAuthenticationProvider(ctx);

        ctx.subscriptions.push(
            vscode.authentication.registerAuthenticationProvider(
                ScalrAuthenticationProvider.id,
                ScalrAuthenticationProvider.providerLabel,
                authProvider,
                { supportsMultipleAccounts: false }
            )
        );
    }

    dispose() {
        //
    }
}
