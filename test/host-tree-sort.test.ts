import { describe, expect, it } from 'vitest';
import { getRecentLocations, sortHosts } from '../src/hostTreeSort';

const HOSTS = ['web-10', 'Bastion', 'web-2', 'db'];

describe('sortHosts', () => {
  it('sorts A to Z, ignoring case and comparing numbers naturally', () => {
    expect(sortHosts(HOSTS, 'alphabetical', () => undefined)).toEqual(['Bastion', 'db', 'web-2', 'web-10']);
  });

  it('sorts Z to A', () => {
    expect(sortHosts(HOSTS, 'alphabeticalDescending', () => undefined)).toEqual(['web-10', 'web-2', 'db', 'Bastion']);
  });

  it('keeps the SSH config order', () => {
    expect(sortHosts(HOSTS, 'configOrder', () => undefined)).toEqual(HOSTS);
  });

  it('sorts by last used, with unused hosts last in A to Z order', () => {
    const lastUsed: Record<string, number> = { 'db': 100, 'web-10': 300 };
    expect(sortHosts(HOSTS, 'lastUsed', h => lastUsed[h])).toEqual(['web-10', 'db', 'Bastion', 'web-2']);
  });

  it('does not modify the input', () => {
    const hosts = [...HOSTS];
    sortHosts(hosts, 'alphabetical', () => undefined);
    expect(hosts).toEqual(HOSTS);
  });
});

describe('getRecentLocations', () => {
  const history = {
    'web': ['/srv/app', '/var/www'],
    'db': ['/home/me/sql'],
  };

  it('returns the most recently opened locations across hosts', () => {
    const times: Record<string, number> = { 'web:/var/www': 200, 'db:/home/me/sql': 300, 'web:/srv/app': 100 };
    const recent = getRecentLocations(history, (h, p) => times[`${h}:${p}`], 2);
    expect(recent.map(r => `${r.hostname}:${r.path}`)).toEqual(['db:/home/me/sql', 'web:/var/www']);
  });

  it('puts locations without a timestamp after timestamped ones, keeping their order', () => {
    const recent = getRecentLocations(history, (h, p) => (p === '/home/me/sql' ? 50 : undefined), 5);
    expect(recent.map(r => `${r.hostname}:${r.path}`)).toEqual(['db:/home/me/sql', 'web:/srv/app', 'web:/var/www']);
  });

  it('returns nothing for a zero count', () => {
    expect(getRecentLocations(history, () => 1, 0)).toEqual([]);
  });
});
