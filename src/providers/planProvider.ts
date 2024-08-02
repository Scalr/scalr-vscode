import * as vscode from 'vscode';


export function getPlanStatusIcon(status?: string): vscode.ThemeIcon {
    switch (status) {
    case 'pending':
    case 'queued':
        return new vscode.ThemeIcon('watch', new vscode.ThemeColor('charts.gray'));
    case 'running':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.gray'));
    case 'finished':
        return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
    case 'errored':
        return new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.red'));
    case 'canceled':
        return new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.gray'));
    default:
        return new vscode.ThemeIcon('dash');
    }
}