import * as vscode from 'vscode';
import { getWorkspaces, listEnvironments, getConfigurationVersion, createRun, getPlan } from '../api/sdk.gen';
import { Workspace, WorkspaceListingDocument, EnvironmentListingDocument, Environment } from '../api/types.gen';
import { ScalrAuthenticationProvider, ScalrSession } from './authenticationProvider';
import { PlanItem } from './runProvider';
import { Pagination } from '../@types/api';
import { showErrorMessage } from '../api/error';
import { getGitRepoInfo } from '../git';

const out = vscode.window.createOutputChannel('Scalr', { log: true });

const DRY_RUN_WORKSPACE_CACHE_KEY = 'localDryRun.workspaceCache';

// ---------------------------------------------------------------------------
// Workspace fetching helpers
// ---------------------------------------------------------------------------

async function fetchWorkspacesByVcs(identifier: string, relativeWorkingDir: string): Promise<Workspace[]> {
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

        out.info(`  page ${pageNumber}: API returned ${workspaces.length} workspace(s) for identifier="${identifier}"`);

        for (const ws of workspaces) {
            const wsWorkingDir = (ws.attributes?.['working-directory'] || '').replace(/^\/+|\/+$/g, '');
            const localDir = relativeWorkingDir.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');

            out.info(`  candidate: id=${ws.id} name=${ws.attributes?.name} working-directory=${JSON.stringify(ws.attributes?.['working-directory'])} vcs-repo.identifier=${ws.attributes?.['vcs-repo']?.identifier} → wsWorkingDir=${JSON.stringify(wsWorkingDir)} localDir=${JSON.stringify(localDir)} match=${wsWorkingDir === localDir}`);

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

async function fetchWorkspacesByFilter(extraQuery: Record<string, string>): Promise<Workspace[]> {
    const all: Workspace[] = [];
    let pageNumber = 1;

    while (true) {
        const { data } = await getWorkspaces<false>({
            query: { 'page[number]': String(pageNumber), 'page[size]': '100', ...extraQuery },
        });

        if (!data) break;

        const wsDoc = data as WorkspaceListingDocument;
        const workspaces = wsDoc.data || [];
        all.push(...workspaces);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pagination = (wsDoc as any).meta?.pagination as Pagination | undefined;
        if (!pagination?.['next-page']) break;
        pageNumber++;
    }

    return all;
}

// ---------------------------------------------------------------------------
// "Other workspace" selection flow
// ---------------------------------------------------------------------------

type OtherFilter = 'environment' | 'query';

async function selectWorkspaceFromOther(): Promise<Workspace | undefined> {
    const filterPick = await vscode.window.showQuickPick(
        [
            { label: '$(symbol-namespace) By environment', filter: 'environment' as OtherFilter },
            { label: '$(search) By workspace name or ID', filter: 'query' as OtherFilter },
        ],
        { title: 'Select Scalr Workspace — Other', placeHolder: 'How do you want to find the workspace?' }
    );

    if (!filterPick) return undefined;

    let workspaces: Workspace[] = [];

    if (filterPick.filter === 'environment') {
        // Fetch environments for the picker
        const { data: envData } = await listEnvironments<false>({
            query: { fields: { environments: 'name' }, 'page[size]': '100' },
        });

        const environments = ((envData as EnvironmentListingDocument | undefined)?.data ?? []) as Environment[];

        if (environments.length === 0) {
            vscode.window.showWarningMessage('No environments found.');
            return undefined;
        }

        const envPick = await vscode.window.showQuickPick(
            environments.map((e) => ({ label: e.attributes?.name ?? e.id ?? '', id: e.id as string })),
            { title: 'Select Environment', placeHolder: 'Choose an environment to list workspaces' }
        );

        if (!envPick) return undefined;

        workspaces = await fetchWorkspacesByFilter({ 'filter[environment]': envPick.id });
    } else {
        const query = await vscode.window.showInputBox({
            title: 'Select Scalr Workspace — Other',
            placeHolder: 'workspace-name or ws-xxxx',
            prompt: 'Filter workspaces by name or ID',
        });

        if (!query) return undefined;

        workspaces = await fetchWorkspacesByFilter({ query });
    }

    if (workspaces.length === 0) {
        vscode.window.showWarningMessage('No workspaces found for the selected filter.');
        return undefined;
    }

    const wsPick = await vscode.window.showQuickPick(
        workspaces.map((ws) => ({
            label: ws.attributes?.name ?? (ws.id as string),
            description: ws.id as string,
            workspace: ws,
        })),
        { title: 'Select Scalr Workspace', placeHolder: 'Choose a workspace for the dry run' }
    );

    return wsPick?.workspace;
}

// ---------------------------------------------------------------------------
// Upload polling
// ---------------------------------------------------------------------------

async function pollForUpload(cvId: string): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data, error, response } = await getConfigurationVersion({ path: { configuration_version: cvId } });
        const status = data?.data?.attributes?.status;
        const errorMessage = data?.data?.attributes?.['error-message'];
        out.info(`  poll ${i + 1}/30: HTTP ${response?.status} status=${JSON.stringify(status)}${errorMessage ? ` error-message=${JSON.stringify(errorMessage)}` : ''}`);
        if (error) {
            out.error(`  poll error: ${JSON.stringify(error, null, 2)}`);
        }
        if (status === 'uploaded') return true;
        if (status === 'errored') return false;
    }
    out.warn('pollForUpload: timed out after 30 attempts (~60s)');
    return false;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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

    const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const path = await import(/* webpackIgnore: true */ 'path');
    const gitRootPath = repoInfo.rootUri.fsPath;
    const activeFileDir = activeFilePath ? path.dirname(activeFilePath) : gitRootPath;
    const relativeWorkingDir = path.relative(gitRootPath, activeFileDir);

    out.show(true);
    out.info(`repo identifier: ${repoInfo.identifier}`);
    out.info(`git root: ${gitRootPath}`);
    out.info(`active file: ${activeFilePath}`);
    out.info(`relative working-directory: ${JSON.stringify(relativeWorkingDir)}`);

    // Step 1 — ask the user where to trigger the run
    const repoLabel = relativeWorkingDir
        ? `${repoInfo.identifier} › ${relativeWorkingDir}`
        : repoInfo.identifier;

    const sourcePick = await vscode.window.showQuickPick(
        [
            {
                label: '$(repo) Current repository',
                description: repoLabel,
                source: 'repo' as const,
            },
            {
                label: '$(search) Other workspace...',
                description: 'Filter by environment or workspace name/ID',
                source: 'other' as const,
            },
        ],
        { title: 'Scalr: Dry Run', placeHolder: 'Where do you want to trigger the dry run?' }
    );

    if (!sourcePick) return;

    // Step 2 — resolve the target workspace
    let selectedWorkspace: Workspace | undefined;

    if (sourcePick.source === 'other') {
        selectedWorkspace = await selectWorkspaceFromOther();
        if (!selectedWorkspace) return;
    } else {
        // VCS-matched path (existing logic)
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Scalr', cancellable: false },
            async (progress) => {
                progress.report({ message: 'Matching workspaces...' });
                const matchingWorkspaces = await fetchWorkspacesByVcs(repoInfo.identifier, relativeWorkingDir);
                out.info(`workspaces matched: ${matchingWorkspaces.length}`);
                matchingWorkspaces.forEach((w) =>
                    out.info(`  matched: id=${w.id} name=${w.attributes?.name}`)
                );

                if (matchingWorkspaces.length === 0) {
                    vscode.window.showErrorMessage(
                        `No Scalr workspaces found for repository '${repoInfo.identifier}' with working directory '${relativeWorkingDir || '.'}'.`
                    );
                    return;
                }

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
            }
        );
    }

    if (!selectedWorkspace) return;

    // Step 3 — create CV, upload archive, queue run
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scalr', cancellable: false },
        async (progress) => {
            progress.report({ message: `Creating configuration version for '${selectedWorkspace!.attributes.name}'...` });

            const tfeBaseUrl = `https://${(session as ScalrSession).account.label}.scalr.io/api/tfe/v2`;
            const cvCreateResp = await globalThis.fetch(
                `${tfeBaseUrl}/workspaces/${selectedWorkspace!.id}/configuration-versions`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.accessToken}`,
                        'Content-Type': 'application/vnd.api+json',
                        // Temporary: backend rejects uploads for VCS-sourced CVs unless the
                        // request looks like a CLI-driven run. Remove once backend is fixed.
                        'User-Agent': 'go-tfe',
                    },
                    body: JSON.stringify({
                        data: {
                            type: 'configuration-versions',
                            attributes: { 'auto-queue-runs': false, speculative: true },
                        },
                    }),
                }
            );

            out.info(`createConfigurationVersion (tfe/v2) → HTTP ${cvCreateResp.status}`);
            const cvBody = await cvCreateResp.json();
            out.info(`createConfigurationVersion data: ${JSON.stringify(cvBody, null, 2)}`);

            if (!cvCreateResp.ok) {
                showErrorMessage(cvBody?.errors?.[0], 'Failed to create configuration version.');
                return;
            }

            const cvId: string | undefined = cvBody?.data?.id;
            const uploadUrl: string | undefined = cvBody?.data?.attributes?.['upload-url'];

            if (!cvId || !uploadUrl) {
                out.error(`No upload-url in response. cvId=${cvId} upload-url=${uploadUrl}`);
                vscode.window.showErrorMessage('Failed to obtain configuration version upload URL.');
                return;
            }

            progress.report({ message: 'Archiving working directory...' });

            const os = await import(/* webpackIgnore: true */ 'os');
            const fs = await import(/* webpackIgnore: true */ 'fs');
            const cp = await import(/* webpackIgnore: true */ 'child_process');

            const archivePath = path.join(os.tmpdir(), `scalr-dry-run-${Date.now()}.tar.gz`);

            try {
                await new Promise<void>((resolve, reject) => {
                    cp.exec(`tar czf "${archivePath}" --exclude='.git' --exclude='.terraform' -C "${gitRootPath}" .`, (err) => {
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
                const uploadResponse = await globalThis.fetch(uploadUrl, {
                    method: 'PUT',
                    body: fileData,
                    headers: { 'Content-Type': 'application/octet-stream' },
                });
                out.info(`upload → HTTP ${uploadResponse.status}`);
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

            const uploaded = await pollForUpload(cvId);
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
                            workspace: { data: { type: 'workspaces', id: selectedWorkspace!.id as string } },
                            'configuration-version': {
                                data: { type: 'configuration-versions', id: cvId },
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
                `Dry run queued in workspace '${selectedWorkspace!.attributes.name}'.`
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
