export type HostSortOrder = 'alphabetical' | 'alphabeticalDescending' | 'configOrder' | 'lastUsed';

export const HOST_SORT_ORDERS: { value: HostSortOrder; label: string }[] = [
    { value: 'alphabetical', label: 'Name (A to Z)' },
    { value: 'alphabeticalDescending', label: 'Name (Z to A)' },
    { value: 'configOrder', label: 'SSH Config Order' },
    { value: 'lastUsed', label: 'Last Used' },
];

export interface RecentLocation {
    hostname: string;
    path: string;
    lastOpened: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Sorts the hosts as listed in the SSH config. `lastUsed` puts the hosts never
 * used (or used before timestamps were recorded) last, in A to Z order.
 */
export function sortHosts(hosts: string[], order: HostSortOrder, getLastUsed: (host: string) => number | undefined): string[] {
    switch (order) {
        case 'configOrder':
            return [...hosts];
        case 'alphabeticalDescending':
            return [...hosts].sort((a, b) => collator.compare(b, a));
        case 'lastUsed':
            return [...hosts].sort((a, b) => ((getLastUsed(b) ?? 0) - (getLastUsed(a) ?? 0)) || collator.compare(a, b));
        case 'alphabetical':
        default:
            return [...hosts].sort((a, b) => collator.compare(a, b));
    }
}

/**
 * Picks the most recently opened locations across all hosts. Locations without
 * a timestamp keep their per-host order and come after the timestamped ones.
 */
export function getRecentLocations(history: Record<string, string[]>, getLastOpened: (host: string, path: string) => number | undefined, count: number): RecentLocation[] {
    const locations: RecentLocation[] = [];
    for (const [hostname, paths] of Object.entries(history)) {
        for (const path of paths) {
            locations.push({ hostname, path, lastOpened: getLastOpened(hostname, path) ?? 0 });
        }
    }

    return locations
        .sort((a, b) => b.lastOpened - a.lastOpened)
        .slice(0, Math.max(0, count));
}
