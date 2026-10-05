import { useEffect } from 'react';
import { lazyPage, prefetchPages } from "@/lib/lazyPage";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ProtectedRoute, GuestRoute, AdminRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/app/AppShell";
import { useAuthStore } from "@/stores/authStore";
import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { usePageViewTracking } from "@/lib/analytics";
import { MaintenanceBanner } from "@/components/shared/MaintenanceBanner";

// Pages — single-page B2B landing + product demo + app
import Home from "./pages/Home";
const HomeClassic = lazyPage(() => import("./pages/HomeClassic"));
import Blog from "./pages/Blog";
import NotFound from "./pages/NotFound";
import Contact from "./pages/Contact";
import Pricing from "./pages/Pricing";
import AiRoomRedesign from "./pages/AiRoomRedesign";
const SuperAdmin = lazyPage(() => import("./pages/super/SuperAdmin"));
const CheckoutSuccess = lazyPage(() => import("./pages/CheckoutSuccess"));
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Refunds from "./pages/Refunds";
import BlogPostPage from "./pages/BlogPost";
const AdminAuth = lazyPage(() => import("./pages/admin/AdminAuth"));
const BlogAdmin = lazyPage(() => import("./pages/admin/BlogAdmin"));
const BlogEditor = lazyPage(() => import("./pages/admin/BlogEditor"));
const Leads = lazyPage(() => import("./pages/admin/Leads"));
const AdminProducts = lazyPage(() => import("./pages/admin/Products"));
const AdminOverview = lazyPage(() => import("./pages/admin/Overview"));
const AdminAccounts = lazyPage(() => import("./pages/admin/Accounts"));
const AdminSupport = lazyPage(() => import("./pages/admin/Support"));
const Viz2dDemo = lazyPage(() => import("./visualizer-demo"));
const Login = lazyPage(() => import("./pages/Login"));
const Signup = lazyPage(() => import("./pages/Signup"));
const Overview = lazyPage(() => import("./pages/app/Overview"));
const Templates = lazyPage(() => import("./pages/app/Templates"));
const Library = lazyPage(() => import("./pages/app/Library"));
const Saved = lazyPage(() => import("./pages/app/Saved"));
const Share = lazyPage(() => import("./pages/Share"));
const Create = lazyPage(() => import("./pages/app/Create"));
const Cleanup = lazyPage(() => import("./pages/app/Cleanup"));
const Replace = lazyPage(() => import("./pages/app/Replace"));
const Settings = lazyPage(() => import("./pages/app/Settings"));
const ForgotPassword = lazyPage(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));

const queryClient = new QueryClient();

function AppRoutes() {
  const { initialize } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    initialize();
  }, [initialize]);

  usePageViewTracking();

  useEffect(() => {
    if (!location.hash) { window.scrollTo(0, 0); return; }
    // Nav/footer links to "/#section" used to be plain <a> tags, so the
    // browser's own full-reload-then-jump-to-fragment behaviour did this
    // for free. Now that they're client-side <Link>s (so navigating around
    // the site doesn't replay the intro video — see Home.tsx), that native
    // behaviour is gone, so the scroll has to be done by hand here instead.
    const id = location.hash.slice(1);
    // Two separate races to cover here, both from landing on a page that
    // hasn't finished settling yet:
    // 1. Routes are wrapped in <AnimatePresence mode="wait"> with a ~0.3s
    //    exit transition (PageTransition), so navigating here from another
    //    route doesn't mount the target page — and its #section element —
    //    until that exit finishes. A single rAF fires long before that,
    //    finds nothing, and silently gives up.
    // 2. Even once found, images further up the page (hero, template
    //    thumbnails, ...) are often still loading, growing the document and
    //    pushing the target further down *after* we've already scrolled to
    //    where it used to be. A one-shot scrollIntoView lands short.
    // So: poll for the element, then keep re-issuing the scroll while its
    // absolute document position (not viewport position, which moves for
    // the boring reason that we're mid-scroll) is still drifting, and stop
    // once it's held still for a few frames.
    let rafId: number;
    const deadline = performance.now() + 3000;
    let lastAbsTop: number | null = null;
    let stableFrames = 0;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        const absTop = el.getBoundingClientRect().top + window.scrollY;
        if (lastAbsTop === null || Math.abs(absTop - lastAbsTop) > 4) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          lastAbsTop = absTop;
          stableFrames = 0;
        } else {
          stableFrames += 1;
        }
        if (stableFrames >= 10) return;
      }
      if (performance.now() < deadline) rafId = requestAnimationFrame(tryScroll);
    };
    rafId = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(rafId);
  }, [location.pathname, location.hash]);

  return (
    <>
    <MaintenanceBanner />
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Home - AI Measurement + Mantha AI */}
        <Route path="/" element={<PageTransition><Home /></PageTransition>} />
        <Route path="/classic" element={<PageTransition><HomeClassic /></PageTransition>} />
        <Route path="/r/:slug" element={<Share />} />

        {/* Contact */}
        <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />

        {/* Pricing + checkout */}
        <Route path="/pricing" element={<PageTransition><Pricing /></PageTransition>} />
        <Route path="/ai-room-redesign" element={<PageTransition><AiRoomRedesign /></PageTransition>} />
        <Route path="/checkout/success" element={<PageTransition><CheckoutSuccess /></PageTransition>} />

        {/* Legal — Stripe expects these to be publicly reachable */}
        <Route path="/terms" element={<PageTransition><Terms /></PageTransition>} />
        <Route path="/privacy" element={<PageTransition><Privacy /></PageTransition>} />
        <Route path="/refunds" element={<PageTransition><Refunds /></PageTransition>} />

        {/* Journal */}
        <Route path="/blog" element={<PageTransition><Blog /></PageTransition>} />
        <Route path="/blog/:slug" element={<PageTransition><BlogPostPage /></PageTransition>} />

        {/* Journal admin — admin role required; signed-out visitors go to the CMS login */}
        <Route path="/super" element={<SuperAdmin />} />
        <Route path="/admin" element={<AdminAuth />} />
        <Route path="/admin/overview" element={<AdminRoute><AdminOverview /></AdminRoute>} />
        <Route path="/admin/blog" element={<AdminRoute><BlogAdmin /></AdminRoute>} />
        <Route path="/admin/blog/:id" element={<AdminRoute><BlogEditor /></AdminRoute>} />
        <Route path="/admin/leads" element={<AdminRoute><Leads /></AdminRoute>} />
        <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
        <Route path="/admin/accounts" element={<AdminRoute><AdminAccounts /></AdminRoute>} />
        <Route path="/admin/support" element={<AdminRoute><AdminSupport /></AdminRoute>} />

        {/* Live product demo */}
        <Route path="/demo" element={<PageTransition><Viz2dDemo /></PageTransition>} />

        {/* Customer auth */}
        <Route path="/login" element={<GuestRoute><PageTransition><Login /></PageTransition></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><PageTransition><Signup /></PageTransition></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><PageTransition><ForgotPassword /></PageTransition></GuestRoute>} />
        {/* Not a GuestRoute: the reset link signs the visitor in, and they must stay here to set a password */}
        <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />

        {/* Signed-in app */}
        <Route path="/app" element={<ProtectedRoute><AppShell><Overview /></AppShell></ProtectedRoute>} />
        <Route path="/app/templates" element={<ProtectedRoute><AppShell><Templates /></AppShell></ProtectedRoute>} />
        <Route path="/app/library" element={<ProtectedRoute><AppShell><Library /></AppShell></ProtectedRoute>} />
        <Route path="/app/saved" element={<ProtectedRoute><AppShell><Saved /></AppShell></ProtectedRoute>} />
        <Route path="/app/create" element={<ProtectedRoute><AppShell><Create /></AppShell></ProtectedRoute>} />
        <Route path="/app/cleanup" element={<ProtectedRoute><AppShell><Cleanup /></AppShell></ProtectedRoute>} />
        <Route path="/app/replace" element={<ProtectedRoute><AppShell><Replace /></AppShell></ProtectedRoute>} />
        <Route path="/app/settings" element={<ProtectedRoute><AppShell><Settings /></AppShell></ProtectedRoute>} />
        {/* Old editor URLs (/app/projects, /app/editor/…) land on the new overview */}
        <Route path="/app/*" element={<Navigate to="/app" replace />} />

        {/* Everything else → landing */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
    </>
  );
}

const App = () => {
  useEffect(() => {
    // Warm the pages people open next (sign in / sign up), so the click never waits on the network.
    prefetchPages([() => import("./pages/Login"), () => import("./pages/Signup"), () => import("./pages/ForgotPassword")]);
  }, []);

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
