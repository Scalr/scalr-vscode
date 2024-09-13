import * as vscode from 'vscode';
import { getPlanLog, getApply, getApplyLog, getPlan } from '../api/services.gen';
import { ScalrAuthenticationProvider } from '../providers/authenticationProvider';
import { showErrorMessage } from '../api/error';

export class LogProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    onDidChange = this._onDidChange.event;
    private interval: { [key: string]: NodeJS.Timeout } = {};
    private finalStatuses = ['canceled', 'errored', 'finished', 'unreachable'];

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
            createIfNone: false,
        });
        const content = await this.getLogContent(uri);
        const status = await this.getStatus(uri);
        if (status && !this.finalStatuses.includes(status)) {
            this.startStreaming(uri);
        }
        return content;
    }

    startStreaming(uri: vscode.Uri) {
        const uriString = uri.toString();
        if (uriString in this.interval) {
            return;
        }

        this.interval[uriString] = setInterval(async () => {
            const status = await this.getStatus(uri);
            if (status === undefined || this.finalStatuses.includes(status)) {
                this._onDidChange.fire(uri);
                this.stopStreaming(uri);
                return;
            }
            this._onDidChange.fire(uri);
        }, 3000);
    }

    stopStreaming(uri: vscode.Uri) {
        const uriString = uri.toString();

        if (uriString in this.interval) {
            clearInterval(this.interval[uriString]);
            delete this.interval[uriString];
        }
    }

    private getIdAndType(uri: vscode.Uri) {
        const type = uri.authority;
        const id = uri.path.replace('/', '').split('.')[0];
        return { type, id };
    }

    private async getStatus(uri: vscode.Uri): Promise<string | undefined> {
        const { type, id } = this.getIdAndType(uri);
        let data;
        let error;

        if (type === 'plans') {
            ({ data, error } = await getPlan({ path: { plan: id } }));
        } else {
            ({ data, error } = await getApply({ path: { apply: id } }));
        }

        if (error || !data || !data.data) {
            showErrorMessage(error, 'Failed to fetch status');
            return;
        }

        return data.data.attributes?.status;
    }

    private async getLogContent(uri: vscode.Uri): Promise<string> {
        const { type, id } = this.getIdAndType(uri);
        let data;
        let error;

        const maxRetries = 5;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (type === 'plans') {
                ({ data, error } = await getPlanLog({
                    path: { plan: id },
                    query: { clean: true },
                }));
            } else {
                ({ data, error } = await getApplyLog({
                    path: { apply: id },
                    query: { clean: true },
                }));
            }

            if (error) {
                return `Failed to fetch log: ${error}`;
            }

            if (data && data instanceof Blob) {
                return await data.text();
            }

            // Wait before retrying
            const retryDelay = 500 * (attempt + 1);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

        return 'Failed to fetch log: data is empty after multiple attempts';
    }

    dispose() {
        for (const uri in this.interval) {
            this.stopStreaming(vscode.Uri.parse(uri));
        }
    }
}
