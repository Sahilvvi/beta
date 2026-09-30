import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, LayoutGrid, Wand2, Plus, LogOut,
  Settings as SettingsIcon, Eraser, Replace as ReplaceIcon, Search, FolderOpen, Heart, Zap, Menu, X, CornerDownLeft,
} from 'lucide-react';
import '@/styles/app-theme.css';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/stores/authStore';
import { isActiveSubscription, useDisplayName, useSubscription } from '@/hooks/useProfile';
import { useCreditBalance, useGenerationsRealtime, useGenerations, titleFor } from '@/lib/generation';
import { TEMPLATES } from '@/lib/templates';
import { PHASE1_PLAN, pence } from '@/lib/billing';

const INTRO = pence(PHASE1_PLAN.introPrice ?? 0.69);
const formatShort = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const CRUMB: Record<string, [string, string]> = {
  '/app': ['Studio', 'Overview'],
  '/app/templates': ['Studio', 'Templates'],
  '/app/library': ['Studio', 'Projects'],
  '/app/saved': ['Studio', 'My picks'],
  '/app/create': ['Tools', 'Create'],
  '/app/cleanup': ['Tools', 'Cleanup'],
  '/app/replace': ['Tools', 'Replace'],
  '/app/settings': ['Account', 'Settings'],
};

const PAGES = [
  { label: 'Overview', sub: 'Your studio', to: '/app' },
  { label: 'New design', sub: 'Upload a room and restyle it', to: '/app/create' },
  { label: 'Templates', sub: 'Browse every style', to: '/app/templates' },
  { label: 'Projects', sub: 'Everything you have made', to: '/app/library' },
  { label: 'My picks', sub: 'Real products you have saved', to: '/app/saved' },
  { label: 'Cleanup', sub: 'Erase something from a photo', to: '/app/cleanup' },
  { label: 'Replace', sub: 'Swap one object for another', to: '/app/replace' },
  { label: 'Settings', sub: 'Profile, password and plan', to: '/app/settings' },
];

interface Hit { group: string; label: string; sub: string; to: string }

/** Shared layout for every signed-in page: sidebar with credits/nav, top bar with search + credits + upgrade. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuthStore();
  const { firstName, fullName, initial, email } = useDisplayName();
  const { data: credits } = useCreditBalance();
  const { data: subscription } = useSubscription();
  const { data: designs } = useGenerations();

  // ---- search + keyboard shortcuts ------------------------------------------
  const [term, setTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const hits: Hit[] = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return PAGES.map((pg) => ({ group: 'Go to', ...pg }));
    const out: Hit[] = [];
    PAGES.filter((pg) => `${pg.label} ${pg.sub}`.toLowerCase().includes(t)).slice(0, 3).forEach((pg) => out.push({ group: 'Go to', ...pg }));
    TEMPLATES.filter((tp) => `${tp.label} ${tp.description}`.toLowerCase().includes(t)).slice(0, 4).forEach((tp) =>
      out.push({ group: 'Styles', label: tp.label, sub: 'Start a design in this style', to: `/app/create?template=${tp.key}` }));
    (designs ?? []).filter((g) => `${titleFor(g)} ${g.prompt ?? ''}`.toLowerCase().includes(t)).slice(0, 5).forEach((g) =>
      out.push({ group: 'Projects', label: titleFor(g), sub: formatShort(g.created_at), to: `/app/library?open=${g.id}` }));
    // Anything else: let Projects do a full-text search on it.
    out.push({ group: 'Search', label: `Search projects for “${term.trim()}”`, sub: 'Names and prompts', to: `/app/library?q=${encodeURIComponent(term.trim())}` });
    return out;
  }, [term, designs]);
  useEffect(() => { setActive(0); }, [term]);

  const goHit = (h: Hit | undefined) => {
    if (!h) return;
    setSearchOpen(false);
    setTerm('');
    searchRef.current?.blur();
    navigate(h.to);
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); goHit(hits[active]); }
    else if (e.key === 'Escape') { setSearchOpen(false); searchRef.current?.blur(); }
  };

  // N = new design, Cmd/Ctrl+K (or /) = search. Ignored while typing in a field.
  useEffect(() => {
    const typing = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); setSearchOpen(true); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); navigate('/app/create'); }
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); setSearchOpen(true); }
    };
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [navigate]);

  // Below 1100px the sidebar is an off-canvas drawer (top-bar button) with a
  // bottom tab bar for the main destinations, instead of a block stacked above
  // the page. Any navigation closes it; Escape closes it too.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Mounted once here (not per-page) so a generation finishing — in this tab
  // or another — updates Overview/Projects live, for as long as the visitor
  // is anywhere under /app.
  useGenerationsRealtime();

  const crumb =
    CRUMB[pathname] ??
    Object.entries(CRUMB)
      .filter(([to]) => to !== '/app' && pathname.startsWith(`${to}/`))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ??
    ['Studio', 'Overview'];
  const fraction = credits === undefined ? 0 : Math.max(0, Math.min(1, credits / PHASE1_PLAN.credits));

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const handleSignOut = async () => {
    setConfirmingSignOut(false);
    // Navigate away from /app *before* the session actually clears — once
    // `user` goes null, ProtectedRoute's own <Navigate to="/login"> fires
    // immediately, and it wins the race against a navigate('/') called
    // after awaiting signOut(). Leaving the protected tree first means that
    // redirect never has a route left to fire on.
    navigate('/', { replace: true });
    await signOut();
  };

  return (
    <div className="app-x">
      <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
        <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />
        <aside className="side" id="app-drawer" aria-label="Main navigation">
          <button type="button" className="side-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X width={18} height={18} />
          </button>
          <Link to="/" className="brand"><img src="/logo.png?v=5" alt="" className="brand__mark" /><b>Think</b> <i>Decor</i></Link>

          <Link to="/app/create" className="newbtn">
            <Plus width={16} height={16} strokeWidth={2.2} />New design<kbd>N</kbd>
          </Link>

          <div className="navgroup">STUDIO</div>
          <nav className="nav">
            <NavLink to="/app" end className={({ isActive }) => (isActive ? 'on' : '')}>
              <LayoutDashboard width={18} height={18} />Overview
            </NavLink>
            <NavLink to="/app/templates" className={({ isActive }) => (isActive ? 'on' : '')}>
              <LayoutGrid width={18} height={18} />Templates<span className="n">7</span>
            </NavLink>
            <NavLink to="/app/library" className={({ isActive }) => (isActive ? 'on' : '')}>
              <FolderOpen width={18} height={18} />Projects<span className="n">{designs?.length ?? 0}</span>
            </NavLink>
            <NavLink to="/app/saved" className={({ isActive }) => (isActive ? 'on' : '')}>
              <Heart width={18} height={18} />My picks
            </NavLink>
          </nav>

          <div className="navgroup">TOOLS</div>
          <nav className="nav">
            <NavLink to="/app/create" className={({ isActive }) => (isActive ? 'on' : '')}>
              <Wand2 width={18} height={18} />Create
            </NavLink>
            <NavLink to="/app/cleanup" className={({ isActive }) => (isActive ? 'on' : '')}>
              <Eraser width={18} height={18} />Cleanup
            </NavLink>
            <NavLink to="/app/replace" className={({ isActive }) => (isActive ? 'on' : '')}>
              <ReplaceIcon width={18} height={18} />Replace
            </NavLink>
          </nav>

          <div className="navgroup">ACCOUNT</div>
          <nav className="nav">
            <NavLink to="/app/settings" className={({ isActive }) => (isActive ? 'on' : '')}>
              <SettingsIcon width={18} height={18} />Settings
            </NavLink>
          </nav>

          <div className="side-foot">
            <div className="cred">
              <div className="cred-top">
                <span className="kicker">Credits</span>
                <Link to="/pricing">Get more</Link>
              </div>
              <div className="cred-v">
                <b>{credits === undefined ? '—' : credits}</b>
                <span>left on Free</span>
              </div>
              <div className="cred-bar">
                <i className={fraction < 0.5 ? 'e' : ''} />
                <i className={fraction < 1 ? 'e' : ''} style={{ animationDelay: '.65s' }} />
              </div>
              <p>Each redesign uses 1 credit{credits !== undefined ? ` · ${credits} ${credits === 1 ? 'design' : 'designs'} to go` : ''}</p>
            </div>
            <div className="me">
              <div className="av l2">{initial}</div>
              <div className="who">
                <b>{fullName}</b>
                <span>{email}</span>
              </div>
              <button type="button" onClick={() => setConfirmingSignOut(true)} aria-label="Sign out"><LogOut width={16} height={16} /></button>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="top">
            <button
              type="button"
              className="menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="app-drawer"
            >
              <Menu width={20} height={20} />
            </button>
            <Link to="/" className="top-brand"><img src="/logo.png?v=5" alt="" className="brand__mark invert" /><b>Think</b> <i>Decor</i></Link>
            <div className="crumb">
              {crumb[0]}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              <b>{crumb[1]}</b>
            </div>
            <div className="search-wrap" ref={searchWrapRef}>
              <label className="search">
                <Search width={15} height={15} />
                <input
                  ref={searchRef}
                  value={term}
                  onChange={(e) => { setTerm(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={onSearchKey}
                  placeholder="Search styles, projects…"
                  aria-label="Search styles and projects"
                  role="combobox"
                  aria-expanded={searchOpen}
                  aria-controls="app-search-list"
                  autoComplete="off"
                />
                <kbd>⌘K</kbd>
              </label>
              {searchOpen && (
                <div className="sresults" id="app-search-list" role="listbox">
                  {hits.map((h, i) => {
                    const head = i === 0 || hits[i - 1].group !== h.group ? h.group : null;
                    return (
                      <div key={`${h.group}-${h.to}-${i}`}>
                        {head && <div className="sgroup">{head}</div>}
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === active}
                          className={`sitem${i === active ? ' on' : ''}`}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => goHit(h)}
                        >
                          <span className="st"><b>{h.label}</b><small>{h.sub}</small></span>
                          {i === active && <CornerDownLeft width={14} height={14} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {credits !== undefined && (
              <span className={`credpill${credits <= 0 ? ' warn' : ''}`}>
                <Zap width={14} height={14} />
                <b>{credits}</b> credits
              </span>
            )}
            {!isActiveSubscription(subscription) && (
              <Link to="/pricing" className="btn btn-dark upgrade">Upgrade · {INTRO}</Link>
            )}
          </header>

          {children}
        </main>

        <nav className="tabbar" aria-label="Quick navigation">
          <NavLink to="/app" end className={({ isActive }) => (isActive ? 'on' : '')}>
            <LayoutDashboard width={20} height={20} /><span>Home</span>
          </NavLink>
          <NavLink to="/app/templates" className={({ isActive }) => (isActive ? 'on' : '')}>
            <LayoutGrid width={20} height={20} /><span>Styles</span>
          </NavLink>
          <NavLink to="/app/create" className={({ isActive }) => `mid${isActive ? ' on' : ''}`}>
            <Plus width={22} height={22} strokeWidth={2.4} /><span>Create</span>
          </NavLink>
          <NavLink to="/app/library" className={({ isActive }) => (isActive ? 'on' : '')}>
            <FolderOpen width={20} height={20} /><span>Projects</span>
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => (isActive ? 'on' : '')}>
            <SettingsIcon width={20} height={20} /><span>Settings</span>
          </NavLink>
        </nav>
      </div>

      <AlertDialog open={confirmingSignOut} onOpenChange={setConfirmingSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign in again to get back to your projects and designs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
