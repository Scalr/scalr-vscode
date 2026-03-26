import { client } from './client.gen';
import { createQuerySerializer } from './client/utils.gen';
import { showErrorMessage } from './error';
import * as vscode from 'vscode';

export const initClient = (accountName: string, token: string) => {
    client.interceptors.error.use((error) => {
        showErrorMessage(error);
        return error;
    });

    const appVersion = vscode.extensions.getExtension('Scalr.scalr')?.packageJSON.version;

    return client.setConfig({
        baseUrl: `https://${accountName}.scalr.io/api/iacp/v3`,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-type': 'application/vnd.api+json',
            'User-Agent': `scalr-vscode/${appVersion}`,
        },
        // Serialize arrays as comma-separated values (e.g. include=plan,apply)
        querySerializer: createQuerySerializer({
            array: { style: 'form', explode: false },
        }),
        throwOnError: false,
    });
};
