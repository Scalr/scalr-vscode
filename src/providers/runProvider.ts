import *  as vscode from 'vscode';
import { Run, Plan, Apply, User } from '../api/types.gen';
import { getRuns } from '../api/services.gen';
import { ScalrSession, ScalrAuthenticationProvider } from './authenticationProvider';
import { getApplyStatusIcon } from './applyProvider';
import { getPlanStatusIcon, getPlanLabel } from './planProvider';
import { WorkspaceItem } from './workspaceProvider';
import { formatDate } from '../date-utils';
import { Pagination } from '../@types/api';


export type RunTreeItem = RunItem  | ApplyItem | PlanItem | LoadMoreItem;



export class RunTreeDataProvider implements vscode.TreeDataProvider<RunTreeItem> {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | RunTreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;
    private workspace: WorkspaceItem | undefined;
    
    private runItems: (RunItem | LoadMoreItem)[] = [];
    private nextPage: null | number = null;

    constructor(private ctx: vscode.ExtensionContext) {
        this.ctx.subscriptions.push(
            vscode.commands.registerCommand(
                'run.open',
                (run: RunItem) => {
                    vscode.env.openExternal(run.webLink);
                },
            ),
            vscode.commands.registerCommand(
                'plan.open',
                async (plan: PlanItem) => {
                    const doc = await vscode.workspace.openTextDocument(plan.logUri);
                    return await vscode.window.showTextDocument(doc);
                },
            ),
            vscode.commands.registerCommand(
                'apply.open',
                async (apply: ApplyItem) => {
                    const doc = await vscode.workspace.openTextDocument(apply.logUri);
                    return await vscode.window.showTextDocument(doc);
                },
            ),
            vscode.commands.registerCommand(
                'runs.loadMore',
                () => {
                    this.refresh();
                },
            ),

        );
    }

    refresh(workspace?: WorkspaceItem): void {
        this.workspace = workspace;
        if (workspace !== undefined) {
            this.reset();
        }

        this.didChangeTreeData.fire();
    }

    reset(): void {
        this.runItems = [];
        this.nextPage = null;
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
        this.runItems = [...this.runItems, ...(await this.getRuns())];

        const runs = this.runItems.slice(0);
        if (this.nextPage !== null) {
            runs.push(new LoadMoreItem());
        }

        return runs;
    }

    dispose() {
        //
    }

    private async getRuns(): Promise<RunItem[]> {
        const session = await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
            createIfNone: false,
        }) as ScalrSession;
      
        if (session === undefined) {
            return [];
        }

        const { data, error } = await getRuns({
            query: {
                include: ['plan', 'apply', 'created-by', 'created-by-run'],
                'filter[workspace]': this.workspace?.workspace.id,
                page: {
                    number: this.nextPage || 1
                },
            }
        });

        if (error) {
            vscode.window.showErrorMessage('Failed to fetch runs');
            return [];
        }

        if (data === undefined || data?.data === undefined || data.data.length === 0) {
            return [];
        }

        const pagination = data.meta?.pagination as Pagination;
        this.nextPage = pagination['next-page'];
        const plans: Map<string, Plan> = new Map();
        const applies: Map<string, Apply> = new Map();
        const createdBy: Map<string, User> = new Map();

        data.included?.forEach((item) => {
            if (item.type === 'plans') {
                plans.set(item.id as string, item as Plan);
            } else if (item.type === 'applies') {
                applies.set(item.id as string, item as Apply);
            } else if (item.type === 'users') {
                createdBy.set(item.id as string, item as User);
            }
        });

        return data.data.map((run: Run) => {
            return new RunItem(
                session.baseUrl,
                run,
                run.relationships?.['created-by']?.data ? createdBy.get(run.relationships['created-by'].data.id) : undefined,
                run.relationships?.plan?.data ? plans.get(run.relationships.plan.data.id) : undefined,
                run.relationships?.apply?.data ? applies.get(run.relationships.apply.data.id) : undefined,
            );
        });
    }

    private async getRunDetails(run: RunItem): Promise<(ApplyItem | PlanItem)[]> {
        let details = [];

        if (run.plan) {
            details.push(new PlanItem(run.plan));
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
        public readonly apply?: Apply
    ) {
        super(run.id as string, vscode.TreeItemCollapsibleState.None);
        
        const dryLabel = run.attributes?.['is-dry'] ? '(dry)' : '';
        const destroyLabel = run.attributes?.['is-destroy'] ? '(destroy)' : '';
        const source = getSource(run.attributes?.source);
        let reason = run.attributes?.['error-message'] || run.attributes?.['message'] || `Queued from ${source} `;
        const createdByLabel = this.createdBy?.attributes?.email || run.relationships?.['created-by-run'] || 'unknown';
        if (createdByLabel !== 'unknown') {
            reason += `by ${createdByLabel}`;
        }

        const createdAt = formatDate(run.attributes?.['created-at'] as string);
        
        this.description = `${destroyLabel}${dryLabel} ${reason}`;
        this.iconPath = getRunStatusIcon(run.attributes?.status);
        
        
        this.tooltip = new vscode.MarkdownString(undefined, true);
        this.tooltip.appendMarkdown(`**Run reason** ${reason}\n\n`);
        this.tooltip.appendMarkdown('---\n\n');
        this.tooltip.appendMarkdown(`**Run ID** ${run.id}\n\n`);
        this.tooltip.appendMarkdown(`**Status** $(${this.iconPath.id}) ${run?.attributes?.status} \n\n`);
        this.tooltip.appendMarkdown(`**Triggered at** ${createdAt} by ...\n\n`);
        this.tooltip.appendMarkdown(`**Source** ${source}\n\n`);
        if (plan) {
            this.tooltip.appendMarkdown(`**Plan** ${getPlanLabel(plan)} - TODO add plan time\n`);

        }


        
        // this.tooltip.appendMarkdown(`  - Cost estimate: ${run.costEstimateStatus ? 'Enabled' : 'Admin disabled cost estimation in the environment'}\n`);
        // this.tooltip.appendMarkdown(`  - Policy check: ${run.policyCheckStatus ? 'Enforced' : 'Admin did not enforce policies in the environment'}\n`);
        // this.tooltip.appendMarkdown(`- **Apply approval** - ${run.applyApprovalStatus} - ${formatTime(run.applyApprovalTime)}\n`);
        // this.tooltip.appendMarkdown(`  - Approved automatically based on the workspace settings\n`);
        // this.tooltip.appendMarkdown(`- **Apply** - ${run.applyStatus} ${run.applyId} - ${formatTime(run.applyTime)}\n\n`);
        // this.tooltip.appendMarkdown(`---\n\n`);
        // this.tooltip.appendMarkdown(`**Total duration** - ${formatDuration(run.totalDuration)}\n`);

        this.tooltip.isTrusted = true;
        
        const envId = this.run.relationships?.environment?.data?.id;
        const wsId = this.run.relationships?.workspace?.data?.id;

        this.webLink = vscode.Uri.parse(`${this.host}/e/${envId}/workspaces/${wsId}/runs/${run.id}/`, true);
        this.contextValue = 'runItem';

        if (plan || apply) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        
    }
}

class PlanItem extends vscode.TreeItem {
    constructor(
        public readonly plan: Plan
    ) {
        super(getPlanLabel(plan), vscode.TreeItemCollapsibleState.None);
        this.iconPath = getPlanStatusIcon(plan.attributes?.status);
        this.contextValue = 'planItem';
    }

    public get logUri(): vscode.Uri {
        return vscode.Uri.parse(`scalr-logs://plans/${this.plan.id}`);
    }
}

class ApplyItem extends vscode.TreeItem {
    constructor(
        public readonly apply: Apply
    ) {
        super(`Apply ${apply.attributes?.status}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = getApplyStatusIcon(apply.attributes?.status);
        this.contextValue = 'applyItem';
    }

    public get logUri(): vscode.Uri {
        return vscode.Uri.parse(`scalr-logs://applies/${this.apply.id}`);
    }
}

class LoadMoreItem extends vscode.TreeItem {
    constructor() {
        super('Load more...', vscode.TreeItemCollapsibleState.None);
  
        this.iconPath = new vscode.ThemeIcon('more', new vscode.ThemeColor('charts.gray'));
        this.command = {
            command: 'runs.loadMore',
            title: 'Load more',
        };
    }
}

/**
 * 
 * 
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
    case 'policy_override':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
    case 'applied':
    case 'planned_and_finished':
    case 'policy_checked':
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
    default:
        return source ?? 'unknown';
    }
}
