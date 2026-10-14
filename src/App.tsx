import { useState, type ComponentType } from 'react';
import {
  Activity, AlertTriangle, BarChart3, ClipboardCheck, Download, FileText, Gauge, LayoutDashboard, Map as MapIcon,
  type LucideIcon, Menu, Moon, PlayCircle, Radio, RotateCcw, ScrollText, Settings as SettingsIcon, Siren, Sun, WifiOff, Wifi,
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

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:p-2 focus:text-white">Skip to content</a>
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden><path d="M3 21 L10 13 L16 16 L23 5" fill="none" stroke="var(--color-ink)" strokeWidth="2" /><circle cx="10" cy="13" r="2.6" fill="var(--color-bg)" stroke="var(--color-ok)" strokeWidth="2" /><circle cx="23" cy="5" r="2.6" fill="var(--color-accent)" /></svg>
            <div>
              <div className="text-[14px] font-semibold tracking-tight">Raksha-Path X</div>
              <div className="text-[11px] text-faint">Proof-of-Passability Network</div>
            </div>
          </div>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-3">
          {['Operate', 'Data', 'Evaluate'].map((g) => (
            <div key={g} className="mb-3">
              <div className="label-caps px-2 pb-1.5 text-[10.5px] text-faint">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <button
                  key={n.id}
                  onClick={() => { go(n.id); setNavOpen(false); }}
                  aria-current={current.id === n.id ? 'page' : undefined}
                  className={cx('flex h-9 w-full items-center gap-2.5 rounded-[3px] px-2 text-[13.5px]', current.id === n.id ? 'bg-surface-2 text-ink shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-muted hover:text-ink')}
                >
                  <n.icon size={16} />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.id === 'tasks' && openTasks > 0 && <span className="font-mono text-[11px] text-warn">{openTasks}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3 text-[11.5px] leading-snug text-faint">
          Fictional test area <span className="text-muted">Sector R-7</span>. All data is simulated. Decision support only; trained responders make operational decisions.
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-3 py-2 lg:px-5">
          <button className="lg:hidden" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={20} /></button>
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <Activity size={13} className="text-stale" /> Simulated data
          </div>
          <div className="flex items-center gap-2">
            <Gauge size={15} className="text-muted" />
            <span className="label-caps">Clock</span>
            <span className="font-mono text-[14px]" title={fmtTime(state.now)}>{fmtClock(state.now)}</span>
            <Button size="sm" variant="ghost" onClick={() => update((s) => advanceClock(s, 30))} title="Advance simulated clock 30 minutes">+30m</Button>
            <Button size="sm" variant="ghost" onClick={() => update((s) => advanceClock(s, 180))} title="Advance simulated clock 3 hours">+3h</Button>
          </div>
          <button
            onClick={() => update((s) => setOnline(s, !s.offline.online))}
            className={cx('flex h-7 items-center gap-1.5 border px-2 text-[12px] font-medium', state.offline.online ? 'border-ok/50 text-ok' : 'border-warn/60 text-warn')}
            aria-label={state.offline.online ? 'Online (simulated). Click to go offline' : 'Offline (simulated). Click to reconnect'}
          >
            {state.offline.online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {state.offline.online ? 'Online' : `Offline · ${state.offline.queue.length} queued`}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="label-caps hidden md:inline">Role</span>
            <Select<UserRole>
              ariaLabel="Demo role"
              className="h-8 w-48"
              value={state.role}
              onChange={(r) => update((s) => setRole(s, r))}
              options={(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
            <Button size="sm" variant="ghost" onClick={toggleTheme} aria-label="Toggle light/dark theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)} disabled={!can(state.role, 'scenario')} icon={<RotateCcw size={14} />}>Reset</Button>
          </div>
        </header>
        {!state.offline.online && (
          <div role="status" className="border-b border-warn/40 bg-warn/10 px-5 py-1.5 text-[12.5px] text-warn">
            Offline (simulated). Showing cached data from last sync at {fmtTime(state.offline.lastSyncAt)}. It may be out of date. New reports are queued, not applied.
          </div>
        )}
        {storageError && <div role="alert" className="border-b border-crit/40 bg-crit/10 px-5 py-1.5 text-[12.5px] text-crit">Local save failed: {storageError}. Changes are kept in memory only.</div>}
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
