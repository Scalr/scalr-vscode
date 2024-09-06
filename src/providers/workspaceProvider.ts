import * as vscode from 'vscode';
import { Workspace, Environment, Run, WorkspaceListingDocument, EnvironmentListingDocument } from '../api/types.gen';
import { getWorkspaces, listEnvironments } from '../api/services.gen';
import { ScalrAuthenticationProvider, ScalrSession } from './authenticationProvider';
import { getRunStatusIcon, RunTreeDataProvider } from './runProvider';
import { Pagination } from '../@types/api';
import { formatDate } from '../date-utils';

export class WorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly didChangeTreeData = new vscode.EventEmitter<void | vscode.TreeItem>();
    public readonly onDidChangeTreeData = this.didChangeTreeData.event;

    private nextPage: null | number = null;
    private workspaces: vscode.TreeItem[] = [];
    private filters: Map<WorkspaceFilterApiType, QuickPickItem[] | string>;

    constructor(
        private ctx: vscode.ExtensionContext,
        private runProvider: RunTreeDataProvider
    ) {
        this.filters = this.loadFilters();
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
            vscode.commands.registerCommand('workspace.filter', () => this.chooseFilterOrClear()),
            vscode.commands.registerCommand('workspace.clearFilters', () => {
                this.filters.clear();
                this.applyFilters();
            })
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

    private loadFilters() {
        const savedFilters = this.ctx.workspaceState.get<string>('workspaceFilters');
        return savedFilters ? new Map(JSON.parse(savedFilters)) : new Map();
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
            if (Array.isArray(filterValue)) {
                queryFilters[filterName] = 'in:' + filterValue.map((item) => item.id).join(',');
            } else {
                queryFilters[filterName] = filterValue;
            }
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
        const filterType = await vscode.window.showQuickPick(Object.values(WorkspaceFilter), {
            placeHolder: 'Select one of the filters below',
        });

        if (!filterType) {
            vscode.window.showInformationMessage('No filter type selected');
            return;
        }

        await this.enterFilterValue(filterType);
    }

    private async enterFilterValue(filterType: string) {
        const delay = 300;
        let typingTimer: NodeJS.Timeout | null = null;

        switch (filterType) {
            case WorkspaceFilter.environment: {
                const environmentsQuickPicks = vscode.window.createQuickPick();
                environmentsQuickPicks.items = await this.getEnvironmentQuickPick();
                environmentsQuickPicks.title = 'Select one or more environments';
                environmentsQuickPicks.placeholder = 'Enter a environment name or ID';
                environmentsQuickPicks.canSelectMany = true;
                environmentsQuickPicks.selectedItems = environmentsQuickPicks.items.filter((env) => {
                    // @ts-expect-error we override the type with our custom property
                    return this.filters.get('environment')?.some((selectedEnv) => selectedEnv.id === env.id);
                });

                environmentsQuickPicks.onDidChangeValue((value) => {
                    if (typingTimer) {
                        clearTimeout(typingTimer);
                    }

                    typingTimer = setTimeout(async () => {
                        environmentsQuickPicks.items = await this.getEnvironmentQuickPick(value);
                    }, delay);
                });

                environmentsQuickPicks.onDidAccept(() => {
                    const selectedEnvironments = environmentsQuickPicks.selectedItems as QuickPickItem[];
                    if (selectedEnvironments.length === 0) {
                        this.filters.delete('environment');
                    } else {
                        this.filters.set('environment', selectedEnvironments);
                    }
                    this.applyFilters();
                    environmentsQuickPicks.hide();
                });

                environmentsQuickPicks.show();
                break;
            }
            case WorkspaceFilter.query: {
                const currentQuery = (this.filters.get('query') || '') as string;
                const query = await vscode.window.showInputBox({
                    placeHolder: currentQuery || 'Enter a workspace name or ID',
                    prompt: 'Filtering by workspace name or ID',
                });
                if (query) {
                    this.filters.set('query', query);
                } else {
                    this.filters.delete('query');
                }

                this.applyFilters();
                break;
            }
            default:
                throw new Error('Unknown filter type');
        }
    }

    private applyFilters() {
        this.reset();
        this.refresh();
        this.ctx.workspaceState.update('workspaceFilters', JSON.stringify(Array.from(this.filters.entries())));
    }

    private async getEnvironmentQuickPick(query?: string): Promise<QuickPickItem[]> {
        const { data, error } = await listEnvironments({
            query: {
                fields: { environments: 'name' },
                query: query,
            },
        });

        if (error || !data) {
            vscode.window.showErrorMessage('Unable to get environments: ' + error);
            return [];
        }

        data as EnvironmentListingDocument;
        const environments = data.data as Environment[];
        // const currentEnvironments = this.filters.get('environment') || [];

        return environments.map((env) => ({
            label: env.attributes.name,
            id: env.id as string,
        }));
    }

    dispose() {}
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
            title: 'Next page',
            tooltip: 'Load more workspaces',
        };
    }
}

class FilterInfoItem extends vscode.TreeItem {
    constructor(private filters: Map<WorkspaceFilterApiType, QuickPickItem[] | string>) {
        super('Applied Filters', vscode.TreeItemCollapsibleState.None);
        this.description = 'By ' + Array.from(filters.keys()).join(', ');
        this.tooltip = '';
        for (const [filterKey, filterValue] of filters.entries()) {
            this.tooltip += `${filterKey}:  `;
            if (Array.isArray(filterValue)) {
                this.tooltip += filterValue.map((item) => item.label).join(', ');
            } else {
                this.tooltip += filterValue;
            }
            this.tooltip += '\n';
        }

        this.iconPath = new vscode.ThemeIcon('filter-filled');
        this.contextValue = 'workspaceFilterInfo';
        this.command = {
            command: 'workspace.filter',
            title: 'Change filters',
            tooltip: 'Change applied filters',
        };
    }
}

class QuickPickItem implements vscode.QuickPickItem {
    constructor(
        public label: string,
        public id: string
    ) {}
}

enum WorkspaceFilter {
    //important the key value must be the same as the filter key in the API
    environment = 'By environments',
    query = 'By workspace name of ID',
}

type WorkspaceFilterApiType = keyof typeof WorkspaceFilter;
