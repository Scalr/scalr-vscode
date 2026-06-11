import { ErrorDocument } from './types.gen';
import * as vscode from 'vscode';

export function getErrorMessage(error: unknown, response?: Response): string {
    if (typeof error === 'string') {
        return error;
    }

    if (response?.status === 407) {
        return 'Proxy authentication required. Please update your proxy settings.';
    } else if (response?.status === 401) {
        vscode.commands.executeCommand('setContext', 'scalr.signed-in', false);
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'Connection timeout please check your internet connection or proxy settings.';
    }

    // JSON:API error document returned by the fetch-based client
    if (error && typeof error === 'object' && 'errors' in error) {
        const errorDocument = error as ErrorDocument;
        if (Array.isArray(errorDocument.errors) && errorDocument.errors.length > 0) {
            //TODO:ape add the title to the error type in scalr api
            //@ts-expect-error the title is not exposed in the error type but it is in the api
            return errorDocument.errors.map((e) => e.title || e.detail).join('\n');
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown error';
}

export function showErrorMessage(
    error: unknown,
    prefix: string | undefined = undefined,
    response?: Response
): void {
    const message = getErrorMessage(error, response);
    if (prefix) {
        vscode.window.showErrorMessage(prefix + '. ' + message);
        return;
    }

    vscode.window.showErrorMessage(message);
}
