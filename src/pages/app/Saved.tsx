import { Link } from 'react-router-dom';
import { ExternalLink, Heart } from 'lucide-react';

import { SEO } from '@/components/shared/SEO';
import { SaveHeart } from '@/components/app/ProductPicker';
import { isSetupError, } from '@/lib/generation';
import { productShopUrl, useSavedProducts } from '@/lib/products';

export default function Saved() {
  const { data: saved, isLoading, error } = useSavedProducts();

  return (
    <>
      <SEO title="My picks | Think Decor" description="Real products you've saved from your redesigns." />

      <section className="panel">
        <div className="ph">
          <div className="r">
            <div className="kicker">My picks · Saved products</div>
            <h1>My picks</h1>
            <p className="sub">
              {saved && saved.length > 0 ? `${saved.length} ${saved.length === 1 ? 'product' : 'products'} saved` : '0 products'}
              <span className="sep" />Heart a real product anywhere in Create to keep it here
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="dgrid" style={{ marginTop: 24 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dcard" style={{ opacity: 0.5 }}><div className="pic" /></div>
            ))}
          </div>
        ) : error ? (
          <div className="note r" style={{ marginTop: 24 }}>
            <div className="ic">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>
            </div>
            <div>
              {isSetupError(error)
                ? 'My picks switches on once the latest database update is applied.'
                : "We couldn't load your saved products. Refresh to try again."}
            </div>
          </div>
        ) : !saved || saved.length === 0 ? (
          <div className="empty" style={{ marginTop: 20 }}>
            <div className="frames">
              <i /><i />
              <i><Heart width={22} height={22} /></i>
            </div>
            <div>
              <h4>Nothing <em>saved</em> yet</h4>
              <p>Tap the heart on any real product while designing a room, and it lands here — ready to shop whenever you are.</p>
            </div>
            <Link className="btn btn-dark" to="/app/create">Start a design</Link>
          </div>
        ) : (
          <div className="dgrid" style={{ marginTop: 24 }}>
            {saved.map((p) => (
              <div key={p.id} className="dcard">
                <div className="pic" style={{ position: 'relative' }}>
                  <img src={p.display_image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <SaveHeart productId={p.id} size={30} style={{ position: 'absolute', top: 8, right: 8 }} />
                </div>
                <div className="bd">
                  <h4>{p.name}</h4>
                  <div className="m">
                    {p.price != null ? `${p.currency === 'USD' ? '$' : p.currency === 'GBP' ? '£' : `${p.currency} `}${p.price}` : p.brand ?? p.category}
                  </div>
                </div>
                {p.source_url && (
                  <a
                    href={productShopUrl(p.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-line btn-sm"
                    style={{ margin: '0 14px 14px' }}
                  >
                    Shop it <ExternalLink width={13} height={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
