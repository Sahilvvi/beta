import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Clapperboard, Columns3, Download, Link2, RefreshCw, Share2, Trash2, X } from 'lucide-react';

import { SEO } from '@/components/shared/SEO';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StoredCompare, StoredImage } from '@/components/app/StoredImage';
import { ShopThisLook } from '@/components/app/ShopThisLook';
import {
  type Generation, downloadStoredImage, fileNameFor, formatDate, isSetupError, shareUrlFor, titleFor,
  useDeleteGeneration, useGenerations, useShareGeneration, useStoredImageUrl,
} from '@/lib/generation';
import { ReelGenerator } from '@/components/app/ReelGenerator';

function download(g: Generation) {
  if (g.output_image_url) downloadStoredImage(g.output_image_url, fileNameFor(g.output_image_url, `thinkdecor-${g.id.slice(0, 8)}`));
}

/** Cleanup/Replace rows are edited again in their own tool, not redesigned in Create. */
const isMaskEdit = (g: Generation) => g.kind === 'cleanup' || g.kind === 'replace';

/** Everything the search box matches against: the title, the prompt and the tool name. */
const searchTextFor = (g: Generation) => [titleFor(g), g.prompt ?? '', g.kind ?? 'redesign'].join(' ').toLowerCase();

export default function Library() {
  const { data: generations, isLoading, error } = useGenerations();
  const deleteGeneration = useDeleteGeneration();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewing, setViewing] = useState<Generation | null>(null);
  const [confirming, setConfirming] = useState<Generation | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const shareGeneration = useShareGeneration();
  const [reelFor, setReelFor] = useState<Generation | null>(null);
  const reelBefore = useStoredImageUrl(reelFor?.input_image_url);
  const reelAfter = useStoredImageUrl(reelFor?.output_image_url ?? undefined);
  const MAX_COMPARE = 4;

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= MAX_COMPARE) {
        toast.error(`Compare up to ${MAX_COMPARE} designs at once.`);
        return prev;
      }
      return [...prev, id];
    });
  };
  const exitCompareMode = () => { setComparing(false); setCompareIds([]); };
  const compareSet = generations?.filter((g) => compareIds.includes(g.id)) ?? [];

  const query = (searchParams.get('q') ?? '').trim().toLowerCase();
  const visible = query
    ? generations?.filter((g) => searchTextFor(g).includes(query))
    : generations;

  // Overview links straight to one design with ?open=<id>.
  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId || !generations) return;
    const match = generations.find((g) => g.id === openId);
    if (match) setViewing(match);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, generations, searchParams, setSearchParams]);

  const regenerate = (g: Generation) => {
    if (isMaskEdit(g)) {
      navigate(`/app/${g.kind}`, { state: { inputPath: g.input_image_url } });
      return;
    }
    navigate('/app/create', {
      state: {
        inputPath: g.input_image_url,
        templateKey: g.template_key,
        roomType: g.room_type,
        prompt: g.prompt,
      },
    });
  };

  const handleDelete = async () => {
    if (!confirming) return;
    try {
      await deleteGeneration.mutateAsync(confirming);
      toast.success('Design deleted');
      if (viewing?.id === confirming.id) setViewing(null);
    } catch {
      toast.error("Couldn't delete that design. Please try again.");
    } finally {
      setConfirming(null);
    }
  };

  return (
    <>
      <SEO title="Projects | Think Decor" description="Every room you've redesigned." />

      <section className="panel">
        <div className="ph">
          <div className="r">
            <div className="kicker">Projects · Saved automatically</div>
            <h1>Projects</h1>
            <p className="sub">
              {query
                ? `${visible?.length ?? 0} ${visible?.length === 1 ? 'result' : 'results'} for "${searchParams.get('q')}"`
                : generations && generations.length > 0
                  ? `${generations.length} ${generations.length === 1 ? 'design' : 'designs'} saved`
                  : '0 designs'}
              <span className="sep" />Every design you create is saved here
            </p>
          </div>
          <div className="actions r" style={{ ['--i' as string]: 1 }}>
            {generations && generations.length > 1 && (
              comparing ? (
                <button type="button" className="btn btn-line" onClick={exitCompareMode}>
                  <X width={15} height={15} /> Cancel
                </button>
              ) : (
                <button type="button" className="btn btn-line" onClick={() => setComparing(true)}>
                  <Columns3 width={15} height={15} /> Compare
                </button>
              )
            )}
            <Link className="btn btn-dark" to="/app/create">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              New design
            </Link>
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
                ? 'Your projects switch on once the latest database update is applied.'
                : "We couldn't load your projects. Refresh to try again."}
            </div>
          </div>
        ) : !generations || generations.length === 0 ? (
          <div className="empty" style={{ marginTop: 20 }}>
            <div className="frames">
              <i /><i />
              <i>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              </i>
            </div>
            <div>
              <h4>Your rooms will <em>live here</em></h4>
              <p>Redesign a room and it appears here, ready to compare before and after, download, or refine with another prompt.</p>
            </div>
            <Link className="btn btn-dark" to="/app/create">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Create a design
            </Link>
          </div>
        ) : !visible || visible.length === 0 ? (
          <div className="empty" style={{ marginTop: 20, gridTemplateColumns: '1fr' }}>
            <div style={{ textAlign: 'center' }}>
              <h4>No matching projects</h4>
              <p>Nothing saved matches "{searchParams.get('q')}" — try a different search.</p>
              <Link to="/app/library" className="btn btn-line" style={{ marginTop: 14 }}>Clear search</Link>
            </div>
          </div>
        ) : (
          <div className="dgrid">
            {visible.map((g, i) => {
              const selected = compareIds.includes(g.id);
              return (
                <div key={g.id} className="dcard r" style={{ ['--i' as string]: i }}>
                  <button
                    type="button"
                    onClick={() => (comparing ? toggleCompare(g.id) : setViewing(g))}
                    className="pic"
                    style={{ width: '100%', display: 'block', position: 'relative' }}
                    aria-label={comparing ? `${selected ? 'Remove' : 'Add'} ${titleFor(g)} ${selected ? 'from' : 'to'} compare` : `Open ${titleFor(g)}`}
                  >
                    <StoredImage src={g.output_image_url ?? g.input_image_url} alt={titleFor(g)} />
                    {comparing && (
                      <span
                        style={{
                          position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 999,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: selected ? 'var(--brass)' : 'rgba(0,0,0,.45)',
                          boxShadow: selected ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.8)',
                        }}
                      >
                        {selected && <Check width={15} height={15} color="#fff" />}
                      </span>
                    )}
                  </button>
                  <div className="bd" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4>{titleFor(g)}</h4>
                      <div className="m">{formatDate(g.created_at)}</div>
                    </div>
                    {!comparing && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button type="button" className="ico-btn" title="Download" aria-label="Download" onClick={() => download(g)}><Download width={16} height={16} /></button>
                        <button type="button" className="ico-btn" title={isMaskEdit(g) ? 'Edit again' : 'Regenerate'} aria-label={isMaskEdit(g) ? 'Edit again' : 'Regenerate'} onClick={() => regenerate(g)}><RefreshCw width={16} height={16} /></button>
                        <button type="button" className="ico-btn danger" title="Delete" aria-label="Delete" onClick={() => setConfirming(g)}><Trash2 width={16} height={16} /></button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Floating compare bar */}
      {comparing && compareIds.length > 0 && (
        <div
          style={{
            position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40,
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 18px',
            borderRadius: 999, background: 'var(--char)', color: '#fff', boxShadow: '0 20px 44px -16px rgba(0,51,44,.55)',
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
            {compareIds.length} {compareIds.length === 1 ? 'design' : 'designs'} selected
          </span>
          <button
            type="button"
            className="btn btn-w btn-sm"
            disabled={compareIds.length < 2}
            onClick={() => setShowCompare(true)}
          >
            Compare
          </button>
        </div>
      )}

      {/* Compare view */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="max-w-6xl">
          <DialogTitle>Compare {compareSet.length} designs</DialogTitle>
          <DialogDescription>Side by side, so you can see which look actually wins.</DialogDescription>
          <div
            style={{
              display: 'grid', gap: 14, marginTop: 4,
              gridTemplateColumns: `repeat(${Math.min(compareSet.length, 2)}, 1fr)`,
            }}
          >
            {compareSet.map((g) => (
              <div key={g.id} className="rounded-2xl overflow-hidden" style={{ boxShadow: 'inset 0 0 0 1px var(--stone-2)' }}>
                <StoredImage src={g.output_image_url ?? g.input_image_url} alt={titleFor(g)} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '10px 14px' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{titleFor(g)}</p>
                  <p style={{ fontSize: 12, color: 'var(--taupe)' }}>{formatDate(g.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail view */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          {viewing && (
            <>
              <DialogTitle>{titleFor(viewing)}</DialogTitle>
              <DialogDescription>
                Created {formatDate(viewing.created_at)} — drag to compare your photo with the result.
              </DialogDescription>
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <StoredCompare before={viewing.input_image_url} after={viewing.output_image_url} generationId={viewing.id} />
              </div>
              <ShopThisLook generationId={viewing.id} />
              {viewing.prompt && (
                <p className="rounded-xl bg-secondary px-4 py-3 text-[13.5px] text-foreground/70">
                  <span className="font-semibold text-foreground">Your request: </span>
                  {viewing.prompt}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(viewing)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13.5px] font-medium text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => regenerate(viewing)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13.5px] font-medium text-foreground hover:bg-secondary"
                >
                  <RefreshCw className="h-4 w-4" /> {isMaskEdit(viewing) ? 'Edit again' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  onClick={() => setReelFor(viewing)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13.5px] font-medium text-foreground hover:bg-secondary"
                >
                  <Clapperboard className="h-4 w-4" /> Create reel
                </button>
                <button
                  type="button"
                  disabled={shareGeneration.isPending}
                  onClick={async () => {
                    if (viewing.share_slug) {
                      await navigator.clipboard.writeText(shareUrlFor(viewing.share_slug));
                      toast.success('Share link copied');
                      return;
                    }
                    try {
                      const slug = await shareGeneration.mutateAsync({ generation: viewing, shared: true });
                      if (slug) {
                        await navigator.clipboard.writeText(shareUrlFor(slug));
                        toast.success('Public link created and copied');
                        setViewing((v) => (v ? { ...v, share_slug: slug } : v));
                      }
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13.5px] font-medium text-foreground hover:bg-secondary"
                >
                  {viewing.share_slug ? <Link2 className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  {viewing.share_slug ? 'Copy link' : 'Share'}
                </button>
                <button
                  type="button"
                  onClick={() => download(viewing)}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13.5px] font-semibold text-primary-foreground"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ReelGenerator
        open={!!reelFor}
        onClose={() => setReelFor(null)}
        beforeUrl={reelBefore}
        afterUrl={reelAfter}
        label={reelFor ? titleFor(reelFor).split(' · ')[0] : ''}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this design?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your projects, along with its stored image. This can't be undone, and the
              credit isn't refunded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
