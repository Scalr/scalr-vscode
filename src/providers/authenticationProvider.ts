import * as vscode from 'vscode';
import { initClient } from '../api/init';
import { getErrorMessage } from '../api/error';
import { getAccounts } from '../api/services.gen';
import { AccountListingDocument, Account, User } from '../api/types.gen';

/* import { getRemoteRepoIdentifiers } from '../git'; TODO: uncomment when we'll be implementing Git-based filters */

export class ScalrSession implements vscode.AuthenticationSession {
    readonly id: string = ScalrAuthenticationProvider.id;

    readonly scopes: string[] = [];
    public readonly baseUrl: string;

    constructor(
        public readonly accessToken: string,
        public readonly username: string,
        public readonly email: string,
        public account: vscode.AuthenticationSessionAccountInformation
    ) {
        this.baseUrl = `https://${this.account.label}.scalr.io/v2`;
    }
}

export class ScalrAuthenticationProvider implements vscode.AuthenticationProvider {
    public static readonly id: string = 'scalr';
    public static readonly providerLabel: string = 'scalr';

    private readonly sessionKey = 'scalr-session';
    private logger: vscode.LogOutputChannel;

    private _onDidChangeSessions =
        new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

    constructor(private readonly ctx: vscode.ExtensionContext) {
        this.logger = vscode.window.createOutputChannel('Scalr Auth', {
            log: true,
        });

        this.ctx.subscriptions.push(
            vscode.commands.registerCommand('scalr.login', async () => {
                const session = (await vscode.authentication.getSession(ScalrAuthenticationProvider.id, [], {
                    createIfNone: true,
                })) as ScalrSession;
                vscode.window.showInformationMessage(`Logged in the account ${session.account.label}`);
            })
        );
    }

    get onDidChangeSessions(): vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> {
        return this._onDidChangeSessions.event;
    }

    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    async getSessions(scopes: string[]): Promise<vscode.AuthenticationSession[]> {
        const session = await this.getSession();

        if (!session) {
            return [];
        }

        initClient(session.account.label, session.accessToken);
        await vscode.commands.executeCommand('setContext', 'scalr.signed-in', true);

        return [session];
    }

    private async getSession(): Promise<ScalrSession | undefined> {
        const session = await this.ctx.secrets.get(this.sessionKey);
        if (!session) {
            return undefined;
        }

        try {
            return JSON.parse(session) as ScalrSession;
        } catch (e) {
            this.logger.error('Error parsing session', e);
            return undefined;
        }
    }

    async createSession(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _scopes: string[]
    ): Promise<vscode.AuthenticationSession> {
        try {
            const session = await this.storeSession(await this.initSession());

            this._onDidChangeSessions.fire({
                added: [session],
                removed: [],
                changed: [],
            });

            await vscode.commands.executeCommand('setContext', 'scalr.signed-in', true);

            return session;
        } catch (error) {
            await vscode.window.showErrorMessage('Failed to log in: ' + error);
            throw error;
        }
    }

    private async initSession(): Promise<ScalrSession> {
        const accountName = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            prompt: 'Enter the account name',
            placeHolder: 'Your account name in Scalr for example: example.scalr.io the account name is "example".',
        });

        if (!accountName) {
            throw new Error('Hostname is required');
        }

        const token = await this.promptForToken(accountName);

        if (!token) {
            throw new Error('Token is required');
        }

        initClient(accountName, token);

        const { data, error } = await getAccounts({
            query: {
                filter: {
                    name: accountName,
                },
                fields: {
                    accounts: 'name',
                },
                include: ['owner'],
            },
        });

        if (error || !data) {
            throw new Error(getErrorMessage(error));
        }

        const accounts = data as AccountListingDocument;

        if (!accounts.data || accounts.data.length === 0) {
            throw new Error('No accounts found with the provided name ' + accountName);
        }

        const account = accounts.data[0] as Account;
        let email = 'unknown';
        let fullName = 'unknown';

        if (accounts.included && accounts.included.length !== 0) {
            const owner = accounts.included[0] as User;
            email = owner.attributes.email;
            fullName = owner.attributes['full-name'] as string;
        }

        return new ScalrSession(token, fullName, email, {
            id: account.id as string,
            label: account.attributes.name,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async removeSession(_sessionId: string): Promise<void> {
        const session = await this.getSession();
        if (!session) {
            return;
        }

        await this.ctx.secrets.delete(this.sessionKey);
        await vscode.commands.executeCommand('setContext', 'scalr.signed-in', false);

        // Notify VSCode's UI
        this._onDidChangeSessions.fire({
            added: [],
            removed: [session],
            changed: [],
        });
    }

    private async storeSession(session: ScalrSession): Promise<ScalrSession> {
        await this.ctx.secrets.store(this.sessionKey, JSON.stringify(session));

        return session;
    }

    private async promptForToken(accountName: string): Promise<string | undefined> {
        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: 'Existing token',
                    detail: 'Paste an existing token from the clipboard',
                },
                {
                    label: 'Generate a token',
                    detail: 'Open a browser to generate a new user token',
                },
            ],
            {
                canPickMany: false,
                ignoreFocusOut: true,
                placeHolder: 'Choose a method to authenticate with Scalr',
                title: 'Scalr Authentication',
            }
        );

        if (choice === undefined) {
            return undefined;
        }

        const scalrURL = `https://${accountName}.scalr.io/app/settings/tokens?source=vscode-scalr`;
        let token: string | undefined;
        switch (choice.label) {
            case 'Generate a token':
                await vscode.env.openExternal(vscode.Uri.parse(scalrURL));
                // Prompt for the UAT.
                token = await vscode.window.showInputBox({
                    ignoreFocusOut: true,
                    placeHolder: 'User access token',
                    prompt: 'Enter user access token',
                    password: true,
                });
                break;
            case 'Existing token':
                // Prompt for the UAT.
                token = await vscode.window.showInputBox({
                    ignoreFocusOut: true,
                    placeHolder: 'User access token',
                    prompt: 'Enter user access token',
                    password: true,
                });
                break;
            default:
                break;
        }

        return token;
    }
}
