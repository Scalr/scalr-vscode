import * as vscode from 'vscode';
import { Run, Plan, Apply, User, Workspace, Environment } from '../api/types.gen';
import { getRuns, getRun, getPlan, createRun, confirmRun, discardRun, cancelRun } from '../api/sdk.gen';
import { ScalrSession, ScalrAuthenticationProvider } from './authenticationProvider';
import { getApplyStatusIcon, getApplyLabel } from './applyProvider';
import { getPlanStatusIcon, getPlanLabel } from './planProvider';
import { WorkspaceItem } from './workspaceProvider';
import { formatDate } from '../date-utils';
import { Pagination } from '../@types/api';
import { showErrorMessage } from '../api/error';

export type RunTreeItem = RunItem | ApplyItem | PlanItem | LoadMoreItem;

enum RunTypes {
    plan = 'Plan-only',
    apply = 'Plan & Apply',
    refresh = 'Refresh-only',
    destroy = 'Destroy',
}

export class RunTreeDataProvider implements vscode.TreeDataProvider<RunTreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | RunTreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;
    private workspace: WorkspaceItem | undefined;
    private filteredWorkspaceIds: string[] | undefined;

    private runItems: (RunItem | LoadMoreItem)[] = [];
    private nextPage: null | number = null;
    private autoRefreshTimer: ReturnType<typeof setInterval> | undefined;

    constructor(private ctx: vscode.ExtensionContext) {
        this.autoRefreshTimer = setInterval(() => this.softRefresh(), 5000);
        this.ctx.subscriptions.push(
            vscode.commands.registerCommand('run.open', (run: RunItem) => {
                vscode.env.openExternal(run.webLink);
            }),
            vscode.commands.registerCommand('plan.open', async (plan: PlanItem) => {
                return await this.openTextDocument(plan.logUri);
            }),
            vscode.commands.registerCommand('apply.open', async (apply: ApplyItem) => {
                const doc = await vscode.workspace.openTextDocument(apply.logUri);
                return await vscode.window.showTextDocument(doc);
            }),
            vscode.commands.registerCommand('run.loadMore', () => {
                this.refresh(this.workspace);
            }),
            vscode.commands.registerCommand('run.refresh', () => {
                this.softRefresh();
            }),
            vscode.commands.registerCommand('run.create', async (ws: WorkspaceItem) => {
                return await this.createRun(ws);
            }),
            vscode.commands.registerCommand('run.approve', async (item: PlanItem) => {
                if (!item?.runId) { return; }
                await confirmRun({ path: { run: item.runId } });
                this.softRefresh();
                // Poll until the apply ID is available, then open its log
                this.openApplyLogWhenReady(item.runId);
            }),
            vscode.commands.registerCommand('run.discard', async (item: PlanItem) => {
                if (!item?.runId) { return; }
                await discardRun({ path: { run: item.runId } });
                this.softRefresh();
            }),
            vscode.commands.registerCommand('run.cancel', async (item: RunItem) => {
                if (!item?.run?.id) { return; }
                await cancelRun({ path: { run: item.run.id as string } });
                this.softRefresh();
            }),
            vscode.commands.registerCommand('plan.openOnClick', async (plan: PlanItem) => {
                return await this.openTextDocument(plan.logUri);
            }),
            vscode.commands.registerCommand('apply.openOnClick', async (apply: ApplyItem) => {
                const doc = await vscode.workspace.openTextDocument(apply.logUri);
                return await vscode.window.showTextDocument(doc);
            })
        );
    }

    refresh(workspace?: WorkspaceItem, filteredWorkspaceIds?: string[]): void {
        this.workspace = workspace;
        this.filteredWorkspaceIds = filteredWorkspaceIds;
        this.didChangeTreeData.fire();
    }

    private async createRun(ws: WorkspaceItem) {
        const runType = await vscode.window.showQuickPick(
            [
                {
                    label: '$(run-all)',
                    description: RunTypes.apply,
                },
                {
                    label: '$(run)',
                    description: RunTypes.plan,
                },
                {
                    label: '$(refresh)',
                    description: RunTypes.refresh,
                },
                {
                    label: '$(close)',
                    description: RunTypes.destroy,
                },
            ],
            {
                placeHolder: 'Queue new run',
            }
        );

        if (runType) {
            const { data } = await createRun<false>({
                body: {
                    data: {
                        type: 'runs',
                        attributes: {
                            'is-destroy': runType.description === RunTypes.destroy,
                            'is-dry': runType.description === RunTypes.plan,
                            'refresh-only': runType.description === RunTypes.refresh,
                            message: 'Triggered from VScode',
                            source: 'vscode',
                        },
                        relationships: {
                            workspace: {
                                data: {
                                    type: 'workspaces',
                                    id: ws.workspace.id as string,
                                },
                            },
                        },
                    },
                },
            });

            if (!data || !data.data) {
                return;
            }

            const planId = data.data.relationships?.plan?.data?.id as string;
            if (!planId) {
                showErrorMessage('Failed to retrieve the plan identifier');
                return;
            }

            const { data: planData } = await getPlan({
                path: {
                    plan: planId,
                },
            });

            if (!planData || !planData.data) {
                showErrorMessage('Failed to retrieve the plan');
                return;
            }

            this.reset();
            this.refresh(ws);
            vscode.window.showInformationMessage(
                `The run has been queued in workspace '${ws.workspace.attributes.name}'`
            );
            const logUri = new PlanItem(planData.data).logUri;
            return await this.openTextDocument(logUri);
        }
    }

    private async openTextDocument(uri: vscode.Uri): Promise<vscode.TextEditor> {
        const doc = await vscode.workspace.openTextDocument(uri);
        return await vscode.window.showTextDocument(doc);
    }

    private async openApplyLogWhenReady(runId: string): Promise<void> {
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const { data } = await getRun({ path: { run: runId } });
            const applyId = data?.data?.relationships?.apply?.data?.id;
            if (applyId) {
                const logUri = vscode.Uri.parse(`scalr-logs://applies/${applyId}.log`);
                this.openTextDocument(logUri);
                return;
            }
        }
    }

    /** Full reset — clears filter state. Used when switching workspaces. */
    reset(): void {
        this.runItems = [];
        this.nextPage = null;
        this.filteredWorkspaceIds = undefined;
    }

    /** Soft reset — clears items/pagination but keeps the current workspace/filter. */
    softRefresh(): void {
        this.runItems = [];
        this.nextPage = null;
        this.didChangeTreeData.fire();
    }

    dispose(): void {
        if (this.autoRefreshTimer !== undefined) {
            clearInterval(this.autoRefreshTimer);
        }
    }

    getTreeItem(element: RunItem): RunTreeItem {
        return element;
    }

    getChildren(element?: RunItem): Thenable<RunTreeItem[]> {
        if (element) {
            return this.getRunDetails(element);
        }

        return this.buildRuns();
    }

    private async buildRuns(): Promise<(RunTreeItem | vscode.TreeItem)[]> {
        if (this.runItems.length === 0 || this.nextPage) {
            this.runItems = [...this.runItems, ...(await this.getRuns())];
        }

        const runs = this.runItems.slice(0);
        if (this.nextPage !== null) {
            runs.push(new LoadMoreItem());
        }

        return runs;
    }

    private async getRuns(): Promise<RunItem[]> {
        const session = (await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
            createIfNone: false,
        })) as ScalrSession;

        if (session === undefined) {
            return [];
        }

        // Determine workspace filter based on selected workspace or visible workspaces
        let workspaceFilter: string | undefined;
        
        if (this.workspace?.workspace.id) {
            // If a specific workspace is selected, filter by that workspace
            workspaceFilter = this.workspace.workspace.id;
        } else if (this.filteredWorkspaceIds !== undefined) {
            if (this.filteredWorkspaceIds.length > 0) {
                // Show runs from all currently visible/filtered workspaces
                workspaceFilter = 'in:' + this.filteredWorkspaceIds.join(',');
            } else {
                // Empty array means no workspaces match the filter (e.g., environment with no workspaces)
                // Return empty array immediately to avoid API call
                return [];
            }
        }
        // If no filters are applied, workspaceFilter remains undefined and shows all runs

        const { data } = await getRuns({
            query: {
                include: ['plan', 'policy-checks', 'cost-estimate', 'apply', 'created-by', 'created-by-run', 'workspace', 'environment'],
                'filter[workspace]': workspaceFilter,
                'page[number]': String(this.nextPage || 1),
            },
        });

        if (!data) {
            return [];
        }

        if (data === undefined || data?.data === undefined || data.data.length === 0) {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pagination = (data as any).meta?.pagination as Pagination;
        this.nextPage = pagination['next-page'];
        const plans: Map<string, Plan> = new Map();
        const applies: Map<string, Apply> = new Map();
        const createdBy: Map<string, User> = new Map();
        const workspaces: Map<string, Workspace> = new Map();
        const environments: Map<string, Environment> = new Map();

        const included = (data.included ?? []) as (Plan | Apply | User | Workspace | Environment)[];

        included.forEach((item) => {
            if ((item as Plan).type === 'plans') {
                const plan = item as Plan;
                if (plan.attributes?.status !== 'unreachable' && plan.attributes?.status !== 'pending') {
                    plans.set(item.id as string, plan);
                }
            } else if ((item as Apply).type === 'applies') {
                const apply = item as Apply;
                if (apply.attributes?.status !== 'unreachable' && apply.attributes?.status !== 'pending') {
                    applies.set(item.id as string, apply);
                }
            } else if ((item as User).type === 'users') {
                createdBy.set(item.id as string, item as User);
            } else if ((item as Workspace).type === 'workspaces') {
                workspaces.set(item.id as string, item as Workspace);
            } else if ((item as Environment).type === 'environments') {
                environments.set(item.id as string, item as Environment);
            }
        });

        return data.data.map((run: Run) => {
            const workspace = run.relationships?.workspace?.data 
                ? workspaces.get(run.relationships.workspace.data.id) 
                : undefined;
            const environment = run.relationships?.environment?.data 
                ? environments.get(run.relationships.environment.data.id) 
                : undefined;
                
            return new RunItem(
                session.baseUrl,
                run,
                run.relationships?.['created-by']?.data
                    ? createdBy.get(run.relationships['created-by'].data.id)
                    : undefined,
                run.relationships?.plan?.data ? plans.get(run.relationships.plan.data.id) : undefined,
                run.relationships?.apply?.data ? applies.get(run.relationships.apply.data.id) : undefined,
                workspace,
                environment
            );
        });
    }

    private async getRunDetails(run: RunItem): Promise<(ApplyItem | PlanItem)[]> {
        const details = [];

        if (run.plan) {
            details.push(new PlanItem(run.plan, run.run));
        }

        if (run.apply) {
            details.push(new ApplyItem(run.apply));
        }

        return details;
    }
}

class RunItem extends vscode.TreeItem {
    public readonly webLink: vscode.Uri;

    constructor(
        public readonly host: string,
        public readonly run: Run,
        public readonly createdBy?: User,
        public readonly plan?: Plan,
        public readonly apply?: Apply,
        public readonly workspace?: Workspace,
        public readonly environment?: Environment
    ) {
        // Create a descriptive label with workspace context
        const workspaceName = workspace?.attributes?.name || 'Unknown Workspace';
        const runLabel = `${run.id} - ${workspaceName}`;
        
        super(runLabel, vscode.TreeItemCollapsibleState.None);
        
        const environmentName = environment?.attributes?.name || 'Unknown Environment';

        const dryLabel = run.attributes?.['is-dry'] ? '(dry)' : '';
        const destroyLabel = run.attributes?.['is-destroy'] ? '(destroy)' : '';
        const source = getSource(run.attributes?.source);
        let reason = run.attributes?.['error-message'] || run.attributes?.['message'] || `Queued from ${source} `;
        const createdByLabel = this.createdBy?.attributes?.email || run.relationships?.['created-by-run'] || 'unknown';
        if (createdByLabel !== 'unknown') {
            reason += ` by ${createdByLabel}`;
        }

        const createdAt = formatDate(run.attributes?.['created-at'] as string);

        // Include environment in description for additional context
        this.description = `(${environmentName}) ${destroyLabel}${dryLabel} ${reason}`;
        this.iconPath = getRunStatusIcon(run.attributes?.status);

        this.tooltip = new vscode.MarkdownString(undefined, true);
        this.tooltip.appendMarkdown(`**Workspace**: ${workspaceName}\n\n`);
        this.tooltip.appendMarkdown(`**Environment**: ${environmentName}\n\n`);
        this.tooltip.appendMarkdown('---\n\n');
        this.tooltip.appendMarkdown(`**Reason**: ${reason}\n\n`);
        this.tooltip.appendMarkdown('---\n\n');
        this.tooltip.appendMarkdown(`**Run ID** ${run.id}\n\n`);
        this.tooltip.appendMarkdown(`**Status** $(${this.iconPath.id}) ${run?.attributes?.status} \n\n`);
        this.tooltip.appendMarkdown(`**Triggered at** ${createdAt}\n\n`);
        this.tooltip.appendMarkdown(`**Source** ${source}\n\n`);

        if (plan) {
            this.tooltip.appendMarkdown(`**Plan** ${getPlanLabel(plan)}\n\n`);
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        if (apply) {
            this.tooltip.appendMarkdown(`**Apply** ${getApplyLabel(apply)}\n\n`);
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        //TODO: ape add the cost estimate and policy checks

        this.tooltip.isTrusted = true;

        const envId = this.run.relationships?.environment?.data?.id;
        const wsId = this.run.relationships?.workspace?.data?.id;

        this.webLink = vscode.Uri.parse(`${this.host}/e/${envId}/workspaces/${wsId}/runs/${run.id}/`, true);
        const cancellableStatuses = ['planning', 'plan_queued', 'apply_queued', 'applying', 'policy_checking', 'cost_estimating'];
        this.contextValue = cancellableStatuses.includes(run.attributes?.status ?? '')
            ? 'runItem/cancellable'
            : 'runItem';
    }
}

export class PlanItem extends vscode.TreeItem {
    public readonly runId?: string;

    constructor(public readonly plan: Plan, run?: Run) {
        super(getPlanLabel(plan), vscode.TreeItemCollapsibleState.None);
        this.iconPath = getPlanStatusIcon(plan.attributes?.status);
        this.runId = run?.id as string | undefined;

        const status = run?.attributes?.status ?? '';
        const approvable = ['planned', 'policy_checked', 'policy_override'].includes(status);
        const discardable = ['pending', 'planned', 'policy_checked', 'policy_override'].includes(status);
        const flags = ['planItem'];
        if (approvable) { flags.push('approvable'); }
        if (discardable) { flags.push('discardable'); }
        this.contextValue = flags.join(' ');

        this.command = {
            command: 'plan.openOnClick',
            title: 'View Plan Log',
            arguments: [this],
        };
    }

    public get logUri(): vscode.Uri {
        return vscode.Uri.parse(`scalr-logs://plans/${this.plan.id}.log`);
    }
}

class ApplyItem extends vscode.TreeItem {
    constructor(public readonly apply: Apply) {
        super(`Apply ${apply.attributes?.status}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = getApplyStatusIcon(apply.attributes?.status);
        this.contextValue = 'applyItem';
        this.command = {
            command: 'apply.openOnClick',
            title: 'View Apply Log',
            arguments: [this],
        };
    }

    public get logUri(): vscode.Uri {
        return vscode.Uri.parse(`scalr-logs://applies/${this.apply.id}.log`);
    }
}

class LoadMoreItem extends vscode.TreeItem {
    constructor() {
        super('Show more...', vscode.TreeItemCollapsibleState.None);

        this.iconPath = new vscode.ThemeIcon('more', new vscode.ThemeColor('charts.gray'));
        this.command = {
            command: 'run.loadMore',
            title: 'Show more',
        };
    }
}

/**
 * @param status
 * @returns
 */
export function getRunStatusIcon(status?: string): vscode.ThemeIcon {
    switch (status) {
        // in progress
        case 'pending':
        case 'plan_queued':
        case 'apply_queued':
            return new vscode.ThemeIcon('watch', new vscode.ThemeColor('charts.gray'));
        case 'planning':
        case 'policy_checking':
        case 'const_estimating':
        case 'applying':
            return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.gray'));
        case 'discarded':
        case 'canceled':
            return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.gray'));
        case 'planned':
        case 'policy_checked':
        case 'policy_override':
            return new vscode.ThemeIcon('bell-dot', new vscode.ThemeColor('charts.orange'));
        case 'applied':
        case 'planned_and_finished':
            return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
        case 'errored':
            return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    }

    return new vscode.ThemeIcon('dash');
}

export function getSource(source?: string): string {
    switch (source) {
        // in progress
        case 'ui':
        case 'restart':
        case 'assistant':
        case 'service-catalog':
        case 'dashboard-run':
        case 'dashboard-workspace':
        case 'workspaces-environment':
        case 'workspaces-environment-bulk':
        case 'workspaces-account-bulk':
        case 'workspaces-account':
        case 'eports-iac-versions':
        case 'reports-stale-workspaces':
            return 'UI';
        case 'cli':
            return 'CLI';
        case 'scalr-cli':
            return 'Scalr-CLI';
        case 'vcs':
            return 'VCS';
        case 'api':
        case 'configuration-version':
            return 'API';
        case 'vscode':
            return 'VSCode';
        default:
            return source ?? 'unknown';
    }
}
