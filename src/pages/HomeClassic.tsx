// The pre-walkthrough homepage, kept at /classic for side-by-side comparison while experimenting.
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FileDown, Clock, Smartphone, Gift, Mail,
} from 'lucide-react';

import { useRef, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { SEO } from '@/components/shared/SEO';
import { motion } from 'framer-motion';
import { IntroTakeover } from '@/components/motion/IntroTakeover';
import { Magnetic, Reveal, Stagger, staggerItem } from '@/components/premium/Motion';
import { FloorPlanStage } from '@/components/premium/FloorPlanStage';
import { FloorPlanRecognition } from '@/components/premium/FloorPlanRecognition';
import { DesignGenerator } from '@/components/premium/DesignGenerator';
import { EarlyBirdStrip } from '@/components/premium/EarlyBirdStrip';
import { Comparison } from '@/components/premium/Comparison';
import { PricingTeaser } from '@/components/premium/PricingTeaser';
import { AboutBlurb } from '@/components/premium/AboutBlurb';
import { Testimonials } from '@/components/premium/Testimonials';
import { BlogTeaser } from '@/components/premium/BlogTeaser';
import { CursorAura, ScrollProgress } from '@/components/motion/primitives';
import type { TrustItem } from '@/components/motion/hooks';
import { StackPanel, StackPanelGroup } from '@/components/motion/StackPanels';
import { HeroStage } from '@/components/motion/HeroStage';
import { HowItWorks } from '@/components/motion/HowItWorks';
import { HangingCta } from '@/components/motion/HangingCta';
import { NewsletterBand } from '@/components/motion/NewsletterBand';
import { FREE_SIGNUP_CREDITS } from '@/lib/generation';
import { PHASE1_PLAN, money, pence } from '@/lib/billing';
import { organizationSchema, softwareApplicationSchema, faqPageSchema } from '@/lib/schema';

/* ---------------------------------------------------------------- *
 *  Homepage — a motion-led layout: 3D hero, a pinned "how it works"
 *  story, the style carousel and an interactive Mantha explainer.
 *  Copy matches the product today: photo redesigns are live; room
 *  scanning, measured plans and exports are labelled "coming soon".
 * ---------------------------------------------------------------- */

const INTRO = pence(PHASE1_PLAN.introPrice ?? 0.69);
const MONTHLY = money(PHASE1_PLAN.monthly);

const CTA_TRUST: TrustItem[] = [
  { icon: Smartphone, t: 'No hardware needed' },
  { icon: Gift, t: `${FREE_SIGNUP_CREDITS} free redesigns` },
  { icon: FileDown, t: 'Download every design' },
];

const FAQS = [
  {
    q: 'What do I need to get started?',
    a: 'A photo of your room from any phone — straight-on, in daylight if you can. No special hardware, no measuring equipment.',
  },
  {
    q: 'How do credits work?',
    a: `Every account starts with ${FREE_SIGNUP_CREDITS} free redesigns, and each design or regeneration uses one credit. The Think Decor plan adds ${PHASE1_PLAN.credits} credits every month — ${INTRO} for your first month, then ${MONTHLY}.`,
  },
  {
    q: 'What is Mantha AI?',
    a: 'Mantha is the design intelligence inside Think Decor. Give it a photo, a style and a few words about what you want, and it restyles your actual room — keeping the walls, windows and layout you already have.',
  },
  {
    q: 'Can I change what the AI creates?',
    a: 'Yes. Regenerate for a new variation, or describe what to change — "lighter floors", "a green velvet sofa" — and Mantha refines the same photo. Every design is saved to your library to compare and download.',
  },
  {
    q: 'Can Think Decor measure my room?',
    a: 'Not yet. Room scanning with measured floor plans — and PDF, SVG and CAD exports — is in development. Today, Think Decor redesigns rooms from a photo.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. Manage or cancel your plan from Settings in your account, and it stays active until the end of the period you have already paid for.',
  },
];

/* ================================================================ */

// Plain in-memory flag — NOT sessionStorage/localStorage, which would
// survive a real refresh too. This only lives as long as the current JS
// execution context does: a genuine browser reload re-runs the whole
// module from scratch (flag back to false, intro plays), while React
// Router swapping back to "/" from another route (e.g. /signup, /contact)
// keeps this module alive (flag stays true, intro is skipped). That's the
// exact "only on a real refresh, never on in-app navigation" distinction
// this needs — the intro is unskippable and plays on every full load by
// product decision, but it was never meant to replay on every route change.
let introPlayedThisSession = false;

// Puppeteer, Playwright and every other automated browser set this flag —
// real visitors never have it. The prerender script (scripts/prerender.mjs)
// needs the actual page content in the DOM, not a paused video it has no
// way to scroll through, so an automated browser is treated the same as a
// returning visitor and skips straight past the intro.
const isAutomatedBrowser = typeof navigator !== 'undefined' && navigator.webdriver === true;

export default function HomeClassic() {
  // Page content stays invisible until the intro's video starts shrinking,
  // so it "arrives" alongside the video settling into the hero rather than
  // popping in only once the whole takeover finishes. Skipped entirely if
  // the intro already played earlier in this same browser session (see
  // `introPlayedThisSession` above), or for an automated browser (see
  // `isAutomatedBrowser` above).
  const skipIntro = introPlayedThisSession || isAutomatedBrowser;
  const [pageVisible, setPageVisible] = useState(skipIntro);
  const [introDone, setIntroDone] = useState(skipIntro);
  // The hero's own room photo, mounted underneath the intro the whole time
  // (just invisible) — its real on-screen box is what the video shrinks
  // into, measured live rather than guessed, so the handoff lines up on
  // any viewport.
  const heroStageBoxRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Think Decor | AI Interior Design From a Photo"
        description={`Upload a photo of any room and Mantha AI redesigns it in the style you choose. Start with ${FREE_SIGNUP_CREDITS} free redesigns, then ${INTRO} for your first month.`}
        canonical="https://www.thinkdecor.app/"
        schema={[
          organizationSchema(),
          softwareApplicationSchema({
            price: PHASE1_PLAN.introPrice ?? 0.69,
            currency: 'GBP',
            description: 'Upload a photo of any room and Mantha AI redesigns it in the style you choose, keeping the walls, windows and layout you already have.',
          }),
          faqPageSchema(FAQS),
        ]}
      />

      {!introDone && (
        <IntroTakeover
          onShrinkStart={() => setPageVisible(true)}
          onDone={() => { introPlayedThisSession = true; setIntroDone(true); }}
          getTargetRect={() => heroStageBoxRef.current?.getBoundingClientRect() ?? null}
        />
      )}

      <motion.div
        initial={false}
        animate={{ opacity: pageVisible ? 1 : 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <ScrollProgress />
        <CursorAura />
        <Navbar />

        <main className="relative z-10 overflow-clip">

        {/*
          Stacking panels: the landing page's signature scroll mechanic
          (ported from the design prototype). Each panel below sticks and
          the next one slides up over it, scaling and dimming as it's
          covered — a deck of cards, not a flat scroll. See StackPanels.tsx.

          Order matches the design prototype (Hero → How it works → offer
          strip → Mantha/templates → Testimonials → About → Comparison →
          Pricing → FAQ) exactly — every prototype section, in the
          prototype's own sequence, nothing from outside that list allowed
          to interrupt it. Everything below FAQ (Room Anatomy, Roadmap, AI
          Measurement, Floor Plan Recognition, Who it's for, final CTA,
          Newsletter) has no equivalent in the prototype — kept for now, to
          be arranged later.
        */}
        <StackPanelGroup className="px-3 sm:px-4">
          <StackPanel>
            <HeroStage onStageBoxMount={(el) => { heroStageBoxRef.current = el; }} />
          </StackPanel>

          <StackPanel className="bg-gradient-to-b from-white to-[#EEF8F6]">
            <HowItWorks />
          </StackPanel>

          <StackPanel>
            <EarlyBirdStrip />
          </StackPanel>

          <StackPanel>
            <DesignGenerator />
          </StackPanel>

          {/* StyleRing hidden — doesn't match the site's vibe (wrong/placeholder
              photos, e.g. an empty garage under "Warm Natural"). Needs a proper
              rebuild before it goes back in; tracked in the pending changes list. */}

          {/* ================= TESTIMONIALS ================= */}
          <StackPanel className="bg-gradient-to-b from-[#E6F4F1] to-white">
            <Testimonials />
          </StackPanel>

          {/* ================= ABOUT ================= */}
          <StackPanel>
            <AboutBlurb />
          </StackPanel>

          <StackPanel>
            <Comparison />
          </StackPanel>

          <StackPanel>
            <PricingTeaser />
          </StackPanel>

          {/* ============================ FAQ ============================ */}
          <StackPanel id="faq" className="relative scroll-mt-24 bg-background py-16 lg:py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(hsl(168_30%_20%/0.035)_1px,transparent_1px),linear-gradient(90deg,hsl(168_30%_20%/0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000,transparent)]" />
          </div>

          <div className="container relative mx-auto max-w-[1100px] px-6 sm:px-8">
            <Reveal className="mx-auto max-w-[640px] text-center">
              <p className="flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Questions
              </p>
              <h2 className="mt-4 text-[clamp(1.9rem,4vw,3.2rem)] font-bold tracking-[-0.02em] text-foreground">
                Everything worth asking.
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <Reveal delay={0.05}>
                <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(150deg,hsl(168_100%_14%),hsl(168_85%_20%)_60%,hsl(166_70%_27%))] p-7 text-white shadow-[0_30px_70px_-32px_hsl(168_100%_17%/0.55)] lg:sticky lg:top-28">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_80%_100%_at_20%_0%,#000,transparent)]"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[hsl(160_84%_45%)]/25 blur-3xl"
                  />
                  <div
                    aria-hidden
                    className="shine-sweep pointer-events-none absolute inset-y-0 -left-1/4 w-1/4 -skew-x-12 bg-[linear-gradient(90deg,transparent,hsl(0_0%_100%/0.25),transparent)] mix-blend-overlay"
                    style={{ animationDelay: '2s' }}
                  />

                  <p className="relative text-[17px] font-bold">Still unsure?</p>
                  <p className="relative mt-1.5 flex items-center gap-1.5 text-[13px] text-white/65">
                    <Clock className="h-3.5 w-3.5 text-mint" /> Replies within a day
                  </p>
                  <Magnetic className="relative mt-5 block w-max">
                    <a
                      href="mailto:info@thinkdecor.app"
                      className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-primary shadow-[0_10px_26px_-10px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:scale-[1.04] active:scale-[0.97]"
                    >
                      <Mail className="h-3.5 w-3.5" /> Ask us anything
                    </a>
                  </Magnetic>
                  <p className="relative mt-3 text-[12.5px] text-white/50">info@thinkdecor.app</p>
                </div>
              </Reveal>

              {/*
                Prototype-style list: a plain divider list with a serif
                question and a plus/minus toggle, not a stack of shadowed
                cards — closer to the prototype's own FAQ typography.
              */}
              <Stagger>
                <Accordion type="single" collapsible className="border-t-[1.5px] border-primary">
                  {FAQS.map((f, i) => (
                    <motion.div key={f.q} variants={staggerItem}>
                      <AccordionItem value={`q-${i}`} className="border-b border-border">
                        <AccordionTrigger className="group py-5 text-left font-display text-[clamp(18px,1.7vw,22px)] font-medium leading-[1.3] text-foreground hover:no-underline [&>span:last-child]:hidden">
                          {f.q}
                          <PlusMinusToggle />
                        </AccordionTrigger>
                        <AccordionContent className="max-w-[72ch] pb-6 pr-14 text-[14.5px] leading-relaxed text-foreground/68">
                          {f.a}
                        </AccordionContent>
                      </AccordionItem>
                    </motion.div>
                  ))}
                </Accordion>
              </Stagger>
            </div>
          </div>
          </StackPanel>

          {/*
            ── Not in the prototype ──
            Everything below has no equivalent section in the design
            prototype. Kept in the build for now; order/placement still to
            be decided.
          */}
          <StackPanel id="measurement" className="scroll-mt-24 bg-background py-16 lg:py-20">
            <div className="container mx-auto max-w-[1200px] px-6 sm:px-8">
              <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
                <div>
                  <Reveal>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary">Coming soon</p>
                    <h2 className="mt-5 text-[clamp(2rem,4.2vw,3.2rem)] font-bold leading-[1.06] tracking-[-0.025em] text-foreground">
                      AI Measurement
                    </h2>
                    <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-foreground/58">
                      Record a room with your phone and Think Decor returns a precise, editable
                      floor plan — wall lengths, room dimensions, doors, windows and total area.
                      In minutes, not site visits — arriving with the Think Decor scanning app.
                    </p>
                  </Reveal>
                </div>

                <Reveal y={36} blur={16}>
                  <FloorPlanStage />
                </Reveal>
              </div>
            </div>
          </StackPanel>

          <StackPanel>
            <FloorPlanRecognition />
          </StackPanel>

          {/* ========================= FINAL CTA ========================= */}
          <StackPanel>
            <HangingCta trust={CTA_TRUST} freeCredits={FREE_SIGNUP_CREDITS} />
          </StackPanel>

          {/* ========================= BLOG TEASER ========================= */}
          <StackPanel>
            <BlogTeaser />
          </StackPanel>

          {/* ========================= NEWSLETTER ========================= */}
          <StackPanel>
            <NewsletterBand />
          </StackPanel>
        </StackPanelGroup>

      </main>

        <Footer />
      </motion.div>
    </div>
  );
}

/** The FAQ list's plus/minus toggle — the prototype's own "tog" mark, not a chevron. */
function PlusMinusToggle() {
  return (
    <span className="relative ml-4 h-8 w-8 flex-none rounded-full shadow-[inset_0_0_0_1.5px_hsl(var(--border))] transition-colors duration-300 group-data-[state=open]:bg-primary">
      <span className="absolute left-1/2 top-1/2 h-[1.5px] w-3 -translate-x-1/2 -translate-y-1/2 bg-primary transition-colors duration-300 group-data-[state=open]:bg-primary-foreground" />
      <span className="absolute left-1/2 top-1/2 h-[1.5px] w-3 -translate-x-1/2 -translate-y-1/2 rotate-90 bg-primary transition-transform duration-300 group-data-[state=open]:rotate-0 group-data-[state=open]:bg-primary-foreground" />
    </span>
  );
}
