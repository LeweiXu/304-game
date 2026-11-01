// Game settings, saved in this browser. The rule options go to the engine
// (they apply from the next game dealt); `assist` is display only.
import { useCallback, useState } from 'react';
import type { RuleOptions } from '@engine';

export interface Settings extends RuleOptions {
  /** Show points per trick and running team totals. */
  assist: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  shuffle: 'random',
  assist: false,
  caps: true,
  claimBalance: false,
  claimThreshold: false,
};

const KEY = '304-settings-v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const rulesOf = (s: Settings): RuleOptions => ({
  shuffle: s.shuffle, caps: s.caps, claimBalance: s.claimBalance, claimThreshold: s.claimThreshold,
});

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not saved, still applies */ }
      return next;
    });
  }, []);
  return { settings, update };
}
