import * as vscode from 'vscode';
import { Plan } from '../api/types.gen';



export function getPlanLabel(plan: Plan): string {
    let label = `Plan ${plan.attributes?.status} `;
    if (plan.attributes?.['has-changes']) {
        const added = plan.attributes?.['resource-additions'] || 0;
        const changed = plan.attributes?.['resource-changes'] || 0;
        const destroyed = plan.attributes?.['resource-destructions'] || 0;

        if (added > 0) {
            label += `+${added} to add `;
        }

        if (changed > 0) {
            label += `±${changed} to change `;
        }

        if (destroyed > 0) {
            label += `-${destroyed} to destroy `;
        }

    }

    return label;
}


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