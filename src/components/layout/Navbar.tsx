import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { PHASE1_PLAN, pence } from '@/lib/billing';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

const INTRO = pence(PHASE1_PLAN.introPrice ?? 0.69);

const navLinks = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#styles', label: 'Styles' },
  { href: '/#comparison', label: 'Compare' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

/** `floating` keeps the glass pill on from the top — for pages that open on a dark hero. */
export function Navbar({ floating = false }: { floating?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuthStore();
  const account = user ? { to: '/app', label: 'Dashboard' } : { to: '/login', label: 'Sign in' };
  const [scrolled, setScrolled] = useState(false);

  // Full-width and transparent at the top; a floating glass pill once the page moves.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Tucks away while you scroll down a long page, comes straight back on any scroll up.
  const [tucked, setTucked] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) > 6) setTucked(delta > 0 && y > 480);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy (homepage only): which in-page section is under the middle of the screen.
  const { pathname } = useLocation();
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (pathname !== '/') { setActiveId(null); return; }
    const ids = navLinks.filter((l) => l.href.startsWith('/#')).map((l) => l.href.slice(2));
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        setActiveId(ids.find((id) => seen.get(id)) ?? null);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    // sections mount lazily (and after the intro), so look for them for a while
    const found = new Set<string>();
    const scan = () => ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && !found.has(id)) { found.add(id); io.observe(el); }
    });
    scan();
    const timer = window.setInterval(scan, 1500);
    return () => { io.disconnect(); window.clearInterval(timer); };
  }, [pathname]);

  const raised = floating || scrolled || mobileOpen;
  // Before the page scrolls, the pill is transparent and sits directly on the
  // dark hero — the usual dark nav-link/logo colours lose contrast there, so
  // this state alone goes light-on-dark. Once raised (scrolled, or the menu is
  // open), the pill is a solid white card again and the normal dark text returns.
  const light = !raised;

  return (
    <nav
      className={cn(
        'fixed inset-x-0 top-0 z-50 px-3 pt-3 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] sm:px-4',
        tucked && !mobileOpen && '-translate-y-[120%]',
      )}
    >
      <div
        className={cn(
          'mx-auto rounded-[22px] border px-4 transition-all duration-500 sm:px-6',
          raised
            ? 'max-w-[1160px] border-border/70 bg-white/80 shadow-[0_12px_40px_-18px_hsl(168_30%_15%/0.28)] backdrop-blur-xl'
            : 'max-w-[1400px] border-transparent bg-white/0',
        )}
      >
        <div className="flex h-14 items-center justify-between">
          <Logo inverted={light} />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => {
              const active = activeId !== null && link.href === `/#${activeId}`;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'relative whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-medium transition-colors lg:px-3 lg:text-sm',
                    // Blog/Contact also live in the footer; drop them where the pill gets tight
                    (link.href === '/blog' || link.href === '/contact') && 'hidden xl:inline-block',
                    light ? 'text-white/85 hover:text-white' : 'text-muted-foreground hover:text-foreground',
                    active && !light && 'text-primary hover:text-primary',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className={cn('absolute inset-0 -z-[1] rounded-full', light ? 'bg-white/15' : 'bg-secondary')}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to={account.to}
              className={cn(
                'whitespace-nowrap text-sm font-medium transition-colors',
                light ? 'text-white/85 hover:text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {account.label}
            </Link>
            <Link to="/pricing">
              <Button variant="hero" size="sm">
                Start for {INTRO}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className={cn('md:hidden p-2 transition-colors', light ? 'text-white' : 'text-foreground')}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-border/30">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-border/30">
                <Link to={account.to} onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full">
                    {account.label}
                  </Button>
                </Link>
                <Link to="/pricing" onClick={() => setMobileOpen(false)}>
                  <Button variant="hero" className="w-full">
                    Start for {INTRO}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
