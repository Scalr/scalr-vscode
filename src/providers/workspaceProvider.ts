import * as vscode from 'vscode';
import { Workspace, Environment, Run, WorkspaceListingDocument, EnvironmentListingDocument } from '../api/types.gen';
import { getWorkspaces, listEnvironments } from '../api/services.gen';
import { ScalrAuthenticationProvider, ScalrSession } from './authenticationProvider';
import { getRunStatusIcon, RunTreeDataProvider } from './runProvider';
import { Pagination } from '../@types/api';
import { formatDate } from '../date-utils';

class QuickPickItem implements vscode.QuickPickItem {
    constructor(
        public label: string,
        public id: string
    ) {}
}

export class WorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | vscode.TreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;

    private nextPage: null | number = null;
    private workspaces: vscode.TreeItem[] = [];
    private filters: Map<string, string> = new Map();

    constructor(
        private ctx: vscode.ExtensionContext,
        private runProvider: RunTreeDataProvider
    ) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('workspace.open', (ws: WorkspaceItem) => {
                vscode.env.openExternal(ws.webLink);
            }),
            vscode.commands.registerCommand('workspace.loadMore', () => {
                this.refresh();
            }),
            vscode.commands.registerCommand('workspace.refresh', (ws?: WorkspaceItem | LoadMoreItem) => {
                ws = undefined;
                this.workspaces = [];
                this.reset();
                this.refresh();
                this.runProvider.reset();
                this.runProvider.refresh(ws);
            }),
            vscode.commands.registerCommand('workspace.filter', () => this.chooseFilterOrClear())
        );
    }
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([element]);
        }

        return this.buildChildren();
    }

    private async buildChildren(): Promise<vscode.TreeItem[]> {
        if (this.workspaces.length === 0 || this.nextPage) {
            this.workspaces = [...this.workspaces, ...(await this.getWorkspaces())];
        }

        const workspaces = this.workspaces.slice(0);
        if (this.nextPage !== null) {
            workspaces.push(new LoadMoreItem());
        }

        if (this.filters.size > 0) {
            workspaces.unshift(new FilterInfoItem(this.filters));
        }

        return workspaces;
    }

    reset(): void {
        this.workspaces = [];
        this.nextPage = null;
    }

    refresh(): void {
        this.didChangeTreeData.fire();
    }

    private async getWorkspaces(): Promise<vscode.TreeItem[]> {
        const session = (await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
            createIfNone: false,
        })) as ScalrSession;

        if (session === undefined) {
            return [];
        }

        const queryFilters: { [key: string]: string | undefined } = {};

        for (const [filterKey, filterValue] of this.filters.entries()) {
            const filterName = filterKey !== 'query' ? `filter[${filterKey}]` : filterKey;
            queryFilters[filterName] = filterValue;
        }

        const { data, error } = await getWorkspaces({
            query: {
                include: ['latest-run', 'environment'],
                page: {
                    number: this.nextPage || 1,
                    size: 30,
                },
                // @ts-expect-error TODO:ape this is must be fixed in our product
                sort: ['-updated-at'],
                ...queryFilters,
            },
        });

        if (error || !data) {
            vscode.window.showErrorMessage('Failed to fetch workspaces' + error);
            return [];
        }

        const wsDocument = data as WorkspaceListingDocument;
        const pagination = wsDocument.meta?.pagination as Pagination;
        this.nextPage = pagination['next-page'];
        const environmentMap = new Map<string, Environment>();
        const runsMap = new Map<string, Run>();

        for (const inc of wsDocument.included || []) {
            if ((inc as Environment).type === 'environments') {
                environmentMap.set(inc.id as string, inc as Environment);
            } else if ((inc as Run).type === 'runs') {
                runsMap.set(inc.id as string, inc as Run);
            }
        }

        const workspaces = wsDocument.data || [];

        return workspaces.map((workspace) => {
            const environment = environmentMap.get(workspace.relationships.environment.data.id) as Environment;
            const run = workspace.relationships['latest-run']?.data
                ? runsMap.get(workspace.relationships['latest-run'].data.id)
                : undefined;

            return new WorkspaceItem(session.baseUrl, environment, workspace, run);
        });
    }

    private async chooseFilterOrClear() {
        const filterType = await vscode.window.showQuickPick(['By Environments', 'By Tags', 'Clear Filters'], {
            placeHolder: 'Choose a filter type or clear all filters',
        });

        if (filterType === 'Clear Filters') {
            this.filters.clear();
            this.reset();
            this.refresh();
            return;
        }

        if (!filterType) {
            vscode.window.showInformationMessage('No filter type selected');
            return;
        }

        await this.enterFilterValue(filterType);
    }

    private async enterFilterValue(filterType: string) {
        switch (filterType) {
            case 'By Environments': {
                const environments = await vscode.window.showQuickPick(this.getEnvironmentQuickPick(), {
                    placeHolder: 'Select one or more environment filter by',
                    canPickMany: true,
                });

                if (environments) {
                    this.filters.set('environment', 'in:' + environments.map((env) => env.id).join(','));
                }
                break;
            }
            case 'By Tags': {
                const tag = await vscode.window.showInputBox({
                    placeHolder: 'Enter tag name',
                    prompt: 'Filter by tag name',
                });
                if (tag) {
                    this.filters.set('tags', tag);
                }
                break;
            }
            case 'by Query': {
                const query = await vscode.window.showInputBox({
                    placeHolder: 'Enter query',
                    prompt: 'Filter by query',
                });
                if (query) {
                    this.filters.set('query', query);
                }
                break;
            }
            default:
                throw new Error('Unknown filter type');
        }

        this.reset();
        this.refresh();
    }

    private async getEnvironmentQuickPick(): Promise<QuickPickItem[]> {
        const { data, error } = await listEnvironments({
            query: {
                fields: { environments: 'name' },
                page: {
                    size: 100,
                },
            },
        });

        if (error || !data) {
            vscode.window.showErrorMessage('Failed to fetch environments' + error);
            return [];
        }

        data as EnvironmentListingDocument;
        let environments = data.data as Environment[];
        let pagination = data.meta?.pagination as Pagination;

        while (pagination['next-page']) {
            const { data: nextPageData, error: nextError } = await listEnvironments({
                query: {
                    fields: { environments: 'name' },
                    page: {
                        size: 100,
                        number: pagination['next-page'],
                    },
                },
            });

            if (nextError || !nextPageData) {
                vscode.window.showErrorMessage('Failed to fetch environments' + nextError);
                return [];
            }

            environments = [...environments, ...(nextPageData.data as Environment[])];
            pagination = nextPageData.meta?.pagination as Pagination;
        }

        return environments.map((env) => ({
            label: env.attributes.name,
            id: env.id as string,
        }));
    }

    dispose() {
        //
    }
}

export class WorkspaceItem extends vscode.TreeItem {
    public readonly webLink: vscode.Uri;

    constructor(
        public readonly host: string,
        public readonly environment: Environment,
        public readonly workspace: Workspace,
        public readonly run?: Run
    ) {
        super(workspace.attributes.name, vscode.TreeItemCollapsibleState.None);

        this.description = `(${environment.attributes.name})`;

        this.iconPath = getRunStatusIcon(run?.attributes?.status);

        this.webLink = vscode.Uri.parse(`${this.host}/e/${environment.id}/workspaces/${workspace.id}/`, true);
        this.contextValue = 'workspaceItem';
        let updatedAt = 'No data';

        if (workspace.attributes['updated-at']) {
            updatedAt = formatDate(workspace.attributes['updated-at']);
        }

        this.tooltip = new vscode.MarkdownString(undefined, true);
        this.tooltip.appendMarkdown(
            `## $(${this.iconPath.id}) [${this.workspace.attributes.name}](${this.webLink})\n\n`
        );
        this.tooltip.appendMarkdown(`#### Environment: ${this.environment.attributes.name} \n`);
        this.tooltip.appendMarkdown('___\n\n');
        this.tooltip.appendMarkdown(`#### ID: ${this.workspace.id} \n`);
        this.tooltip.appendMarkdown(`**Run Status**: $(${this.iconPath.id}) ${run?.attributes?.status} \n`);
        this.tooltip.appendMarkdown('___\n\n');
        this.tooltip.appendMarkdown('| | |\n');
        this.tooltip.appendMarkdown('--|--\n');
        this.tooltip.appendMarkdown(`| **Iac Platform**         | ${workspace.attributes['iac-platform']}\n`);
        this.tooltip.appendMarkdown(`| **Terraform Version** | ${workspace.attributes['terraform-version']}|\n`);
        this.tooltip.appendMarkdown(`| **Updated**           | ${updatedAt}|\n`);
    }
}

class LoadMoreItem extends vscode.TreeItem {
    constructor() {
        super('Show more...', vscode.TreeItemCollapsibleState.None);

        this.iconPath = new vscode.ThemeIcon('more', new vscode.ThemeColor('charts.gray'));
        this.command = {
            command: 'workspace.loadMore',
            title: 'Show more',
            tooltip: 'Load more workspaces',
        };
    }
}

class FilterInfoItem extends vscode.TreeItem {
    constructor(private filters: Map<string, string>) {
        super('Applied Filters:', vscode.TreeItemCollapsibleState.None);
        this.description = Array.from(filters.entries())
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        this.iconPath = new vscode.ThemeIcon('filter');
    }
}
