import * as vscode from 'vscode';
import * as path from 'path';
import SSHConfiguration, { getSSHConfigPath } from './ssh/sshConfig';
import { RemoteLocationHistory } from './remoteLocationHistory';
import { Disposable } from './common/disposable';
import { addNewHost, openRemoteSSHLocationWindow, openRemoteSSHWindow, openSSHConfigFile } from './commands';
import SSHDestination from './ssh/sshDestination';
import { getRecentLocations, HOST_SORT_ORDERS, HostSortOrder, sortHosts } from './hostTreeSort';

const VIEW_CONFIG_SECTION = 'remote.SSH.hostsView';

class HostItem {
    constructor(
        public hostname: string,
        public locations: string[]
    ) {
    }
}

class HostLocationItem {
    constructor(
        public path: string,
        public hostname: string,
        public isRecent = false
    ) {
    }
}

class RecentGroupItem {
    constructor(
        public locations: HostLocationItem[]
    ) {
    }
}

type DataTreeItem = RecentGroupItem | HostItem | HostLocationItem;

export class HostTreeDataProvider extends Disposable implements vscode.TreeDataProvider<DataTreeItem> {

    private readonly _onDidChangeTreeData = this._register(new vscode.EventEmitter<DataTreeItem | DataTreeItem[] | void>());
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private locationHistory: RemoteLocationHistory
    ) {
        super();

        this._register(vscode.commands.registerCommand('openremotessh.explorer.add', () => addNewHost()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.configure', () => openSSHConfigFile()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.refresh', () => this.refresh()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.sortBy', () => this.pickSortOrder()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.emptyWindowInNewWindow', e => this.openRemoteSSHWindow(e, false)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.emptyWindowInCurrentWindow', e => this.openRemoteSSHWindow(e, true)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.reopenFolderInNewWindow', e => this.openRemoteSSHLocationWindow(e, false)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.reopenFolderInCurrentWindow', e => this.openRemoteSSHLocationWindow(e, true)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.deleteFolderHistoryItem', e => this.deleteHostLocation(e)));

        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('remote.SSH.configFile') || e.affectsConfiguration(VIEW_CONFIG_SECTION)) {
                this.refresh();
            }
        }));
        this._register(vscode.workspace.onDidSaveTextDocument(e => {
            if (e.uri.fsPath === getSSHConfigPath()) {
                this.refresh();
            }
        }));
    }

    getTreeItem(element: DataTreeItem): vscode.TreeItem {
        if (element instanceof RecentGroupItem) {
            const treeItem = new vscode.TreeItem('Recent', vscode.TreeItemCollapsibleState.Expanded);
            treeItem.id = 'openremotessh.explorer.recent';
            treeItem.iconPath = new vscode.ThemeIcon('history');
            treeItem.contextValue = 'openremotessh.explorer.recent';
            return treeItem;
        }

        if (element instanceof HostLocationItem) {
            const label = path.posix.basename(element.path).replace(/\.code-workspace$/, ' (Workspace)');
            const treeItem = new vscode.TreeItem(label);
            const dirname = path.posix.dirname(element.path);
            treeItem.description = element.isRecent ? `${element.hostname} \u203a ${dirname}` : dirname;
            treeItem.tooltip = `${element.hostname}: ${element.path}`;
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'openremotessh.explorer.folder';
            return treeItem;
        }

        const treeItem = new vscode.TreeItem(element.hostname);
        treeItem.collapsibleState = element.locations.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        treeItem.iconPath = new vscode.ThemeIcon('vm');
        treeItem.contextValue = 'openremotessh.explorer.host';
        return treeItem;
    }

    async getChildren(element?: DataTreeItem): Promise<DataTreeItem[]> {
        if (!element) {
            const config = vscode.workspace.getConfiguration(VIEW_CONFIG_SECTION);
            const sortOrder = config.get<HostSortOrder>('sortOrder', 'alphabetical');
            const showRecent = config.get<boolean>('recentFolders.enabled', true);
            const recentCount = config.get<number>('recentFolders.count', 5);

            const sshConfigFile = await SSHConfiguration.loadFromFS();
            const hosts = sortHosts(sshConfigFile.getAllConfiguredHosts(), sortOrder, host => this.locationHistory.getHostLastUsed(host));
            const items: DataTreeItem[] = hosts.map(hostname => new HostItem(hostname, this.locationHistory.getHistory(hostname)));

            if (showRecent) {
                const recent = getRecentLocations(this.locationHistory.getAllHistory(), (host, p) => this.locationHistory.getLocationLastOpened(host, p), recentCount);
                if (recent.length) {
                    items.unshift(new RecentGroupItem(recent.map(r => new HostLocationItem(r.path, r.hostname, true))));
                }
            }

            return items;
        }
        if (element instanceof RecentGroupItem) {
            return element.locations;
        }
        if (element instanceof HostItem) {
            return element.locations.map(location => new HostLocationItem(location, element.hostname));
        }
        return [];
    }

    private refresh() {
        this._onDidChangeTreeData.fire();
    }

    private async pickSortOrder() {
        const config = vscode.workspace.getConfiguration(VIEW_CONFIG_SECTION);
        const current = config.get<HostSortOrder>('sortOrder', 'alphabetical');
        const items = HOST_SORT_ORDERS.map(o => ({
            label: o.label,
            value: o.value,
            description: o.value === current ? 'current' : undefined,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: 'Sort SSH Targets',
            placeHolder: 'Choose how to sort the hosts',
        });
        if (picked && picked.value !== current) {
            await config.update('sortOrder', picked.value, vscode.ConfigurationTarget.Global);
        }
    }

    private async deleteHostLocation(element: HostLocationItem) {
        await this.locationHistory.removeLocation(element.hostname, element.path);
        this.refresh();
    }

    private async openRemoteSSHWindow(element: HostItem, reuseWindow: boolean) {
        const sshDest = new SSHDestination(element.hostname);
        openRemoteSSHWindow(sshDest.toEncodedString(), reuseWindow);
    }

    private async openRemoteSSHLocationWindow(element: HostLocationItem, reuseWindow: boolean) {
        const sshDest = new SSHDestination(element.hostname);
        openRemoteSSHLocationWindow(sshDest.toEncodedString(), element.path, reuseWindow);
    }
}
