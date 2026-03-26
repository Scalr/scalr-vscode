import * as vscode from 'vscode';
import { getWorkspaces, createConfigurationVersion, getConfigurationVersion, createRun, getPlan } from '../api/sdk.gen';
import { Workspace, WorkspaceListingDocument, ConfigurationVersionDocument } from '../api/types.gen';
import { ScalrAuthenticationProvider } from './authenticationProvider';
import { PlanItem } from './runProvider';
import { Pagination } from '../@types/api';
import { showErrorMessage } from '../api/error';
import { getGitRepoInfo } from '../git';

const DRY_RUN_WORKSPACE_CACHE_KEY = 'localDryRun.workspaceCache';

async function fetchMatchingWorkspaces(identifier: string, relativeWorkingDir: string): Promise<Workspace[]> {
    const matching: Workspace[] = [];
    let pageNumber = 1;

    while (true) {
        const { data } = await getWorkspaces<false>({
            query: {
                'filter[vcs-repo][identifier]': identifier,
                'page[number]': String(pageNumber),
                'page[size]': '100',
            },
        });

        if (!data) break;

        const wsDoc = data as WorkspaceListingDocument;
        const workspaces = wsDoc.data || [];

        for (const ws of workspaces) {
            const wsWorkingDir = (ws.attributes?.['working-directory'] || '').replace(/^\/+|\/+$/g, '');
            const localDir = relativeWorkingDir.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');

            if (wsWorkingDir === localDir) {
                matching.push(ws);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pagination = (wsDoc as any).meta?.pagination as Pagination | undefined;
        if (!pagination?.['next-page']) break;
        pageNumber++;
    }

    return matching;
}

async function pollForUpload(cvId: string): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data } = await getConfigurationVersion({ path: { configuration_version: cvId } });
        const status = data?.data?.attributes?.status;
        if (status === 'uploaded') return true;
        if (status === 'errored') return false;
    }
    return false;
}

export async function triggerLocalDryRun(ctx: vscode.ExtensionContext): Promise<void> {
    if (vscode.env.uiKind === vscode.UIKind.Web) {
        vscode.window.showWarningMessage('Dry run from working directory requires the desktop version of VS Code.');
        return;
    }

    const session = await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
        createIfNone: false,
    });
    if (!session) {
        vscode.window.showErrorMessage('Please log in to Scalr first.');
        return;
    }

    const repoInfo = await getGitRepoInfo();
    if (!repoInfo) {
        vscode.window.showErrorMessage('No Git repository with a remote found in the current workspace.');
        return;
    }

    const activeFolder = vscode.workspace.workspaceFolders?.[0];
    const path = await import(/* webpackIgnore: true */ 'path');
    const gitRootPath = repoInfo.rootUri.fsPath;
    const relativeWorkingDir = activeFolder ? path.relative(gitRootPath, activeFolder.uri.fsPath) : '';

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scalr', cancellable: false },
        async (progress) => {
            progress.report({ message: 'Matching workspaces...' });

            const matchingWorkspaces = await fetchMatchingWorkspaces(repoInfo.identifier, relativeWorkingDir);

            if (matchingWorkspaces.length === 0) {
                vscode.window.showErrorMessage(
                    `No Scalr workspaces found for repository '${repoInfo.identifier}'` +
                        (relativeWorkingDir ? ` with working directory '${relativeWorkingDir}'` : '') +
                        '.'
                );
                return;
            }

            let selectedWorkspace: Workspace;

            if (matchingWorkspaces.length === 1) {
                selectedWorkspace = matchingWorkspaces[0];
            } else {
                const cacheKey = `${DRY_RUN_WORKSPACE_CACHE_KEY}.${gitRootPath}.${relativeWorkingDir}`;
                const cachedId = ctx.workspaceState.get<string>(cacheKey);

                const picks = matchingWorkspaces.map((ws) => ({
                    label: ws.attributes.name,
                    description: ws.id as string,
                    workspace: ws,
                    picked: ws.id === cachedId,
                }));

                const pick = await vscode.window.showQuickPick(picks, {
                    placeHolder: 'Multiple workspaces match — select one for the dry run',
                    title: 'Select Scalr Workspace',
                });

                if (!pick) return;

                selectedWorkspace = pick.workspace;
                await ctx.workspaceState.update(cacheKey, selectedWorkspace.id);
            }

            progress.report({ message: `Creating configuration version for '${selectedWorkspace.attributes.name}'...` });

            const { data: cvData } = await createConfigurationVersion<false>({
                body: {
                    data: {
                        type: 'configuration-versions',
                        attributes: { 'auto-queue-runs': false, 'is-dry': true },
                        relationships: {
                            workspace: { data: { id: selectedWorkspace.id as string, type: 'workspaces' } },
                        },
                    },
                },
            });

            const cv = (cvData as ConfigurationVersionDocument | undefined)?.data;
            if (!cv?.id || !cv.links?.upload) {
                showErrorMessage(undefined, 'Failed to create configuration version.');
                return;
            }

            progress.report({ message: 'Archiving working directory...' });

            const os = await import(/* webpackIgnore: true */ 'os');
            const fs = await import(/* webpackIgnore: true */ 'fs');
            const cp = await import(/* webpackIgnore: true */ 'child_process');

            const archivePath = path.join(os.tmpdir(), `scalr-dry-run-${Date.now()}.tar.gz`);

            try {
                await new Promise<void>((resolve, reject) => {
                    cp.exec(`tar czf "${archivePath}" -C "${gitRootPath}" .`, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            } catch (err) {
                showErrorMessage(undefined, `Failed to create archive: ${err}`);
                return;
            }

            progress.report({ message: 'Uploading to Scalr...' });

            try {
                const fileData = fs.readFileSync(archivePath);
                const uploadResponse = await globalThis.fetch(cv.links.upload, {
                    method: 'PUT',
                    body: fileData,
                    headers: { 'Content-Type': 'application/octet-stream' },
                });
                if (!uploadResponse.ok) {
                    showErrorMessage(undefined, `Upload failed with status ${uploadResponse.status}.`);
                    return;
                }
            } catch (err) {
                showErrorMessage(undefined, `Failed to upload archive: ${err}`);
                return;
            } finally {
                try {
                    fs.unlinkSync(archivePath);
                } catch {
                    // ignore cleanup errors
                }
            }

            progress.report({ message: 'Waiting for upload to be processed...' });

            const uploaded = await pollForUpload(cv.id);
            if (!uploaded) {
                showErrorMessage(undefined, 'Configuration version upload failed or timed out.');
                return;
            }

            progress.report({ message: 'Triggering plan...' });

            const { data: runData } = await createRun<false>({
                body: {
                    data: {
                        type: 'runs',
                        attributes: {
                            'is-dry': true,
                            message: 'Triggered from VSCode working directory',
                            source: 'vscode',
                        },
                        relationships: {
                            workspace: { data: { type: 'workspaces', id: selectedWorkspace.id as string } },
                            'configuration-version': {
                                data: { type: 'configuration-versions', id: cv.id },
                            },
                        },
                    },
                },
            });

            if (!runData?.data) {
                showErrorMessage(undefined, 'Failed to create run.');
                return;
            }

            vscode.window.showInformationMessage(
                `Dry run queued in workspace '${selectedWorkspace.attributes.name}'.`
            );

            const planId = runData.data.relationships?.plan?.data?.id as string | undefined;
            if (!planId) return;

            const { data: planData } = await getPlan({ path: { plan: planId } });
            if (!planData?.data) return;

            const logUri = new PlanItem(planData.data).logUri;
            const doc = await vscode.workspace.openTextDocument(logUri);
            await vscode.window.showTextDocument(doc);
        }
    );
}
