import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthResult {
  error: Error | null;
}

// Every method that hits a CAPTCHA-protected Supabase endpoint takes an
// optional Turnstile token. It's ignored until CAPTCHA is enabled in Supabase.
interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  signUp: (
    email: string,
    password: string,
    name: string,
    phone?: string,
    captchaToken?: string,
    referralCode?: string,
  ) => Promise<AuthResult & { needsConfirmation: boolean }>;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string, captchaToken?: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string, captchaToken?: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /** Supabase emails a confirmation link to the new address (and, if "secure email change"
   *  is on, the old one too) before the change actually takes effect — nothing flips here. */
  updateEmail: (email: string) => Promise<AuthResult>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    try {
      // Set up auth state listener FIRST
      supabase.auth.onAuthStateChange((event, session) => {
        set({
          session,
          user: session?.user ?? null,
          loading: false,
        });
      });

      // Then get the current session. A transient failure here (a token refresh
      // hiccup, a throttled background tab, a brief network drop) must not read as
      // "signed out" - that bounced signed-in people off protected pages - so retry
      // before giving up.
      let session: Session | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await supabase.auth.getSession();
          if (res.error) throw res.error;
          session = res.data.session;
          break;
        } catch (err) {
          if (attempt >= 2) throw err;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        initialized: true,
      });
    } catch (error) {
      console.error("Auth initialization error:", error);
      // Keep whatever the auth listener has already established rather than
      // forcing a signed-out state.
      set({ loading: false, initialized: true });
    }
  },

  signUp: async (email, password, name, phone, captchaToken, referralCode) => {
    set({ loading: true });
    // name/phone/ref ride along as user metadata — the handle_new_user() trigger
    // reads them straight into the profiles row (and grants referral credits) on insert.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { name, phone: phone?.trim() || null, ref: referralCode?.trim() || null },
        captchaToken,
      },
    });
    set({ loading: false });
    // With "Confirm email" switched on in Supabase, the account is created but
    // no session comes back until they click the link in their inbox.
    return { error, needsConfirmation: !error && !data.session };
  },

  signIn: async (email, password, captchaToken) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    set({ loading: false });
    return { error };
  },

  signInWithOAuth: async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/app` },
    });
    return { error };
  },

  signOut: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    set({ user: null, session: null, loading: false });
  },

  // The three below deliberately leave `loading` alone: ProtectedRoute swaps
  // the whole page for a spinner while it's true, which would wipe the form
  // someone is in the middle of submitting.
  resendConfirmation: async (email, captchaToken) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/app`, captchaToken },
    });
    return { error };
  },

  requestPasswordReset: async (email, captchaToken) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    });
    return { error };
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  },

  updateEmail: async (email) => {
    const { error } = await supabase.auth.updateUser({ email });
    return { error };
  },
}));
