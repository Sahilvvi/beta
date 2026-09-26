import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { SEO } from '@/components/shared/SEO';
import { BeforeAfterSlider } from '@/components/shared/BeforeAfterSlider';
import { roomLabel, templateByKey, type RoomType } from '@/lib/templates';

interface SharedDesign {
  id: string;
  before: string;
  after: string;
  templateKey: string | null;
  roomType: RoomType | null;
  kind?: string;
  createdAt: string;
}

/** Public, sign-in-free page for a shared design (thinkdecor.app/r/<slug>) —
 *  reads through the public-share edge function, never the private
 *  `generations` table directly. */
export default function Share() {
  const { slug } = useParams<{ slug: string }>();
  const [design, setDesign] = useState<SharedDesign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      <Navbar />
      <main style={{ minHeight: '70vh' }}>
        <section style={{ maxWidth: 980, margin: '0 auto', padding: '64px 20px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <span className="kicker">Shared by a Think Decor user</span>
            <h1 style={{ marginTop: 10 }}>
              {design ? <>See <em>{label}</em>, redesigned</> : 'A shared redesign'}
            </h1>
          </div>

          {loading ? (
            <div className="w-full animate-pulse bg-secondary" style={{ aspectRatio: '4 / 3', borderRadius: 24 }} />
          ) : error || !design ? (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <p className="sub">{error ?? "This link isn't available."}</p>
              <Link to="/app/create" className="btn btn-dark" style={{ marginTop: 20 }}>
                Try it on your room <ArrowRight width={15} height={15} />
              </Link>
            </div>
          ) : (
            <>
              <div style={{ borderRadius: 24, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--stone-2)' }}>
                <BeforeAfterSlider
                  beforeSrc={design.before}
                  afterSrc={design.after}
                  beforeAlt="Before"
                  afterAlt="After — redesigned by Mantha AI"
                  aspectRatio="aspect-[4/3]"
                />
              </div>
              <div style={{ textAlign: 'center', marginTop: 36 }}>
                <p className="sub">Upload your own room photo and see it redesigned in seconds.</p>
                <Link to="/app/create" className="btn btn-dark" style={{ marginTop: 14 }}>
                  Try it on your room <ArrowRight width={15} height={15} />
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
