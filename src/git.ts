import { API as GitApi, GitExtension } from './@types/git';
import { Extension, extensions } from 'vscode';

async function getGitApi(): Promise<GitApi | undefined> {
    try {
        const extension = extensions.getExtension(
            'vscode.git',
        ) as Extension<GitExtension>;
        if (extension !== undefined) {
            const gitExtension = extension.isActive
                ? extension.exports
                : await extension.activate();

            return gitExtension.getAPI(1);
        }
    } catch {
        console.error('Failed to get Git API');
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

    return repositories.map((repo) => {
        console.log('repo', repo);
        const rootUri = repo.state.remotes[0].name;
        if (rootUri === undefined) {
            return '';
        }

        return rootUri;
    });
}
