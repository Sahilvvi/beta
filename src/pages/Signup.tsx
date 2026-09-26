import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/Logo';
import { SEO } from '@/components/shared/SEO';
import { Captcha } from '@/components/auth/Captcha';
import { Reveal, Stagger, staggerItem } from '@/components/premium/Motion';
import { useAuthStore } from '@/stores/authStore';
import { useAuthProviders } from '@/hooks/useAuthProviders';
import { safeReturnPath } from '@/lib/returnPath';
import { CAPTCHA_ENABLED } from '@/lib/captcha';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Check, Gift, MailCheck, Eye, EyeOff } from 'lucide-react';
import { FREE_SIGNUP_CREDITS, REFERRAL_BONUS_CREDITS } from '@/lib/generation';

const benefits = [
  `${FREE_SIGNUP_CREDITS} free redesigns to start`,
  'Any phone photo — no special hardware',
  'Room templates for every style',
  'Every design saved to your library',
];

import { useSiteFlags } from '@/lib/siteFlags';
export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /** Set when Supabase wants the email confirmed before the first sign-in. */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const { signUp, resendConfirmation, signInWithOAuth } = useAuthStore();
  const providers = useAuthProviders();
  const anyProvider = providers.google || providers.apple;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref') ?? undefined;

  const captchaMissing = CAPTCHA_ENABLED && !captchaToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error, needsConfirmation } = await signUp(
      email.trim(),
      password,
      name.trim(),
      phone,
      captchaToken ?? undefined,
      referralCode,
    );

    if (error) {
      toast.error(error.message || 'Failed to create account');
      setCaptchaKey((k) => k + 1); // tokens are single-use
      setIsLoading(false);
    } else if (needsConfirmation) {
      setPendingEmail(email.trim());
      setIsLoading(false);
    } else {
      toast.success('Account created — welcome to Think Decor');
      navigate(safeReturnPath(location.state), { replace: true });
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setResending(true);
    const { error } = await resendConfirmation(pendingEmail, captchaToken ?? undefined);
    setResending(false);
    setCaptchaKey((k) => k + 1);
    if (error) toast.error(error.message || "Couldn't resend the email");
    else toast.success('Confirmation email sent again');
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    const { error } = await signInWithOAuth(provider);
    if (error) {
      toast.error(error.message || `Couldn't sign up with ${provider === 'google' ? 'Google' : 'Apple'}`);
      setOauthLoading(null);
    }
    // On success Supabase redirects the browser away — nothing left to reset.
  };

  const siteFlags = useSiteFlags();
  if (siteFlags && siteFlags.flags.signups === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-3xl text-foreground">Signups are paused</h1>
          <p className="mt-3 text-muted-foreground">We are not taking new accounts for a short while. Existing customers can still sign in.</p>
          <a href="/login" className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">Sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SEO
        title="Create your account | Think Decor"
        description="Create a Think Decor account and redesign your first room with Mantha AI."
      />

      {/* Left panel — the art */}
      <div className="relative hidden flex-1 items-end overflow-hidden lg:flex">
        <img
          src="/assets/samples/styled_room.png"
          alt="A living room redesigned with Think Decor"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,51,44,.15), rgba(0,51,44,.35) 40%, rgba(0,51,44,.93)), radial-gradient(60% 50% at 0% 100%, rgba(0,160,140,.5), transparent 70%)',
          }}
        />

        <Reveal className="relative z-10 max-w-md p-12 pb-16">
          <span className="font-label text-xs font-bold uppercase tracking-[0.16em] text-[#8FE3D4]">
            Get started
          </span>
          <h2 className="mt-3 font-display text-[clamp(2.2rem,4vw,3.4rem)] font-normal leading-[0.95] text-white">
            See it <em className="italic text-[#8FE3D4]">redesigned.</em>
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-white/80">
            Upload a photo of any room and Mantha AI restyles it in seconds — in the
            style you pick, keeping the space you already have.
          </p>

          <ul className="mt-8 grid gap-2.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.18] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]">
                  <Check className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="text-[14.5px] text-white/90">{benefit}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      {/* Right panel — the form */}
      <div
        className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-8 md:px-16 lg:px-24"
        style={{
          background:
            'radial-gradient(70% 50% at 100% 0%, rgba(0,160,140,.16), transparent 60%), linear-gradient(180deg, #FFFFFF, #EEF7F5)',
        }}
      >
        <div className="mx-auto w-full max-w-md">
          <Reveal>
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>

            <div className="mb-8">
              <Logo size="lg" />
            </div>
          </Reveal>

          {pendingEmail ? (
            <Reveal delay={0.05}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="h-6 w-6 text-primary" />
              </span>
              <h1 className="mt-5 font-display text-[32px] font-normal tracking-[-0.01em]">Check your inbox</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                We sent a confirmation link to <span className="font-semibold text-foreground">{pendingEmail}</span>.
                Click it to finish creating your account — your {FREE_SIGNUP_CREDITS} free redesigns are waiting.
              </p>
              <div className="mt-6">
                <Captcha onToken={setCaptchaToken} resetKey={captchaKey} />
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button onClick={handleResend} variant="outline" disabled={resending || captchaMissing}>
                  {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Resend email
                </Button>
                <Button asChild variant="hero">
                  <Link to="/login" state={location.state}>Go to sign in</Link>
                </Button>
              </div>
              <p className="mt-6 text-[13px] text-muted-foreground">
                Wrong address?{' '}
                <button type="button" onClick={() => setPendingEmail(null)} className="font-medium text-primary hover:underline">
                  Start again
                </button>
              </p>
            </Reveal>
          ) : (
            <>
              <Reveal delay={0.05}>
                <div className="mb-8">
                  <h1 className="mb-2 font-display text-[clamp(1.9rem,3.2vw,2.6rem)] font-normal tracking-[-0.01em] text-[hsl(var(--primary))]">
                    Create your account
                  </h1>
                  <p className="text-muted-foreground">
                    Your first {FREE_SIGNUP_CREDITS} redesigns are free — no card needed.
                  </p>
                </div>
              </Reveal>

              <Stagger className="space-y-5">
                {anyProvider && (
<>
<motion.div variants={staggerItem} className={`grid gap-2.5 ${providers.google && providers.apple ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {providers.google && (
<button
                    type="button"
                    onClick={() => handleOAuth('google')}
                    disabled={oauthLoading !== null || isLoading}
                    className="flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3.5 font-label text-sm font-bold text-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {oauthLoading === 'google' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-label text-xs font-extrabold text-primary">
                        G
                      </span>
                    )}
                    Google
                  </button>
)}
                  {providers.apple && (
<button
                    type="button"
                    onClick={() => handleOAuth('apple')}
                    disabled={oauthLoading !== null || isLoading}
                    className="flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3.5 font-label text-sm font-bold text-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {oauthLoading === 'apple' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-label text-xs font-extrabold text-primary">
                        A
                      </span>
                    )}
                    Apple
                  </button>
)}
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="flex items-center gap-3 font-label text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  <span className="h-px flex-1 bg-border" />
                  or with email
                  <span className="h-px flex-1 bg-border" />
                </motion.div>
</>
)}

{referralCode && (
                    <motion.div
                      variants={staggerItem}
                      className="flex items-center gap-2.5 rounded-xl bg-secondary px-4 py-3 text-[13px] text-foreground/80"
                    >
                      <Gift className="h-4 w-4 flex-none text-primary" />
                      A friend invited you — you'll both get {REFERRAL_BONUS_CREDITS} bonus {REFERRAL_BONUS_CREDITS === 1 ? 'credit' : 'credits'} on signup.
                    </motion.div>
                  )}

                  <motion.form onSubmit={handleSubmit} variants={staggerItem} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Alex Morgan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+44 7700 900000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
                  </div>

                  <Captcha onToken={setCaptchaToken} resetKey={captchaKey} />

                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={isLoading || captchaMissing}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create account'
                    )}
                  </Button>
                </motion.form>

                <motion.p variants={staggerItem} className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/login" state={location.state} className="font-medium text-primary hover:underline">
                    Sign in
                  </Link>
                </motion.p>

                <motion.p variants={staggerItem} className="text-center text-xs text-muted-foreground">
                  By creating an account, you agree to our{' '}
                  <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                </motion.p>
              </Stagger>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
