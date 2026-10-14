import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, SegmentAssessment } from '../types';
import { createSeedState, STATE_VERSION } from '../data/seed';
import { assessAll } from '../engine/evidence';
import { initialize } from '../engine/actions';

export const STORAGE_KEY = 'raksha-path-x/state';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.version === STATE_VERSION) return s;
    }
  } catch { /* fall through to seed */ }
  return initialize(createSeedState());
}

export function saveState(s: AppState): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Storage unavailable';
  }
}

interface Store {
  state: AppState;
  assessments: Map<string, SegmentAssessment>;
  /** Apply a pure action: update(s => action(s, ...)). */
  update: (fn: (s: AppState) => AppState) => void;
  reset: () => void;
  replace: (s: AppState) => void;
  storageError: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [storageError, setStorageError] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStorageError(saveState(state)), 150);
  }, [state]);
  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);
  const reset = useCallback(() => setState(initialize(createSeedState())), []);
  const replace = useCallback((s: AppState) => setState(s), []);
  const assessments = useMemo(() => assessAll(state), [state.segments, state.evidence, state.config, state.now]);
  const value = useMemo(() => ({ state, assessments, update, reset, replace, storageError }), [state, assessments, update, reset, replace, storageError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

/** Hash router: #/page?key=value */
export function useRoute(): [string, URLSearchParams, (page: string, params?: Record<string, string>) => void] {
  const parse = () => {
    const h = window.location.hash.replace(/^#\/?/, '');
    const [p, q] = h.split('?');
    return [p || 'dashboard', new URLSearchParams(q ?? '')] as const;
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((page: string, params?: Record<string, string>) => {
    const q = params ? new URLSearchParams(params).toString() : '';
    window.location.hash = `/${page}${q ? `?${q}` : ''}`;
  }, []);
  return [r[0], r[1], go];
}
