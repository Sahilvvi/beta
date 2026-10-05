import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Minus, Plus, Calculator } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { PHASE1_PLAN, money, pence } from '@/lib/billing';
import { FREE_SIGNUP_CREDITS } from '@/lib/generation';

/**
 * "What will my project cost?" — rooms × looks per room → redesigns needed,
 * then how much of the plan that is. Every number comes from billing.ts and
 * generation.ts (free signup credits, credits per month, intro and monthly
 * price), so it can't quote something Stripe wouldn't charge.
 */

function estimate(designs: number) {
  const plan = PHASE1_PLAN;
  const intro = plan.introPrice ?? plan.monthly;
  if (designs <= FREE_SIGNUP_CREDITS) return { months: 0, total: 0 };
  const months = Math.ceil((designs - FREE_SIGNUP_CREDITS) / plan.credits);
  return { months, total: intro + (months - 1) * plan.monthly };
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

export function ProjectCalculator() {
  const [rooms, setRooms] = useState(3);
  const [looks, setLooks] = useState(4);
  const designs = rooms * looks;
  const { months, total } = estimate(designs);
  const perDesign = designs ? total / designs : 0;
  const plan = PHASE1_PLAN;

  return (
    <div className="mx-auto mt-6 max-w-[640px] rounded-[20px] border border-border bg-background p-6 shadow-[0_20px_50px_-30px_hsl(168_30%_15%/0.35)] sm:p-7">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
        <Calculator className="h-3.5 w-3.5" /> What will my project cost?
      </p>

      <div className="mt-6 grid gap-7 sm:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-6">
          <div>
            <div className="mb-3 flex items-baseline justify-between text-[14px]">
              <span className="font-medium text-foreground">Rooms to redesign</span>
              <b className="font-display text-[22px] font-medium text-primary">{rooms}</b>
            </div>
            <Slider value={[rooms]} min={1} max={10} step={1} onValueChange={([v]) => setRooms(v)} aria-label="Rooms to redesign" />
          </div>
          <div className="flex items-center justify-between text-[14px]">
            <span className="font-medium text-foreground">Looks to try per room</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Fewer looks" onClick={() => setLooks((l) => Math.max(1, l - 1))} className="grid h-8 w-8 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-primary hover:text-primary">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <b className="w-6 text-center font-display text-[22px] font-medium text-primary">{looks}</b>
              <button type="button" aria-label="More looks" onClick={() => setLooks((l) => Math.min(12, l + 1))} className="grid h-8 w-8 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-primary hover:text-primary">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[16px] bg-[linear-gradient(150deg,hsl(168_100%_14%),hsl(168_85%_20%)_60%,hsl(166_70%_27%))] p-5 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[hsl(160_84%_45%)]/25 blur-2xl" />
          <p className="relative text-[12px] uppercase tracking-[0.14em] text-white/60">
            <AnimatedNumber value={designs} format={(n) => `${Math.round(n)}`} /> redesigns
          </p>
          <p className="relative mt-1 font-display text-[40px] font-medium leading-none">
            {total === 0 ? 'Free' : <AnimatedNumber value={total} format={(n) => money(n)} />}
          </p>
          <p className="relative mt-2 text-[13px] leading-snug text-white/75">
            {months === 0
              ? `Covered by your ${FREE_SIGNUP_CREDITS} free redesigns.`
              : months === 1
                ? `Fits in your first month (${plan.credits} redesigns) for ${pence(plan.introPrice ?? plan.monthly)}.`
                : `${months} months of the plan — ${pence(plan.introPrice ?? plan.monthly)}, then ${money(plan.monthly)}/month.`}
          </p>
          {total > 0 && (
            <p className="relative mt-3 border-t border-white/15 pt-3 text-[12.5px] text-[#8FE3D4]">
              ≈ <AnimatedNumber value={perDesign} format={(n) => pence(n)} /> per redesign
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-[11.5px] text-foreground/45">
        Estimate only — includes your {FREE_SIGNUP_CREDITS} free signup redesigns. Cancel any time.
      </p>
    </div>
  );
}
