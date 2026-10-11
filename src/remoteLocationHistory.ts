import * as vscode from 'vscode';
import { REMOTE_SSH_AUTHORITY } from './authResolver';
import SSHDestination from './ssh/sshDestination';

export class RemoteLocationHistory {
    private static STORAGE_KEY = 'remoteLocationHistory_v0';
    // Kept apart from the history list so older versions can still read it.
    private static TIMESTAMPS_STORAGE_KEY = 'remoteLocationTimestamps_v0';
    private static HOST_TIMESTAMPS_STORAGE_KEY = 'remoteHostTimestamps_v0';

    private remoteLocationHistory: Record<string, string[]> = {};
    private locationTimestamps: Record<string, Record<string, number>> = {};
    private hostTimestamps: Record<string, number> = {};

    constructor(private context: vscode.ExtensionContext) {
        // context.globalState.update(RemoteLocationHistory.STORAGE_KEY, undefined);
        this.remoteLocationHistory = context.globalState.get(RemoteLocationHistory.STORAGE_KEY) || {};
        this.locationTimestamps = context.globalState.get(RemoteLocationHistory.TIMESTAMPS_STORAGE_KEY) || {};
        this.hostTimestamps = context.globalState.get(RemoteLocationHistory.HOST_TIMESTAMPS_STORAGE_KEY) || {};
    }

    getHistory(host: string): string[] {
        return this.remoteLocationHistory[host] || [];
    }

    getAllHistory(): Record<string, string[]> {
        return this.remoteLocationHistory;
    }

    getLocationLastOpened(host: string, path: string): number | undefined {
        return this.locationTimestamps[host]?.[path];
    }

    getHostLastUsed(host: string): number | undefined {
        const locationTimes = Object.values(this.locationTimestamps[host] || {});
        const times = [this.hostTimestamps[host] ?? 0, ...locationTimes];
        const lastUsed = Math.max(...times);
        return lastUsed > 0 ? lastUsed : undefined;
    }

    async addLocation(host: string, path: string) {
        // Move the location to the front so the list stays most recent first.
        const hostLocations = (this.remoteLocationHistory[host] || []).filter(l => l !== path);
        hostLocations.unshift(path);
        this.remoteLocationHistory[host] = hostLocations;

        this.locationTimestamps[host] = { ...this.locationTimestamps[host], [path]: Date.now() };

        await this.context.globalState.update(RemoteLocationHistory.STORAGE_KEY, this.remoteLocationHistory);
        await this.context.globalState.update(RemoteLocationHistory.TIMESTAMPS_STORAGE_KEY, this.locationTimestamps);
    }

    async markHostUsed(host: string) {
        this.hostTimestamps[host] = Date.now();
        await this.context.globalState.update(RemoteLocationHistory.HOST_TIMESTAMPS_STORAGE_KEY, this.hostTimestamps);
    }

    async removeLocation(host: string, path: string) {
        let hostLocations = this.remoteLocationHistory[host] || [];
        hostLocations = hostLocations.filter(l => l !== path);
        this.remoteLocationHistory[host] = hostLocations;

        if (this.locationTimestamps[host]) {
            delete this.locationTimestamps[host][path];
        }

        await this.context.globalState.update(RemoteLocationHistory.STORAGE_KEY, this.remoteLocationHistory);
        await this.context.globalState.update(RemoteLocationHistory.TIMESTAMPS_STORAGE_KEY, this.locationTimestamps);
    }
}

export function getRemoteWorkspaceLocationData(): [string, string] | undefined {
    let location = vscode.workspace.workspaceFile;
    if (location && location.scheme === 'vscode-remote' && location.authority.startsWith(REMOTE_SSH_AUTHORITY) && location.path.endsWith('.code-workspace')) {
        const [, host] = location.authority.split('+');
        const sshDest = SSHDestination.parseEncoded(host);
        return [sshDest.hostname, location.path];
    }

    location = vscode.workspace.workspaceFolders?.[0].uri;
    if (location && location.scheme === 'vscode-remote' && location.authority.startsWith(REMOTE_SSH_AUTHORITY)) {
        const [, host] = location.authority.split('+');
        const sshDest = SSHDestination.parseEncoded(host);
        return [sshDest.hostname, location.path];
    }

    return undefined;
}
