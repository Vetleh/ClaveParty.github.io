import { describe, it, expect } from 'vitest';
import {
  normalizeHostname,
  normalizeMac,
  hostnameMatches,
  matchDevices,
  mergePresence,
} from '../src/presence.js';

const ROSTER = [
  { id: 'karine', name: 'Karine', slackId: 'U_KAR', match: { hostnames: ['Karine-sin-MBP*'] } },
  { id: 'vetle', name: 'Vetle', match: { hostnames: ['Vetles-MacBook*'] } },
  { id: 'printer', name: 'Printer', match: { hostnames: [], macs: ['50:57:9C:49:76:E7'] } },
];

describe('normalizeHostname', () => {
  it('lowercases and strips local suffixes and trailing dot', () => {
    expect(normalizeHostname('Karine-sin-MBP.localdomain')).toBe('karine-sin-mbp');
    expect(normalizeHostname('Mac.local.')).toBe('mac');
    expect(normalizeHostname('')).toBe('');
    expect(normalizeHostname(undefined)).toBe('');
  });
});

describe('normalizeMac', () => {
  it('canonicalizes to lowercase colon form, zero-pads implicitly via hex length', () => {
    expect(normalizeMac('50:57:9C:49:76:E7')).toBe('50:57:9c:49:76:e7');
    expect(normalizeMac('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff');
  });
  it('rejects malformed MACs', () => {
    expect(normalizeMac('incomplete')).toBe('');
    expect(normalizeMac('')).toBe('');
    expect(normalizeMac('00:11:22')).toBe('');
  });
});

describe('hostnameMatches', () => {
  it('matches exact and wildcard patterns, case-insensitively', () => {
    expect(hostnameMatches('Karine-sin-MBP*', 'karine-sin-mbp')).toBe(true);
    expect(hostnameMatches('Karine-sin-MBP*', 'karine-sin-mbp-2')).toBe(true);
    expect(hostnameMatches('PERHEL-*', 'perhel-office')).toBe(true);
    expect(hostnameMatches('mac', 'mac')).toBe(true);
    expect(hostnameMatches('mac', 'macbook')).toBe(false);
    expect(hostnameMatches('Karine-sin-MBP*', '')).toBe(false);
  });
});

describe('matchDevices', () => {
  it('maps devices to people by stable hostname despite a randomized MAC', () => {
    const devices = [
      { ip: '10.0.0.209', mac: 'c0:c7:db:0c:05:88', hostname: 'Karine-sin-MBP.localdomain' },
      // same person, different (rotated) MAC + suffixed hostname -> still Karine
      { ip: '10.0.0.210', mac: '2a:d5:13:21:18:71', hostname: 'Karine-sin-MBP-2.local' },
      { ip: '10.0.0.197', mac: 'aa:bb:cc:dd:ee:01', hostname: 'Vetles-MacBook.local' },
    ];
    const { present } = matchDevices(devices, ROSTER);
    const ids = present.map((p) => p.id).sort();
    expect(ids).toEqual(['karine', 'vetle']);
    const karine = present.find((p) => p.id === 'karine');
    expect(karine.devices).toHaveLength(2); // both of Karine's devices collapsed under her
    expect(karine.sources).toEqual(['network']);
    expect(karine.slackId).toBe('U_KAR');
  });

  it('matches non-randomizing gear by MAC', () => {
    const { present } = matchDevices(
      [{ ip: '10.0.0.14', mac: '50:57:9C:49:76:E7', hostname: 'EPSON4976E7.localdomain' }],
      ROSTER
    );
    expect(present.map((p) => p.id)).toEqual(['printer']);
  });

  it('reports identifiable devices nobody claims, and ignores pure noise', () => {
    const { present, unmatched } = matchDevices(
      [
        { ip: '10.0.0.60', mac: '', hostname: 'Pixel-10-Pro.local' }, // unknown person
        { ip: '10.0.0.99', mac: 'incomplete', hostname: '' }, // no identity -> dropped
      ],
      ROSTER
    );
    expect(present).toEqual([]);
    expect(unmatched).toEqual([{ ip: '10.0.0.60', mac: '', hostname: 'Pixel-10-Pro.local' }]);
  });
});

describe('mergePresence', () => {
  it('unions network + slack and dedupes a person linked by slackId', () => {
    const network = [
      { id: 'karine', name: 'Karine', avatar: null, slackId: 'U_KAR', sources: ['network'], devices: [] },
      { id: 'vetle', name: 'Vetle', avatar: null, slackId: null, sources: ['network'], devices: [] },
    ];
    const slack = [
      { id: 'U_KAR', name: 'Karine S.', avatar: 'http://img/kar' }, // same human as network karine
      { id: 'U_NEW', name: 'Olav', avatar: 'http://img/olav' }, // slack-only
    ];
    const merged = mergePresence(network, slack);
    const karine = merged.find((p) => p.id === 'karine');
    expect(karine.sources.sort()).toEqual(['network', 'slack']);
    expect(karine.avatar).toBe('http://img/kar'); // slack filled the missing avatar
    expect(merged.map((p) => p.id).sort()).toEqual(['U_NEW', 'karine', 'vetle']);
    // internal slackId is not leaked to the response
    expect(merged.every((p) => !('slackId' in p))).toBe(true);
  });

  it('handles each source being empty', () => {
    expect(mergePresence([], [])).toEqual([]);
    expect(mergePresence([], [{ id: 'U1', name: 'A', avatar: null }])).toEqual([
      { id: 'U1', name: 'A', avatar: null, sources: ['slack'] },
    ]);
  });
});
