import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Reveal, staggerItem } from './Motion';
import { useInViewOrStacked } from '@/components/motion/StackPanels';

/**
 * Illustrative scenarios, NOT customer reviews. This used to be invented quotes with first names and
 * star ratings, which reads as fabricated reviews (a misleading-advertising risk in the UK and a trust
 * problem). Each card is now an honest "here is how people use it" scenario with no name or rating.
 * Swap in real, permissioned customer quotes here once there are some.
 */
const SLIDES = [
  { image: '/assets/rooms/t-teal.jpg', caption: 'Harbour Teal · Living room', name: 'Repainting', role: 'Try paint colours on your own wall',
    quote: 'See a bold colour like teal on your own wall for 69p before you buy four litres, and go a shade lighter if it is too much.' },
  { image: '/assets/rooms/room-bedroom.jpg', caption: 'Evening Noir · Bedroom', name: 'Furnishing', role: 'Price a whole room before you buy',
    quote: 'Tap a piece in the redesign to see what it costs, and price the whole room without leaving the sofa.' },
  { image: '/assets/rooms/s-scandi.jpg', caption: 'Scandinavian · Dining', name: 'Client previews', role: 'For interior designers',
    quote: 'Send a client a preview of their actual room instead of a mood board of stock photos.' },
  { image: '/assets/rooms/room-kitchen.jpg', caption: 'Warm Oak · Kitchen', name: 'Flooring', role: 'Swap floors, keep the furniture',
    quote: 'Swap the floor and the new material follows the angle of the room while your furniture stays put.' },
  { image: '/assets/rooms/tpl-wallpaper.jpg', caption: 'Star wallpaper · Nursery', name: 'Wallpaper', role: 'Compare patterns before you commit',
    quote: 'Wallpaper is expensive to get wrong. Try three patterns on the same wall first.' },
  { image: '/assets/rooms/room-hall.jpg', caption: 'Maximalism · Hall', name: 'Small spaces', role: 'Check dark walls will not shrink a room',
    quote: 'Not sure dark walls suit a tiny hallway? Preview them on your own photo before picking up a brush.' },
];

/**
 * Testimonials — a horizontal, scroll-snapped card track (not a grid):
 * prev/next buttons, dot indicators, autoplay every 5s that pauses on
 * hover/focus, and loops at either end. Sample quotes, not verified
 * reviews, same disclosure as the rest of the site's social proof.
 */
export function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null);
  const trackInView = useInViewOrStacked(trackRef, { once: true, margin: '0px 0px -10% 0px' });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const perView = usePerView();

  const scrollToIndex = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[i] as HTMLElement | undefined;
    if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      const maxIndex = Math.max(0, SLIDES.length - perView);
      let next = active + dir;
      if (next < 0) next = maxIndex;
      if (next > maxIndex) next = 0;
      setActive(next);
      scrollToIndex(next);
    },
    [active, perView, scrollToIndex],
  );

  // Sync the active dot to whatever the user actually scrolled/swiped to.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const card = track.children[0] as HTMLElement | undefined;
        const step = card ? card.offsetWidth + 20 : 1;
        setActive(Math.round(track.scrollLeft / step));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    // Also gated on trackInView so autoplay can't nudge the track while the
    // carousel is only partially scrolled into view — on mobile that read
    // as extra, unsettled motion on top of the page's own scroll.
    if (paused || !trackInView) return;
    const id = setInterval(() => go(1), 5000);
    return () => clearInterval(id);
  }, [paused, trackInView, go]);

  const dotCount = Math.max(1, SLIDES.length - perView + 1);

  return (
    <section
      id="testimonials"
      aria-roledescription="carousel"
      aria-label="Example use cases"
      className="relative scroll-mt-24 overflow-hidden py-16 lg:py-20"
    >
      <Reveal className="container relative z-10 mx-auto flex max-w-[1200px] flex-wrap items-end justify-between gap-6 px-6 sm:px-8">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Illustrative use cases · not customer reviews
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3.2rem)] font-medium leading-[1.05] text-foreground">
            How people use <em className="text-primary not-italic font-normal italic">Think Decor</em>
          </h2>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous example"
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-card text-primary shadow-[inset_0_0_0_1.5px_hsl(var(--primary))] transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next example"
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-card text-primary shadow-[inset_0_0_0_1.5px_hsl(var(--primary))] transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </Reveal>

      <motion.div
        ref={trackRef}
        tabIndex={0}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        }}
        initial="hidden"
        animate={trackInView ? 'show' : 'hidden'}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
        className="container mx-auto mt-10 grid auto-cols-[calc((100%-40px)/3)] grid-flow-col gap-5 overflow-x-auto px-6 pb-1 [scroll-snap-type:x_mandatory] [scrollbar-width:none] max-[1000px]:auto-cols-[calc((100%-20px)/2)] max-[640px]:auto-cols-[88%] sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
          {SLIDES.map((s) => (
            <motion.article
              key={s.name}
              variants={staggerItem}
              className="group flex flex-col overflow-hidden rounded-[22px] bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))] [scroll-snap-align:start] transition-all duration-300 hover:-translate-y-1 hover:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35),0_24px_40px_-26px_hsl(168_40%_15%/0.5)]"
            >
              <figure className="relative m-0 aspect-video overflow-hidden">
                <img
                  src={s.image}
                  alt={s.caption}
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-[hsl(168_100%_17%/0.8)] px-2.5 py-1.5 font-label text-[10.5px] font-medium uppercase tracking-[0.08em] text-white">
                  {s.caption}
                </figcaption>
              </figure>
              <div className="flex flex-1 flex-col gap-3.5 p-6">
                <blockquote className="flex-1 font-display text-[20px] leading-[1.35] text-primary">
                  {s.quote}
                </blockquote>
                <div className="flex items-center gap-3 border-t border-border pt-3.5">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] font-display text-[18px] text-white">
                    {s.name[0]}
                  </span>
                  <span>
                    <b className="block font-label text-[15.5px] font-bold text-primary">{s.name}</b>
                    <span className="text-[13.5px] leading-[1.3] text-muted-foreground">{s.role}</span>
                  </span>
                </div>
              </div>
            </motion.article>
          ))}
      </motion.div>

      <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
        {Array.from({ length: dotCount }).map((_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            onClick={() => { setActive(i); scrollToIndex(i); }}
            className={`h-2 rounded-full transition-all duration-300 ${i === Math.min(active, dotCount - 1) ? 'w-7 bg-primary' : 'w-2 bg-border'}`}
          />
        ))}
      </div>
    </section>
  );
}

/** Matches the track's own responsive auto-cols breakpoints, so dots/indices line up with what's actually visible. */
function usePerView() {
  const [perView, setPerView] = useState(3);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setPerView(w <= 640 ? 1 : w <= 1000 ? 2 : 3);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return perView;
}
