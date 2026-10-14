import { useState, type ComponentType } from 'react';
import {
  AlertTriangle, BarChart3, ClipboardCheck, Download, FileText, LayoutDashboard, Map as MapIcon,
  type LucideIcon, Menu, Moon, PlayCircle, Radio, RotateCcw, ScrollText, Settings as SettingsIcon, Siren, Sun, WifiOff,
} from 'lucide-react';
import { useRoute, useStore } from './state/store';
import { advanceClock, can, setOnline, setRole } from './engine/actions';
import { ROLE_LABEL, type UserRole } from './types';
import { Button, ConfirmDialog, cx, fmtClock, fmtTime, Select } from './ui/kit';
import Dashboard from './pages/Dashboard';
import MapPage from './pages/MapPage';
import Incidents from './pages/Incidents';
import Hazards from './pages/Hazards';
import Tasks from './pages/Tasks';
import Sensors from './pages/Sensors';
import Offline from './pages/Offline';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import Implementation from './pages/Implementation';
import Exports from './pages/Exports';
import Demo from './pages/Demo';
import Analytics from './pages/Analytics';

const NAV: { id: string; label: string; icon: LucideIcon; page: ComponentType; group: string }[] = [
  { id: 'dashboard', label: 'Operations', icon: LayoutDashboard, page: Dashboard, group: 'Operate' },
  { id: 'map', label: 'Network & routing', icon: MapIcon, page: MapPage, group: 'Operate' },
  { id: 'incidents', label: 'Incidents', icon: Siren, page: Incidents, group: 'Operate' },
  { id: 'hazards', label: 'Hazard reports', icon: AlertTriangle, page: Hazards, group: 'Operate' },
  { id: 'tasks', label: 'Verification', icon: ClipboardCheck, page: Tasks, group: 'Operate' },
  { id: 'sensors', label: 'Sensors', icon: Radio, page: Sensors, group: 'Data' },
  { id: 'offline', label: 'Offline & sync', icon: WifiOff, page: Offline, group: 'Data' },
  { id: 'audit', label: 'Audit trail', icon: ScrollText, page: Audit, group: 'Data' },
  { id: 'demo', label: 'Live demo', icon: PlayCircle, page: Demo, group: 'Evaluate' },
  { id: 'analytics', label: 'Analytics & tests', icon: BarChart3, page: Analytics, group: 'Evaluate' },
  { id: 'exports', label: 'Exports & reports', icon: Download, page: Exports, group: 'Evaluate' },
  { id: 'plan', label: 'Implementation & cost', icon: FileText, page: Implementation, group: 'Evaluate' },
  { id: 'settings', label: 'Evidence rules & roles', icon: SettingsIcon, page: Settings, group: 'Evaluate' },
];

export default function App() {
  const { state, update, reset, storageError } = useStore();
  const [page, , go] = useRoute();
  const [navOpen, setNavOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark');
  const current = NAV.find((n) => n.id === page) ?? NAV[0];
  const Page = current.page;
  const openTasks = state.tasks.filter((t) => ['Pending', 'Assigned', 'In progress', 'Escalated'].includes(t.status)).length;

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('raksha-path-x/theme', t); } catch { /* ignore */ }
  };

  const online = state.offline.online;
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:p-2 focus:text-white">Skip to content</a>
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
          <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden><path d="M3 21 L10 13 L16 16 L23 5" fill="none" stroke="var(--color-ink)" strokeWidth="2" /><circle cx="10" cy="13" r="2.6" fill="var(--color-bg)" stroke="var(--color-ok)" strokeWidth="2" /><circle cx="23" cy="5" r="2.6" fill="var(--color-accent)" /></svg>
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold tracking-tight">Raksha-Path X</div>
            <div className="text-[11px] text-faint">Proof-of-passability</div>
          </div>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-3">
          {['Operate', 'Data', 'Evaluate'].map((g) => (
            <div key={g} className="mb-4">
              <div className="px-2.5 pb-1 text-[11.5px] text-faint">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = current.id === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => { go(n.id); setNavOpen(false); }}
                    aria-current={active ? 'page' : undefined}
                    className={cx('relative flex h-8 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-[13px] transition-colors', active ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink')}
                  >
                    {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent" />}
                    <n.icon size={15} strokeWidth={1.75} className={active ? 'text-ink' : 'text-faint'} />
                    <span className="flex-1 truncate text-left">{n.label}</span>
                    {n.id === 'tasks' && openTasks > 0 && <span className="num text-[11.5px] text-muted">{openTasks}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11.5px] leading-snug text-faint">
          Fictional test area, Sector R-7. All data is simulated. Decision support only; trained responders make operational decisions.
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-surface px-3 py-1.5 lg:px-5">
          <button className="flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-surface-2 lg:hidden" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={18} /></button>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="hidden text-[12.5px] text-faint sm:inline">{current.group}</span>
            <span aria-hidden className="hidden text-faint sm:inline">/</span>
            <span className="truncate text-[14px] font-semibold tracking-tight">{current.label}</span>
          </div>
          <span className="hidden text-[12px] text-faint xl:inline">Simulated data</span>
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center overflow-hidden rounded-[4px] border border-line-strong" role="group" aria-label="Simulated clock">
              <span className="px-2 font-mono text-[12.5px]" title={fmtTime(state.now)}>{fmtClock(state.now)}</span>
              <button className="h-7 border-l border-line-strong px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-ink" onClick={() => update((s) => advanceClock(s, 30))} title="Advance simulated clock 30 minutes">+30m</button>
              <button className="h-7 border-l border-line-strong px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-ink" onClick={() => update((s) => advanceClock(s, 180))} title="Advance simulated clock 3 hours">+3h</button>
            </div>
            <button
              onClick={() => update((s) => setOnline(s, !online))}
              className="flex h-7 items-center gap-1.5 rounded-[4px] px-1.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink"
              aria-label={online ? 'Online (simulated). Click to go offline' : 'Offline (simulated). Click to reconnect'}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: online ? 'var(--color-ok)' : 'var(--color-warn)' }} />
              {online ? 'Online' : `Offline, ${state.offline.queue.length} queued`}
            </button>
            <div className="w-44 shrink-0"><Select<UserRole>
              ariaLabel="Demo role"
              className="h-7 w-44 text-[12.5px]"
              value={state.role}
              onChange={(r) => update((s) => setRole(s, r))}
              options={(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            /></div>
            <Button size="sm" variant="ghost" onClick={toggleTheme} aria-label="Toggle light/dark theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)} disabled={!can(state.role, 'scenario')} icon={<RotateCcw size={13} />}>Reset</Button>
          </div>
        </header>
        {!online && (
          <div role="status" className="border-b border-warn/30 bg-warn/10 px-5 py-1.5 text-[12.5px] text-warn">
            Offline (simulated). Showing cached data from last sync at {fmtTime(state.offline.lastSyncAt)}. It may be out of date. New reports are queued, not applied.
          </div>
        )}
        {storageError && <div role="alert" className="border-b border-crit/30 bg-crit/10 px-5 py-1.5 text-[12.5px] text-crit">Local save failed: {storageError}. Changes are kept in memory only.</div>}
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-6 lg:py-5">
          <Page />
        </main>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset to seeded dataset?"
        body="All reports, incidents, tasks, routes and audit events created in this browser will be replaced by the original simulated dataset. This cannot be undone."
        confirmLabel="Reset data"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { reset(); setConfirmReset(false); }}
      />
    </div>
  );
}
