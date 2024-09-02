import * as vscode from 'vscode';
import { Apply } from '../api/types.gen';

export function getApplyLabel(apply: Apply): string {
    let label = `Apply ${apply.attributes?.status} `;

    const added = apply.attributes?.['resource-additions'] || 0;
    const changed = apply.attributes?.['resource-changes'] || 0;
    const destroyed = apply.attributes?.['resource-destructions'] || 0;

    if (added > 0) {
        label += `${added} to add `;
    }

    if (changed > 0) {
        label += `${changed} to change `;
    }

    if (destroyed > 0) {
        label += `${destroyed} to destroy `;
    }

    return label;
}

export function getApplyStatusIcon(status?: string): vscode.ThemeIcon {
    switch (status) {
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
