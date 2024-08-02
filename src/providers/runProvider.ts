import *  as vscode from 'vscode';
import { Run, Plan, Apply } from '../api/types.gen';
import { getRuns } from '../api/services.gen';
import { ScalrSession, ScalrAuthenticationProvider } from './authenticationProvider';
import { format, parseISO } from 'date-fns';
import { getApplyStatusIcon } from './applyProvider';
import { getPlanStatusIcon } from './planProvider';
import { WorkspaceItem } from './workspaceProvider';


export type RunTreeItem = RunItem  | ApplyItem | PlanItem;



export class RunTreeDataProvider implements vscode.TreeDataProvider<RunTreeItem> {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | RunTreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;
    private workspace: WorkspaceItem | undefined;

    constructor(private ctx: vscode.ExtensionContext) {
        this.ctx.subscriptions.push(
            vscode.commands.registerCommand(
                'run.open',
                (run: RunItem) => {
                    vscode.env.openExternal(run.webLink);
                },
            ),
        );
    }

    refresh(workspace?: WorkspaceItem): void {
        this.workspace = workspace;

        this.didChangeTreeData.fire();
    }

    getTreeItem(element: RunItem): RunTreeItem {
        return element;
    }

    getChildren(element?: RunItem): Thenable<RunTreeItem[]> {
        if (element) {
            return this.getRunDetails(element);
        }

        return this.getRuns();
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
                include: ['plan', 'apply'],
                'filter[workspace]': this.workspace?.workspace.id,
            }
        });

        if (error) {
            vscode.window.showErrorMessage('Failed to fetch runs');
            return [];
        }

        if (data === undefined || data?.data === undefined || data.data.length === 0) {
            return [];
        }

        const plans: Plan[] = [];
        const applies: Apply[] = [];

        data.included?.forEach((item) => {
            if (item.type === 'plans') {
                plans.push(item as Plan);
            } else if (item.type === 'applies') {
                applies.push(item as Apply);
            }
        });

        return data.data.map((run: Run) => {
            return new RunItem(
                session.baseUrl,
                run,
                plans[0],
                applies[0],
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
        public readonly plan?: Plan,
        public readonly apply?: Apply
    ) {
        super(run.id as string, vscode.TreeItemCollapsibleState.None);
        
        const dryLabel = run.attributes?.['is-dry'] ? '(dry)' : '';
        const destroyLabel = run.attributes?.['is-destroy'] ? '(destroy)' : '';
        const message = run.attributes?.['error-message'] || run.attributes?.['message'] || `Queued from ${getSource(run.attributes?.source)} by #TODO user email`;
        const createdAt = format(parseISO(this.run.attributes?.['created-at'] as string), 'MMMM d, yyyy h:mm:ss a');
        
        this.description = `${destroyLabel}${dryLabel} ${message}`;
        this.iconPath = getRunStatusIcon(run.attributes?.status);
        
        
        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**Triggered at** ${createdAt} by ...\n\n`);
        // this.tooltip.appendMarkdown(`**Source** [${run.sourceName}](${run.sourceUrl})\n\n`);
        // this.tooltip.appendMarkdown(`**Run reason** ${run.runReason}\n\n`);
        // this.tooltip.appendMarkdown(`**Trigger** ${run.trigger}\n\n`);
        // this.tooltip.appendMarkdown(`**Source** - ${this.run.attributes?.source} \n\n`);
        // this.tooltip.appendMarkdown(`---\n\n`);
        // this.tooltip.appendMarkdown(`- **Plan** - ${run.planStatus} ${run.planId} - ${formatTime(run.planTime)}\n`);
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
        let label = `Plan ${plan.attributes?.status} `;
        if (plan.attributes?.['has-changes']) {
            const added = plan.attributes?.['resource-additions'] || 0;
            const changed = plan.attributes?.['resource-changes'] || 0;
            const destroyed = plan.attributes?.['resource-destructions'] || 0;

            if (added > 0) {
                label += `+${added} to add `;
            }

            if (changed > 0) {
                label += `±${changed} to change `;
            }

            if (destroyed > 0) {
                label += `-${destroyed} to destroy `;
            }

        }
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = getPlanStatusIcon(plan.attributes?.status);
        this.contextValue = 'planItem';
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
