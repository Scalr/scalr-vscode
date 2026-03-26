import * as vscode from 'vscode';

/**
 * Provides a "▶ Scalr: Dry Run" CodeLens at the top of every .tf / .tofu file
 * so users can trigger a speculative plan without leaving the editor.
 */
export class DryRunCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const topOfFile = new vscode.Range(0, 0, 0, 0);
        const lens = new vscode.CodeLens(topOfFile, {
            title: '$(play) Scalr: Dry Run',
            command: 'run.createDryFromWorkingDirectory',
            tooltip: 'Queue a speculative plan in Scalr using your local working directory',
        });
        return [lens];
    }
}
