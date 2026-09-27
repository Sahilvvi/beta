import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { SEO } from '@/components/shared/SEO';
import { BeforeAfterSlider } from '@/components/shared/BeforeAfterSlider';
import { Reveal } from '@/components/premium/Motion';
import { roomLabel, templateByKey, type RoomType } from '@/lib/templates';
import { savePendingRemix } from '@/lib/remix';

interface SharedDesign {
  id: string;
  before: string;
  after: string;
  templateKey: string | null;
  roomType: RoomType | null;
  kind?: string;
  prompt?: string | null;
  createdAt: string;
}

/** Public, sign-in-free page for a shared design (thinkdecor.app/r/<slug>) —
 *  reads through the public-share edge function, never the private
 *  `generations` table directly. */
export default function Share() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [design, setDesign] = useState<SharedDesign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const remixThisStyle = () => {
    if (!design) return;
    savePendingRemix({ templateKey: design.templateKey, roomType: design.roomType, prompt: design.prompt });
    navigate('/app/create');
  };

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-share?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(data?.error ?? "This link isn't available."); return; }
        setDesign(data);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load this design."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const label = design?.templateKey
    ? templateByKey(design.templateKey)?.label
    : design?.roomType
      ? roomLabel(design.roomType)
      : 'this room';

  return (
    <>
      <SEO
        title={design ? `${label} redesign — Think Decor` : 'A shared redesign — Think Decor'}
        description="See this room before and after, redesigned by Mantha AI — then try it on your own room, free."
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-28">
          <section className="px-3 pb-20 pt-6 sm:px-4">
            <div className="container mx-auto max-w-[900px] px-6 sm:px-8">
              <Reveal className="mb-10 text-center">
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                  Shared by a Think Decor user
                </p>
                <h1 className="mx-auto mt-4 max-w-[26ch] font-display text-[clamp(1.9rem,4.5vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.02em] text-foreground">
                  {design ? <>See <em className="italic font-normal text-primary">{label}</em>, redesigned</> : 'A shared redesign'}
                </h1>
              </Reveal>

              {loading ? (
                <div className="w-full animate-pulse rounded-[24px] bg-secondary" style={{ aspectRatio: '4 / 3' }} />
              ) : error || !design ? (
                <div className="py-12 text-center">
                  <p className="text-[16px] text-foreground/70">{error ?? "This link isn't available."}</p>
                  <Link
                    to="/app/create"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-[14.5px] font-semibold text-primary-foreground transition-transform duration-300 hover:scale-[1.03]"
                  >
                    Try it on your room <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <Reveal>
                  <div className="overflow-hidden rounded-[24px] ring-1 ring-inset ring-border">
                    <BeforeAfterSlider
                      beforeSrc={design.before}
                      afterSrc={design.after}
                      beforeAlt="Before"
                      afterAlt="After — redesigned by Mantha AI"
                      aspectRatio="aspect-[4/3]"
                    />
                  </div>
                  <div className="mt-9 text-center">
                    <p className="text-[16px] text-foreground/70">
                      Upload your own room photo and see it redesigned in seconds.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      {design.templateKey && (
                        <button
                          type="button"
                          onClick={remixThisStyle}
                          className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-[14.5px] font-semibold text-primary-foreground transition-transform duration-300 hover:scale-[1.03]"
                        >
                          <Sparkles className="h-4 w-4" /> Remix this style
                        </button>
                      )}
                      <Link
                        to="/app/create"
                        className={
                          design.templateKey
                            ? 'inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[14.5px] font-semibold text-foreground/85 ring-1 ring-inset ring-border transition-colors hover:text-foreground hover:ring-foreground/40'
                            : 'inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-[14.5px] font-semibold text-primary-foreground transition-transform duration-300 hover:scale-[1.03]'
                        }
                      >
                        Try it on your room <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </Reveal>
              )}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
