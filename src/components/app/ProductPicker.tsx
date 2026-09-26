import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PRICE_BANDS, productShopUrl, setProductSaved, useSavedProducts, useSimilarProducts, type Product,
} from '@/lib/products';

/** Budget presets as chips, plus free Min/Max fields for anything else. */
export function BudgetFilter({ min, max, onChange }: { min: string; max: string; onChange: (min: string, max: string) => void }) {
  const active = PRICE_BANDS.find((b) => String(b.min ?? '') === min && String(b.max ?? '') === max);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {PRICE_BANDS.map((b) => {
          const on = active === b;
          return (
            <button
              key={b.label}
              type="button"
              className={`pchip${on ? ' on' : ''}`}
              style={{ fontSize: 12 }}
              onClick={() => (on ? onChange('', '') : onChange(String(b.min ?? ''), String(b.max ?? '')))}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Budget $</span>
        <input
          type="number" min={0} inputMode="numeric" placeholder="Min" aria-label="Minimum price"
          value={min} onChange={(e) => onChange(e.target.value, max)}
          className="field" style={{ height: 30, width: 72, paddingInline: 8, fontSize: 12.5 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>–</span>
        <input
          type="number" min={0} inputMode="numeric" placeholder="Max" aria-label="Maximum price"
          value={max} onChange={(e) => onChange(min, e.target.value)}
          className="field" style={{ height: 30, width: 72, paddingInline: 8, fontSize: 12.5 }}
        />
        {(min || max) && (
          <button type="button" className="ico-btn" title="Clear budget" onClick={() => onChange('', '')}>
            <X width={12} height={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Heart toggle backed by public.saved_products ("My picks"). */
export function SaveHeart({ productId, size = 18, style }: { productId: string; size?: number; style?: React.CSSProperties }) {
  const qc = useQueryClient();
  const { data: saved } = useSavedProducts();
  const [busy, setBusy] = useState(false);
  const isSaved = !!saved?.some((p) => p.id === productId);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await setProductSaved(productId, !isSaved);
      await qc.invalidateQueries({ queryKey: ['saved-products'] });
      if (!isSaved) toast.success('Saved to My picks');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isSaved ? 'Remove from My picks' : 'Save to My picks'}
      aria-pressed={isSaved}
      style={{
        width: size, height: size, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.55)', ...style,
      }}
    >
      <Heart width={size * .56} height={size * .56} color="#fff" fill={isSaved ? '#fff' : 'none'} />
    </button>
  );
}

/** One square catalog tile: select toggle, save heart, and a shop link. */
export function ProductTile({ product, selected, onToggle }: { product: Product; selected: boolean; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={product.price != null ? `${product.name} · ${product.currency} ${product.price}` : product.name}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', padding: 0, cursor: 'pointer',
        boxShadow: selected ? '0 0 0 2px var(--brass)' : 'inset 0 0 0 1px var(--stone-2)',
      }}
    >
      <img src={product.display_image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {selected && (
        <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--brass)', borderRadius: 999, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check width={11} height={11} color="#fff" />
        </span>
      )}
      <SaveHeart productId={product.id} size={18} style={{ position: 'absolute', top: 4, left: 4 }} />
      {product.source_url && (
        <a
          href={productShopUrl(product.id)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Visit ${product.name}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.55)', borderRadius: 999,
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ExternalLink width={10} height={10} color="#fff" />
        </a>
      )}
      {product.price != null && (
        <span style={{ position: 'absolute', bottom: 4, right: 4, padding: '2px 6px', borderRadius: 999, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
          {product.currency === 'USD' ? '$' : product.currency === 'GBP' ? '£' : ''}{Math.round(product.price)}
        </span>
      )}
    </div>
  );
}

/** Same-category, similar-price alternatives to the most recently chosen product. */
export function MoreLikeThis({ product, selectedIds, onToggle }: { product: Product; selectedIds: string[]; onToggle: (product: Product) => void }) {
  const { data: similar } = useSimilarProducts(product);
  if (!similar?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        More like <b style={{ color: 'var(--ink)' }}>{product.name.length > 34 ? `${product.name.slice(0, 34)}…` : product.name}</b>
      </p>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '64px', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {similar.map((p) => (
          <ProductTile key={p.id} product={p} selected={selectedIds.includes(p.id)} onToggle={() => onToggle(p)} />
        ))}
      </div>
    </div>
  );
}
