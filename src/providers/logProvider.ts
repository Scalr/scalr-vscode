import * as vscode from 'vscode';
import {  getPlanLog, getApplyLog } from '../api/services.gen';
import { ScalrAuthenticationProvider } from '../providers/authenticationProvider';


export class LogProvider implements vscode.TextDocumentContentProvider {
    onDidChange?: vscode.Event<vscode.Uri> | undefined;
    
    
    // eslint-disable-next-line no-unused-vars
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
            createIfNone: false,
        });


        return this.getLogContent(uri);
        
    } 


    private async getLogContent(uri: vscode.Uri): Promise<string> {
        const type = uri.authority;
        const id = uri.path.replace('/', '').split('.')[0];
        let data;
        let error;

        if (type === 'plans') {
            ({data, error } = await getPlanLog(
                { path: { plan: id }, query: { clean: true } }
            ));    
        } else {
            ({ data, error } = await getApplyLog(
                { path: { apply: id }, query: { clean: true } }
            ));
            
        }

        if (error || !data) {
            return `Failed to fetch log: ${error}`;
        }

        return await (data as Blob).text();
    }
};