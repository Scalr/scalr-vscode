import { API as GitApi, GitExtension } from './@types/git';
import { Extension, extensions } from 'vscode';

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
