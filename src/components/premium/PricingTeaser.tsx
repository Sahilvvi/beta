import { Link } from 'react-router-dom';
import { ArrowRight, CreditCard, ShieldCheck } from 'lucide-react';
import { PHASE1_PLAN, money, pence } from '@/lib/billing';
import { Magnetic, Reveal } from './Motion';
import { ProjectCalculator } from './ProjectCalculator';

/**
 * Pricing — restyled to match the design prototype's plan-card language
 * (rounded card, giant serif price, dot-bulleted features, a badge inset
 * from the corner rather than floating half outside the card). Think Decor
 * only sells one plan right now, so this stays a single featured card
 * instead of the prototype's three-tier grid — inventing tiers that don't
 * exist in billing.ts would mean CTAs that don't actually charge what they
 * claim to.
 *
 * The old badge sat at `top:0 -translate-y-1/2`, half outside the card and
 * right at the edge this section's StackPanel clips — that's the likely
 * cause of the glitch on scroll. This badge sits fully inside instead.
 */
export function PricingTeaser() {
  const plan = PHASE1_PLAN;

  return (
    <section id="pricing" className="relative scroll-mt-24 overflow-hidden bg-card py-16 lg:py-24">
      <div className="container relative mx-auto max-w-[1100px] px-6 sm:px-8">
        <Reveal className="mx-auto max-w-[640px] text-center">
          <p className="flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Pricing
          </p>
          <h2 className="mx-auto mt-4 font-display text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[1.05] text-foreground">
            Pick a plan that <em className="italic text-[#00A08C]">fits your project</em>
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mt-12 max-w-[420px]">
          <div className="relative flex flex-col gap-4 rounded-[20px] p-7 text-white shadow-[0_26px_44px_-20px_rgba(0,89,78,0.7)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_56px_-20px_rgba(0,89,78,0.8)]" style={{ background: 'linear-gradient(160deg, #00A08C 0%, #00594E 55%, #003B33 100%)' }}>
            <span className="absolute -top-3 left-6 rounded-full bg-[#00A08C] px-2.5 py-1.5 font-label text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-[0_8px_18px_-6px_rgba(0,89,78,0.6)]">
              Early access price
            </span>

            <span className="font-label text-[12px] font-medium uppercase tracking-[0.14em] text-[#8FE3D4]">{plan.name}</span>

            <div className="flex items-end gap-1.5">
              <span className="font-display text-[52px] font-medium leading-none tracking-[-0.02em]">{pence(plan.introPrice ?? 0.69)}</span>
              <small className="mb-1.5 text-[15px] text-white/70">first month</small>
            </div>
            <p className="-mt-2 text-[14px] text-white/70">
              then <span className="font-semibold text-white">{money(plan.monthly)}</span> a month · cancel anytime
            </p>

            <ul className="mt-2 grid gap-2.5 text-[15px]">
              {plan.features.slice(0, 6).map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-[#00A08C]" />
                  {f}
                </li>
              ))}
            </ul>

            <Magnetic className="mt-3 block">
              <Link
                to="/pricing"
                className="group flex items-center justify-center gap-2.5 rounded-full bg-[#00A08C] px-6 py-4 text-[14.5px] font-semibold text-white shadow-none transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Magnetic>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-white/60">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#8FE3D4]" /> Secure payment by Stripe</span>
              <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-[#8FE3D4]" /> Cancel any time</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <ProjectCalculator />
        </Reveal>
      </div>
    </section>
  );
}
