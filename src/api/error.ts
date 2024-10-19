import { ErrorDocument } from './types.gen';
import * as vscode from 'vscode';
import * as anxios from 'axios';
import { AxiosError } from 'axios';

export function getErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object' && error !== null && 'errors' in error) {
        const errorDocument = error as ErrorDocument;
        if (errorDocument.errors) {
            //TODO:ape add the titile to the error type in scalr api
            //@ts-expect-error the title is not exposed in the error type but it is in the api
            return errorDocument.errors.map((e) => e.title || e.detail).join('\n');
        }
    }

    if (anxios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNABORTED') {
            return 'Connection timeout ple check your internet connection or proxy settings.';
        } else if (axiosError.status === 407) {
            return 'Proxy authentication required. Please check your proxy settings.';
        }

        return axiosError.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown error';
}

export function showErrorMessage(error: unknown, prefix: string | undefined = undefined): void {
    if (prefix) {
        vscode.window.showErrorMessage(prefix + '. ' + getErrorMessage(error));
        return;
    }

    vscode.window.showErrorMessage(getErrorMessage(error));
}
