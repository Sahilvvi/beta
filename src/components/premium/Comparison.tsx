import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Camera, Sofa, Layers, Ruler, Tag, FolderCheck, Check, Minus,
} from 'lucide-react';
import { Reveal } from './Motion';
import { useInViewOrStacked } from '../motion/StackPanels';

/**
 * Comparison — rebuilt to match the design prototype's layout closely: a
 * light card, a score ring for each side, and a feature grid with the
 * Think Decor column picked out as a solid teal band running the full
 * height of the table (not a dark glass panel, which is the old look).
 */

type Verdict = 'yes' | 'partly' | 'no';

interface Row {
  icon: typeof Camera;
  feature: string;
  detail: string;
  us: Verdict;
  them: Verdict;
}

const ROWS: Row[] = [
  {
    icon: Camera, feature: 'Works from one phone photo', detail: 'No 3D scan, no measuring tape',
    us: 'yes', them: 'yes',
  },
  {
    icon: Sofa, feature: 'Keeps your real furniture', detail: 'Only the surfaces you pick change',
    us: 'yes', them: 'partly',
  },
  {
    icon: Layers, feature: 'Paint, wallpaper and floor', detail: 'All three in one preview',
    us: 'yes', them: 'partly',
  },
  {
    icon: Ruler, feature: 'Correct wall perspective', detail: "Patterns follow the wall's angle",
    us: 'yes', them: 'partly',
  },
  {
    icon: Tag, feature: 'Tap furniture to see price', detail: 'Tagged items with what they cost',
    us: 'yes', them: 'no',
  },
  {
    icon: FolderCheck, feature: 'Auto-save to your folder', detail: 'Every preview kept, ready to share',
    us: 'yes', them: 'partly',
  },
];

const BUILT_FOR = ['Homeowners', 'Renters', 'Interior designers', 'Décor retailers'];

function ScoreRing({ label, value, total, hero = false }: { label: string; value: number; total: number; hero?: boolean }) {
  const pct = (value / total) * 100;
  return (
    <div className="grid justify-items-center gap-2">
      <div
        className="relative grid h-[92px] w-[92px] place-items-center rounded-full"
        style={{
          background: hero
            ? 'conic-gradient(from 200deg, #00A08C, #00594E, #00A08C)'
            : `conic-gradient(#9DCFC6 ${pct}%, #E3EFEC 0)`,
          boxShadow: hero ? '0 16px 30px -14px rgba(0,89,78,0.7)' : undefined,
        }}
      >
        <div className="absolute inset-[9px] rounded-full bg-card shadow-[inset_2px_2px_6px_rgba(0,60,52,0.18)]" />
        <b className="relative font-display text-[30px] font-medium leading-none text-primary">
          {value}<small className="text-[14px] text-muted-foreground">/{total}</small>
        </b>
      </div>
      <span className={`font-label text-[13px] font-bold ${hero ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}

function VerdictMark({ verdict, play, delay }: { verdict: Verdict; play: boolean; delay: number }) {
  const reduce = useReducedMotion();
  if (verdict === 'yes') {
    return (
      <motion.span
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={play ? { scale: 1, opacity: 1 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 18, delay }}
        className="grid h-8 w-8 place-items-center rounded-full bg-white text-primary shadow-[0_6px_14px_-6px_rgba(0,0,0,0.4)]"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </motion.span>
    );
  }
  if (verdict === 'partly') {
    return (
      <span
        className="h-6 w-6 rounded-full shadow-[inset_0_0_0_1.5px_#00A08C]"
        style={{ background: 'conic-gradient(#00A08C 0 50%, transparent 0)' }}
        aria-label="Partly"
      />
    );
  }
  return <span className="h-6 w-6 rounded-full shadow-[inset_0_0_0_1.5px_#C9DEDA]" aria-label="No" />;
}

export function Comparison() {
  const viewRef = useRef<HTMLDivElement>(null);
  const play = useInViewOrStacked(viewRef, { once: true, margin: '0px 0px -15% 0px' });
  const usScore = ROWS.filter((r) => r.us === 'yes').length;
  const themScore = ROWS.reduce((n, r) => n + (r.them === 'yes' ? 1 : r.them === 'partly' ? 0.5 : 0), 0);

  return (
    <section id="comparison" className="relative scroll-mt-24 bg-card py-16 lg:py-24">
      <div className="container mx-auto max-w-[1140px] px-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-7">
          <Reveal className="max-w-[640px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary">Comparison</p>
            <h2 className="mt-3 font-display text-[clamp(2rem,3.6vw,3.2rem)] font-medium leading-[1.02] text-foreground">
              Who we build for, <em className="italic text-[#00A08C]">and how we compare</em>
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="font-label text-[12.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Built for
              </span>
              <ul className="flex flex-wrap gap-2">
                {BUILT_FOR.map((s) => (
                  <li key={s} className="rounded-full bg-background px-3.5 py-1.5 font-label text-[14px] font-bold text-primary">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="flex items-center gap-4">
            <ScoreRing label="Think Decor" value={usScore} total={ROWS.length} hero />
            <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-background font-display text-[18px] italic text-primary shadow-[inset_2px_2px_5px_rgba(0,60,52,0.18),inset_-2px_-2px_5px_#fff]">
              vs
            </span>
            <ScoreRing label="Home AI" value={themScore} total={ROWS.length} />
          </Reveal>
        </div>

        {/* Mobile: a stacked card per feature — the desktop 3-column table
            below reads fine on a wide screen, but forcing the same
            560px-min grid into a narrow viewport meant either a squashed,
            misaligned table or a horizontal scrollbar. A card per row with
            the two verdicts side by side needs no min-width and never
            scrolls sideways. Both variants share one ref (on the wrapper
            below) so the in-view animation trigger works regardless of
            which one is actually visible at the current width. */}
        <div ref={viewRef}>
        <div className="mt-8 flex flex-col gap-3 md:hidden">
          {ROWS.map((row, i) => {
            const Icon = row.icon;
            return (
              <div key={row.feature} className="rounded-2xl border border-border bg-background px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-[linear-gradient(145deg,#FFFFFF,#E3F2EF)] text-primary shadow-[inset_0_0_0_1px_#D3E6E2,0_6px_14px_-8px_rgba(0,89,78,0.35)]">
                    <Icon className="h-[19px] w-[19px]" strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block font-label text-[14px] font-bold leading-tight text-foreground">{row.feature}</b>
                    <small className="block text-[12.5px] text-muted-foreground">{row.detail}</small>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-[#00594E] px-3 py-2">
                    <span className="font-label text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#8FE3D4]">Think Decor</span>
                    <VerdictMark verdict={row.us} play={play} delay={0.04 + i * 0.05} />
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2">
                    <span className="font-label text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Home AI</span>
                    <VerdictMark verdict={row.them} play={play} delay={0.06 + i * 0.05} />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-1 flex flex-wrap items-center gap-4 px-1 font-label text-[12.5px] font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-primary shadow-[inset_0_0_0_1.5px_#00594E]">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              Yes
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-5 w-5 rounded-full" style={{ background: 'conic-gradient(#00A08C 0 50%, transparent 0)', boxShadow: 'inset 0 0 0 1.5px #00A08C' }} />
              Partly
            </span>
            <span className="inline-flex items-center gap-2">
              <Minus className="h-3.5 w-3.5 text-[#9DBDB7]" />
              No
            </span>
          </div>

          <Link
            to="/pricing"
            className="mt-2 flex items-center justify-center rounded-full bg-primary px-5 py-3 text-center font-label text-[14.5px] font-bold text-primary-foreground shadow-[0_8px_18px_-8px_rgba(0,0,0,0.45)]"
          >
            Try it for 69p
          </Link>
        </div>

        <div className="relative mt-10 hidden overflow-x-auto pb-2 pt-4 md:block">
          <div className="relative grid min-w-[560px] grid-cols-[1.7fr_1fr_1fr]">
            {/* teal band behind the Think Decor column, full table height */}
            <div
              aria-hidden
              className="absolute inset-y-[-16px] left-[calc(41.7%+8px)] right-[calc(25%+8px)] -z-0 rounded-[26px] shadow-[0_30px_50px_-24px_rgba(0,89,78,0.75),inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{ background: 'linear-gradient(180deg, #00B39C 0%, #00A08C 18%, #00594E 78%, #00463D 100%)' }}
            />

            <div className="relative z-10 flex flex-col justify-end px-1 pb-4 font-label text-[12.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Basics
            </div>
            <div className="relative z-10 mx-2 flex flex-col items-center justify-end pb-4 text-center text-white">
              <span className="font-display text-[24px] font-medium leading-[1.1]">Think <i className="not-italic text-[#8FE3D4]">Decor</i></span>
              <span className="mt-1 font-label text-[11.5px] font-bold uppercase tracking-[0.12em] text-[#8FE3D4]">Our app</span>
            </div>
            <div className="relative z-10 flex flex-col items-center justify-end pb-4 text-center">
              <span className="font-label text-[17px] font-bold text-foreground">Home AI</span>
              <span className="mt-1 font-label text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Competitor</span>
            </div>

            {ROWS.map((row, i) => {
              const Icon = row.icon;
              return (
                <div key={row.feature} className="contents">
                  <div className="relative z-10 flex items-center gap-3.5 px-1 py-4">
                    <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[13px] bg-[linear-gradient(145deg,#FFFFFF,#E3F2EF)] text-primary shadow-[inset_0_0_0_1px_#D3E6E2,0_6px_14px_-8px_rgba(0,89,78,0.35)]">
                      <Icon className="h-[21px] w-[21px]" strokeWidth={1.7} />
                    </span>
                    <span>
                      <b className="block font-label text-[15.5px] font-bold text-foreground">{row.feature}</b>
                      <small className="hidden text-[13.5px] text-muted-foreground sm:block">{row.detail}</small>
                    </span>
                  </div>
                  <div className="relative z-10 mx-2 flex items-center justify-center py-4">
                    <VerdictMark verdict={row.us} play={play} delay={0.08 + i * 0.08} />
                  </div>
                  <div className="relative z-10 flex items-center justify-center py-4">
                    <VerdictMark verdict={row.them} play={play} delay={0.12 + i * 0.08} />
                  </div>
                </div>
              );
            })}

            <div className="relative z-10 flex flex-wrap items-center gap-4 px-1 pt-7 font-label text-[13px] font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white text-primary shadow-[inset_0_0_0_1.5px_#00594E]">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                Yes
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-[22px] w-[22px] rounded-full" style={{ background: 'conic-gradient(#00A08C 0 50%, transparent 0)', boxShadow: 'inset 0 0 0 1.5px #00A08C' }} />
                Partly
              </span>
              <span className="inline-flex items-center gap-2">
                <Minus className="h-3.5 w-3.5 text-[#9DBDB7]" />
                No
              </span>
            </div>
            <div className="relative z-10 mx-2 flex items-center justify-center pt-7">
              <Link
                to="/pricing"
                className="whitespace-nowrap rounded-full bg-white px-6 py-3 font-label text-[14.5px] font-bold text-primary shadow-[0_10px_22px_-10px_rgba(0,20,17,0.55)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                Try it for 69p
              </Link>
            </div>
            <div className="relative z-10 flex items-center justify-center pt-7 font-label text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {Math.round(themScore)} of {ROWS.length}
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
