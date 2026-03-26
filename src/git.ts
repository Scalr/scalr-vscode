import { API as GitApi, GitExtension } from './@types/git';
import { Extension, extensions, Uri, workspace as vsWorkspace } from 'vscode';

async function getGitApi(): Promise<GitApi | undefined> {
    try {
        const extension = extensions.getExtension('vscode.git') as Extension<GitExtension>;
        if (extension !== undefined) {
            const gitExtension = extension.isActive ? extension.exports : await extension.activate();

            return gitExtension.getAPI(1);
        }
    } catch {
        console.error('Failed to get Git API');
    }

    return undefined;
}

function parseRepoIdentifier(url: string): string | undefined {
    // HTTPS format: https://github.com/org/repo.git or https://github.com/org/repo
    const httpsMatch = url.match(/https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
        return httpsMatch[1];
    }

    // SSH format: git@github.com:org/repo.git
    const sshMatch = url.match(/git@[^:]+:(.+?)(?:\.git)?$/);
    if (sshMatch) {
        return sshMatch[1];
    }

    return undefined;
}

export interface GitRepoInfo {
    rootUri: Uri;
    identifier: string;
}

/**
 * Returns the git repository root URI and VCS identifier for the repository
 * containing the currently active workspace folder.
 */
export async function getGitRepoInfo(): Promise<GitRepoInfo | undefined> {
    const gitApi = await getGitApi();
    if (!gitApi) return undefined;

    const repositories = gitApi.repositories;
    if (repositories.length === 0) return undefined;

    const activeFolder = vsWorkspace.workspaceFolders?.[0];

    // Prefer the repo that contains the active workspace folder
    let repo = repositories[0];
    if (activeFolder && repositories.length > 1) {
        const match = repositories.find((r) => activeFolder.uri.fsPath.startsWith(r.rootUri.fsPath));
        if (match) repo = match;
    }

    for (const remote of repo.state.remotes) {
        const url = remote.fetchUrl || remote.pushUrl;
        if (url) {
            const identifier = parseRepoIdentifier(url);
            if (identifier) {
                return { rootUri: repo.rootUri, identifier };
            }
        }
    }

    return undefined;
}

export async function getRemoteRepoIdentifiers(): Promise<string[]> {
    const gitApi = await getGitApi();
    if (gitApi === undefined) {
        return [];
    }

    const repositories = gitApi.repositories;
    if (repositories.length === 0) {
        return [];
    }

    const identifiers: string[] = [];
    for (const repo of repositories) {
        for (const remote of repo.state.remotes) {
            const url = remote.fetchUrl || remote.pushUrl;
            if (url) {
                const identifier = parseRepoIdentifier(url);
                if (identifier && !identifiers.includes(identifier)) {
                    identifiers.push(identifier);
                }
            }
        }
    }

    return identifiers;
}
