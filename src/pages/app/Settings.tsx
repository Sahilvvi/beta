import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Camera, Copy, ExternalLink, Gift, Loader2, Lock, LogOut, Mail, User, Zap, LifeBuoy, CreditCard, Check,
} from 'lucide-react';

import { SEO } from '@/components/shared/SEO';
import { useAuthStore } from '@/stores/authStore';
import {
  isActiveSubscription, useProfile, useSubscription, useUpdateProfile,
} from '@/hooks/useProfile';
import { formatDate, isSetupError, useCreditBalance } from '@/lib/generation';
import { referralUrlFor, useReferralCode, useReferralCount, REFERRAL_BONUS_CREDITS } from '@/lib/generation';
import { PHASE1_PLAN, money, pence } from '@/lib/billing';
import { CheckoutError, openBillingPortal, syncBilling } from '@/lib/checkout';
import { uploadAvatar, UploadError } from '@/lib/upload';
import { useMyTickets, useRaiseTicket } from '@/lib/support';

const INTRO = pence(PHASE1_PLAN.introPrice ?? 0.69);
const MONTHLY = money(PHASE1_PLAN.monthly);

const TABS = [
  { key: 'profile', label: 'Profile', icon: User, blurb: 'Your name, photo and contact details.' },
  { key: 'security', label: 'Security', icon: Lock, blurb: 'Change your password and manage this session.' },
  { key: 'plan', label: 'Plan & billing', icon: CreditCard, blurb: 'Your credits, plan and invoices.' },
  { key: 'support', label: 'Support', icon: LifeBuoy, blurb: 'Ask us anything — we reply right here.' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function Spinner() {
  return <Loader2 width={15} height={15} className="spin" />;
}

export default function Settings() {
  const { user, updatePassword, updateEmail, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'profile';
  const current = TABS.find((t) => t.key === tab)!;
  const selectTab = (key: TabKey) => setParams(key === 'profile' ? {} : { tab: key }, { replace: true });

  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: credits } = useCreditBalance();
  const { data: referralCode } = useReferralCode();
  const { data: referralCount } = useReferralCount();
  const copyReferralLink = async () => {
    if (!referralCode) return;
    await navigator.clipboard.writeText(referralUrlFor(referralCode));
    toast.success('Invite link copied');
  };
  const queryClient = useQueryClient();
  const { data: subscription } = useSubscription();
  const { data: tickets } = useMyTickets();
  const raiseTicket = useRaiseTicket();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');

  // Fill the form once, when the profile first arrives — never overwrite typing.
  useEffect(() => {
    if (hydrated || profileLoading) return;
    const meta = (user?.user_metadata ?? {}) as { name?: string; phone?: string };
    setName(profile?.name ?? meta.name ?? '');
    setPhone((profile as { phone?: string | null } | null)?.phone ?? meta.phone ?? '');
    setHydrated(true);
  }, [hydrated, profileLoading, profile, user]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({ name: name.trim(), phone: phone.trim() || null });
      toast.success('Profile saved');
    } catch (err) {
      toast.error(
        isSetupError(err)
          ? 'Phone numbers can be saved once the latest database update is applied.'
          : "Couldn't save your profile. Please try again.",
      );
    }
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(user.id, file);
      await updateProfile.mutateAsync({ avatar_url: url });
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err instanceof UploadError ? err.message : "Couldn't update your photo. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const sendEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEmail.trim();
    if (!trimmed || trimmed === user?.email) return;
    setSavingEmail(true);
    const { error } = await updateEmail(trimmed);
    setSavingEmail(false);
    if (error) {
      toast.error(error.message || "Couldn't start the email change. Please try again.");
      return;
    }
    setEmailSent(true);
    toast.success(`Check ${trimmed} for a confirmation link.`);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const { error } = await updatePassword(password);
    setSavingPassword(false);
    if (error) {
      toast.error(error.message || "Couldn't update your password.");
      return;
    }
    setPassword('');
    setConfirm('');
    toast.success('Password updated');
  };

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    try {
      await raiseTicket.mutateAsync({ subject: ticketSubject.trim(), message: ticketMessage.trim() });
      setTicketSubject('');
      setTicketMessage('');
      toast.success("Query sent — we'll reply here.");
    } catch (err) {
      toast.error(
        isSetupError(err)
          ? 'Support queries can be raised once the latest database update is applied.'
          : "Couldn't send that. Please try again.",
      );
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const [refreshingBilling, setRefreshingBilling] = useState(false);
  const refreshBilling = async () => {
    setRefreshingBilling(true);
    const res = await syncBilling();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscription'] }),
      queryClient.invalidateQueries({ queryKey: ['credits'] }),
    ]);
    setRefreshingBilling(false);
    if (!res) toast.error("Couldn't check billing right now. Please try again in a minute.");
    else if (res.subscriptions === 0 && res.payments === 0) toast.message('No payment found for this email yet.');
    else toast.success('Billing refreshed.');
  };

  // Opening the Plan tab re-checks Stripe once, so a plan bought a moment ago shows up without a manual step.
  useEffect(() => {
    if (tab === 'plan' && !isActiveSubscription(subscription)) void refreshBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const manageBilling = async () => {
    setOpeningPortal(true);
    try {
      await openBillingPortal();
      // On success the browser navigates to Stripe, so nothing runs after this.
    } catch (err) {
      toast.error(err instanceof CheckoutError ? err.message : "Couldn't open billing. Please try again.");
      setOpeningPortal(false);
    }
  };

  const active = isActiveSubscription(subscription);
  const periodEnd = subscription?.current_period_end ? formatDate(subscription.current_period_end) : null;
  const fraction = credits === undefined ? 0 : Math.max(0, Math.min(1, credits / PHASE1_PLAN.credits));

  return (
    <>
      <SEO title="Settings | Think Decor" description="Manage your Think Decor account." />

      <section className="panel">
        <div className="ph">
          <div className="r">
            <div className="kicker">Account</div>
            <h1>Settings</h1>
            <p className="sub">Your profile, password and plan.</p>
          </div>
        </div>

        <div className="set">
          <nav className="set-nav r" style={{ ['--i' as string]: 1 }} aria-label="Settings sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? 'on' : ''}
                onClick={() => selectTab(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
              >
                <t.icon />
                {t.label}
              </button>
            ))}
            <div className="who">
              <b>Signed in as</b>
              {user?.email}
            </div>
          </nav>

          <div className="set-pane" key={tab}>
            {/* ---------------------------------------------------------- Profile */}
            {tab === 'profile' && (
              <form className="scard" onSubmit={saveProfile}>
                <h3>{current.label}</h3>
                <p className="lede">{current.blurb}</p>

                <div className="avrow">
                  <button
                    type="button"
                    className="avatar"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    aria-label="Change profile photo"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" />
                    ) : (
                      <span>{(name || user?.email || 'T').charAt(0).toUpperCase()}</span>
                    )}
                    <span className="ov">{uploadingAvatar ? <Spinner /> : <Camera width={20} height={20} />}</span>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                    hidden
                    onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <div>
                    <b>Profile photo</b>
                    <p>JPG, PNG or WebP.</p>
                    <button type="button" className="lnk" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
                      {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                    </button>
                  </div>
                </div>

                <div className="fgrid">
                  <div className="fld">
                    <label htmlFor="settings-name">Full name</label>
                    <input id="settings-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                  </div>
                  <div className="fld">
                    <label htmlFor="settings-phone">Phone number</label>
                    <input id="settings-phone" className="inp" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="fld full">
                    <label htmlFor="settings-email">Email</label>
                    <input id="settings-email" className="inp" value={user?.email ?? ''} disabled />
                    {!editingEmail ? (
                      <div className="fhint">
                        <button
                          type="button"
                          className="lnk"
                          onClick={() => { setNewEmail(''); setEmailSent(false); setEditingEmail(true); }}
                        >
                          Change email
                        </button>
                      </div>
                    ) : emailSent ? (
                      <p className="fhint"><Mail width={14} height={14} /> Check {newEmail} for a confirmation link — it won't change until you click it.</p>
                    ) : (
                      <div className="fhint">
                        <input
                          className="inp"
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="new@email.com"
                          aria-label="New email address"
                        />
                        <button type="button" className="btn btn-dark btn-sm" disabled={savingEmail || !newEmail.trim()} onClick={sendEmailChange}>
                          {savingEmail && <Spinner />} Send confirmation
                        </button>
                        <button type="button" className="lnk" onClick={() => setEditingEmail(false)}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="scard-foot">
                  <button type="submit" className="btn btn-dark" disabled={updateProfile.isPending || !hydrated}>
                    {updateProfile.isPending ? <Spinner /> : <Check width={15} height={15} />} Save profile
                  </button>
                </div>
              </form>
            )}

            {/* ------------------------------------------------------- Security */}
            {tab === 'security' && (
              <>
                <form className="scard" onSubmit={savePassword}>
                  <h3>Password</h3>
                  <p className="lede">Use at least 6 characters. You'll stay signed in on this device.</p>
                  <div className="fgrid" style={{ marginTop: 22 }}>
                    <div className="fld">
                      <label htmlFor="settings-password">New password</label>
                      <input id="settings-password" className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                    </div>
                    <div className="fld">
                      <label htmlFor="settings-confirm">Confirm new password</label>
                      <input id="settings-confirm" className="inp" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
                    </div>
                  </div>
                  <div className="scard-foot">
                    <button type="submit" className="btn btn-dark" disabled={savingPassword}>
                      {savingPassword && <Spinner />} Update password
                    </button>
                  </div>
                </form>

                <div className="scard danger-zone">
                  <h3>Session</h3>
                  <p className="lede">Signed in as {user?.email}.</p>
                  <div className="scard-foot" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="btn btn-line" onClick={handleSignOut}>
                      <LogOut width={15} height={15} /> Sign out
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ---------------------------------------------------- Plan & billing */}
            {tab === 'plan' && (
              <>
                <section className="plan">
                  <div className="kicker"><Zap width={14} height={14} /> Plan &amp; credits</div>
                  <div className="big">
                    <b>{credits ?? '—'}</b>
                    <span>credits remaining · 1 per design</span>
                  </div>
                  <div className="bar"><i style={{ width: `${fraction * 100}%` }} /></div>

                  <div className="state">
                    {active && <span className="dot" />}
                    {active ? (
                      <div>
                        <b>Think Decor plan · {subscription?.cancel_at_period_end ? 'cancelling' : 'active'}</b>
                        {periodEnd && (
                          <span>
                            {subscription?.cancel_at_period_end ? `Cancels ${periodEnd}` : `Renews ${periodEnd}`} · {PHASE1_PLAN.credits} credits each month
                          </span>
                        )}
                      </div>
                    ) : (
                      <div>
                        <b>Free</b>
                        <span>No active plan.</span>
                      </div>
                    )}
                  </div>

                  <div className="acts">
                    {!active && (
                      <Link to="/pricing" className="btn btn-w">Upgrade — {INTRO} first month, then {MONTHLY}</Link>
                    )}
                    {!active && (
                      <button type="button" className="btn btn-g" onClick={refreshBilling} disabled={refreshingBilling}>
                        {refreshingBilling && <Spinner />} Paid already? Refresh
                      </button>
                    )}
                    {subscription && (
                      <button type="button" className="btn btn-g" onClick={manageBilling} disabled={openingPortal}>
                        {openingPortal ? <Spinner /> : <ExternalLink width={15} height={15} />} Manage billing
                      </button>
                    )}
                  </div>
                  {subscription && <p className="note2">Cancel, change your card or download invoices.</p>}
                </section>

                <section className="plan" style={{ marginTop: 20 }}>
                  <div className="kicker"><Gift width={14} height={14} /> Invite friends</div>
                  <div className="big" style={{ fontSize: 15, fontWeight: 500 }}>
                    Share your link — you both get {REFERRAL_BONUS_CREDITS} free {REFERRAL_BONUS_CREDITS === 1 ? 'redesign' : 'redesigns'} when they sign up.
                  </div>
                  {referralCode && (
                    <div className="acts" style={{ marginTop: 14 }}>
                      <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, padding: '10px 14px', borderRadius: 999, background: 'var(--mist)' }}>
                        {referralUrlFor(referralCode)}
                      </code>
                      <button type="button" className="btn btn-w" onClick={copyReferralLink}>
                        <Copy width={15} height={15} /> Copy link
                      </button>
                    </div>
                  )}
                  {!!referralCount && (
                    <p className="note2">{referralCount} {referralCount === 1 ? 'friend has' : 'friends have'} joined with your link.</p>
                  )}
                </section>
              </>
            )}

            {/* --------------------------------------------------------- Support */}
            {tab === 'support' && (
              <form className="scard" onSubmit={submitTicket}>
                <h3>Raise a query</h3>
                <p className="lede">Something not working, or a question about your account? We'll reply right here.</p>
                <div className="fgrid" style={{ marginTop: 22 }}>
                  <div className="fld full">
                    <label htmlFor="ticket-subject">Subject</label>
                    <input id="ticket-subject" className="inp" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="e.g. My last design didn't generate" required />
                  </div>
                  <div className="fld full">
                    <label htmlFor="ticket-message">Message</label>
                    <textarea id="ticket-message" className="inp" value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} rows={5} required placeholder="Tell us what happened…" />
                  </div>
                </div>
                <div className="scard-foot">
                  <button type="submit" className="btn btn-dark" disabled={raiseTicket.isPending}>
                    {raiseTicket.isPending && <Spinner />} Send query
                  </button>
                </div>

                {!!tickets?.length && (
                  <div className="tkts">
                    {tickets.map((t) => (
                      <div key={t.id} className="tkt">
                        <div className="row">
                          <b>{t.subject}</b>
                          <span className={`sbadge ${t.status}`}>{t.status}</span>
                        </div>
                        <p>{t.message}</p>
                        {t.admin_reply && (
                          <div className="reply"><b>Reply: </b>{t.admin_reply}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
