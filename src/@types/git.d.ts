import * as vscode from 'vscode';

export interface API {
    repositories: Repository[];
    onDidOpenRepository: vscode.Event<Repository>;
    onDidCloseRepository: vscode.Event<Repository>;
}

export interface GitExtension {
    getAPI(version: number): API;
}

export interface Repository {
    rootUri: vscode.Uri;
    state: RepositoryState;
    inputBox: InputBox;
}

export interface RepositoryState {
    HEAD: Branch | undefined;
    refs: Ref[];
    remotes: Remote[];
}

export interface Branch {
    name: string;
}

export interface Ref {
    name: string;
}

export interface Remote {
    name: string;
}

export interface InputBox {
    value: string;
}
