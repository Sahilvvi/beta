import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, Check, Download, ExternalLink, Loader2, Mic, MicOff, RotateCcw, Sparkles, X,
} from 'lucide-react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { MaskCanvas, type MaskCanvasHandle, type Stroke } from '@/components/app/MaskCanvas';
import { StoredCompare } from '@/components/app/StoredImage';
import { ShopThisLook } from '@/components/app/ShopThisLook';
import {
  FREE_SIGNUP_CREDITS, GenerationError, OutOfCreditsError, RateLimitError,
  downloadStoredImage, fileNameFor, isSetupError, labelMaskRegion, useCreditBalance, useGenerateMaskEdit,
  useStoredImageUrl, type Generation,
} from '@/lib/generation';
import { useAuthStore } from '@/stores/authStore';
import { PHASE1_PLAN, money, pence } from '@/lib/billing';
import { isActiveSubscription, useSubscription } from '@/hooks/useProfile';
import { searchProductsForPrompt, MAX_PRODUCTS_PER_GENERATION, type Product } from '@/lib/products';
import { BudgetFilter, MoreLikeThis, ProductTile } from '@/components/app/ProductPicker';

/** How long to wait after the last stroke before asking Gemini what's under the mask. */
const LABEL_DEBOUNCE_MS = 700;
/** How long to wait after the last keystroke before searching for real products matching the prompt. */
const PROMPT_PRODUCT_DEBOUNCE_MS = 700;
/** Roughly 3 rows before "View more" kicks in. */
const INITIAL_VISIBLE_PRODUCTS = 12;

const INTRO = pence(PHASE1_PLAN.introPrice ?? 0.69);
const MONTHLY = money(PHASE1_PLAN.monthly);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Quick-start categories shown before upload, in "replace" mode only — pre-fill the
 *  step-2 prompt so there's already a sensible starting point to edit. */
const REPLACE_SUGGESTIONS = [
  { label: 'Sofas', prompt: 'a different sofa' },
  { label: 'Rugs', prompt: 'a new rug' },
  { label: 'Lamps', prompt: 'a different lamp' },
  { label: 'Tables', prompt: 'a different table' },
];

/** A picked photo before any mask is painted on it. */
type Source = { kind: 'file'; file: File; preview: string } | { kind: 'stored'; path: string };

/**
 * Shared upload → paint a mask → generate → before/after flow behind both
 * Cleanup and Replace (see src/pages/app/Cleanup.tsx and Replace.tsx) — they
 * differ only in copy, the fixed vs. user-prompt request, and the server
 * prompt generate-redesign builds for `mode`. The "before" shown in the
 * result slider is deliberately the visitor's own clean photo, not the
 * red-marked one actually sent to the model — that's still their real photo,
 * just without editing instructions painted on it that were never part of
 * the room.
 */
export function MaskEditFlow({
  mode, title, kicker, description, promptLabel, promptPlaceholder, generatingLabel,
}: {
  mode: 'cleanup' | 'replace';
  title: string;
  kicker: string;
  description: string;
  promptLabel?: string;
  promptPlaceholder?: string;
  generatingLabel: string;
}) {
  const { user } = useAuthStore();
  const location = useLocation();
  const { data: credits, error: creditsError } = useCreditBalance();
  const generate = useGenerateMaskEdit();

  // Library's "Edit again" opens a stored photo straight into the paint step.
  const prefillPath = (location.state as { inputPath?: string } | null)?.inputPath;
  const [source, setSource] = useState<Source | null>(prefillPath ? { kind: 'stored', path: prefillPath } : null);
  const [strokeCount, setStrokeCount] = useState(0);
  // Kept here, not only inside the canvas, so "Edit mask again" (which
  // remounts the canvas) restores the painted mask instead of wiping it.
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [labeling, setLabeling] = useState(false);
  const [labelFailed, setLabelFailed] = useState(false);
  const [promptProducts, setPromptProducts] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const budget = useMemo(() => ({
    minPrice: budgetMin ? Number(budgetMin) : undefined,
    maxPrice: budgetMax ? Number(budgetMax) : undefined,
  }), [budgetMin, budgetMax]);

  const canvasRef = useRef<MaskCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelRequestId = useRef(0);
  const labelTimer = useRef<number | null>(null);
  const promptSearchId = useRef(0);

  const [lastPicked, setLastPicked] = useState<Product | null>(null);
  const toggleProduct = (product: Product) => {
    if (selectedProductIds.includes(product.id)) {
      setSelectedProductIds((prev) => prev.filter((p) => p !== product.id));
      if (lastPicked?.id === product.id) setLastPicked(null);
      return;
    }
    if (selectedProductIds.length >= MAX_PRODUCTS_PER_GENERATION) {
      toast.error(`Up to ${MAX_PRODUCTS_PER_GENERATION} products per design for now.`);
      return;
    }
    setSelectedProductIds((prev) => [...prev, product.id]);
    setLastPicked(product);
  };

  const voice = useVoiceInput({
    onResult: (text) => setPrompt((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (message) => toast.error(message),
  });

  // After each stroke, wait for painting to pause, then ask Mantha what's
  // under the mask — so the user sees what was detected before they can hit
  // Regenerate, instead of guessing whether the selection was right.
  useEffect(() => {
    if (labelTimer.current) window.clearTimeout(labelTimer.current);
    if (!source || strokeCount === 0) {
      labelRequestId.current += 1;
      setLabel(null);
      setLabeling(false);
      setLabelFailed(false);
      return;
    }
    const myId = ++labelRequestId.current;
    setLabeling(true);
    setLabelFailed(false);
    labelTimer.current = window.setTimeout(async () => {
      try {
        const detection = await canvasRef.current?.exportDetection({ maxDimension: 768 });
        if (!detection || myId !== labelRequestId.current) return;
        const detected = await labelMaskRegion(detection.blob, detection.box);
        if (myId === labelRequestId.current) setLabel(detected);
      } catch {
        if (myId === labelRequestId.current) { setLabel(null); setLabelFailed(true); }
      } finally {
        if (myId === labelRequestId.current) setLabeling(false);
      }
    }, LABEL_DEBOUNCE_MS);
    return () => { if (labelTimer.current) window.clearTimeout(labelTimer.current); };
  }, [strokeCount, source]);

  // Replace only — surface real products matching either what's typed ("a
  // round wooden coffee table") or, if nothing's typed yet, what Gemini
  // already detected under the paint (the `label` from the effect above,
  // e.g. "grey sofa") — so just circling an object surfaces real matches
  // for it automatically, before anyone types a word.
  const usingDetectedLabel = prompt.trim().length < 4 && !!label?.trim();
  const activeQuery = prompt.trim().length >= 4 ? prompt.trim() : (label?.trim() ?? '');
  const hasActiveQuery = mode === 'replace' && activeQuery.length >= 4;
  useEffect(() => {
    if (mode !== 'replace') return;
    const typed = prompt.trim();
    const query = typed.length >= 4 ? typed : (label?.trim() ?? '');
    if (query.length < 4) {
      promptSearchId.current += 1;
      setPromptProducts([]);
      setSearchingProducts(false);
      return;
    }
    const myId = ++promptSearchId.current;
    setSearchingProducts(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchProductsForPrompt({ prompt: query, ...budget });
        if (myId === promptSearchId.current) setPromptProducts(results);
      } catch {
        if (myId === promptSearchId.current) setPromptProducts([]);
      } finally {
        if (myId === promptSearchId.current) setSearchingProducts(false);
      }
    }, PROMPT_PRODUCT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [prompt, label, mode, budget]);

  const setupPending = isSetupError(creditsError);
  const outOfCredits = credits !== undefined && credits <= 0;
  const { data: subscription } = useSubscription();
  const subscribed = isActiveSubscription(subscription);

  const filePreview = source?.kind === 'file' ? source.preview : null;
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG or WebP photo.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That photo is over 10MB — please use a smaller one.');
      return;
    }
    setResult(null);
    setError(null);
    setStrokes([]);
    setHasGenerated(false);
    setSource({ kind: 'file', file, preview: URL.createObjectURL(file) });
  };

  const startOver = () => {
    setSource(null);
    setResult(null);
    setError(null);
    setStrokeCount(0);
    setStrokes([]);
    setHasGenerated(false);
    setPrompt('');
    setSelectedProductIds([]);
    setPromptProducts([]);
  };

  const editMaskAgain = () => {
    setResult(null);
    setError(null);
  };

  const generateNow = async () => {
    if (!user || !source || strokeCount === 0) return;
    setError(null);
    try {
      const maskedImage = await canvasRef.current?.exportMasked();
      if (!maskedImage) throw new Error('Could not read the painted photo — please try again.');
      const generation = await generate.mutateAsync({
        userId: user.id,
        cleanImage: source.kind === 'file' ? source.file : source.path,
        maskedImage,
        mode,
        prompt: prompt.trim(),
        detectedLabel: label ?? undefined,
        productIds: mode === 'replace' && selectedProductIds.length ? selectedProductIds : undefined,
      });
      setHasGenerated(true);
      setResult(generation);
    } catch (err) {
      const message =
        err instanceof OutOfCreditsError
          ? "You're out of credits."
          : err instanceof RateLimitError || err instanceof GenerationError
            ? err.message
            : isSetupError(err)
              ? `${title} isn't switched on yet — the latest database update still needs to be applied.`
              : 'Something went wrong. No worries — try again.';
      setError(message);
    }
  };

  // What the result slider's "before" should point at — the visitor's own
  // clean photo (object URL for a fresh upload, or the stored path if this
  // was already in the library), never the red-marked upload the model saw.
  const cleanBeforeRef = source ? (source.kind === 'file' ? source.preview : source.path) : null;
  // The canvas needs a loadable URL, so a stored photo is signed first.
  const canvasSrc = useStoredImageUrl(cleanBeforeRef);

  return (
    <>
      <section className="panel">
        <div className="ph">
          <div className="r">
            <div className="kicker">Tools · {kicker}</div>
            <h1>{title === 'Cleanup' ? <>Erase <em>anything</em></> : <>Swap <em>one thing</em></>}</h1>
            <p className="sub">{description}</p>
          </div>
          {credits !== undefined && (
            <div className="actions r" style={{ ['--i' as string]: 1 }}>
              <span className="credpill">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
                <b>{credits}</b> credits left · 1 per design
              </span>
            </div>
          )}
        </div>

        <div className="switch r" style={{ ['--i' as string]: 2 }}>
          <div className="seg dark">
            <span className="ind" style={{ transform: mode === 'cleanup' ? 'translateX(0)' : 'translateX(100%)', width: '50%' }} />
            <Link to="/app/cleanup" className={mode === 'cleanup' ? 'on' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H9L4 15a2 2 0 0 1 0-2.8l8.5-8.5a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L12 18" /><path d="M8 11l6 6" /></svg>Cleanup
            </Link>
            <Link to="/app/replace" className={mode === 'replace' ? 'on' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 4h6v6M3 10V7a3 3 0 0 1 3-3h4" /><path d="M14 17h3a3 3 0 0 0 3-3v-1" strokeDasharray="2 2.5" /></svg>Replace
            </Link>
          </div>
          <span className="muted">Precise edits. Paint over one area and leave the rest of the room untouched.</span>
        </div>

        {setupPending && (
          <div className="note r" style={{ ['--i' as string]: 2 }}>
            <div className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg></div>
            <div>{title} switches on once the latest database update is applied.</div>
          </div>
        )}

        {outOfCredits && !setupPending && (
          <div className="note r" style={{ ['--i' as string]: 2, background: 'var(--char)', color: '#fff', boxShadow: 'none' }}>
            <div>
              {subscribed ? (
                <>
                  <b style={{ color: '#fff' }}>You've used all your credits for this month.</b>{' '}
                  They renew with your next payment. See your plan for the date.
                  <Link to="/app/settings?tab=plan" className="btn btn-w btn-sm" style={{ marginLeft: 12 }}>View plan</Link>
                </>
              ) : (
                <>
                  <b style={{ color: '#fff' }}>You've used your {FREE_SIGNUP_CREDITS} free redesigns.</b>{' '}
                  Subscribe for {INTRO} your first month, then {MONTHLY}/month.
                  <Link to="/pricing" className="btn btn-w btn-sm" style={{ marginLeft: 12 }}>See plans</Link>
                </>
              )}
            </div>
          </div>
        )}

        {!result ? (
          <div className="tw" style={source ? { gridTemplateColumns: '1fr' } : undefined}>
            <div
              className="drop r"
              style={{ ['--i' as string]: 3, ...(source ? { minHeight: 0, padding: 20 } : {}) }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
            >
              {dragging && <svg className="ants"><rect x="1" y="1" rx="21" ry="21" /></svg>}

              {!source ? (
                <>
                  <div className="big">
                    {mode === 'cleanup' ? (
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H9L4 15a2 2 0 0 1 0-2.8l8.5-8.5a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L12 18" /><path d="M8 11l6 6" /></svg>
                    ) : (
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 4h6v6M3 10V7a3 3 0 0 1 3-3h4" /><path d="M14 17h3a3 3 0 0 0 3-3v-1" strokeDasharray="2 2.5" /></svg>
                    )}
                  </div>
                  <h3>Upload a room photo, <em>{mode === 'cleanup' ? 'then brush it away' : 'then mark what to swap'}</em></h3>
                  <p>Drop a photo here or tap to choose one, then paint over what you want to {mode === 'cleanup' ? 'remove' : 'replace'}.</p>
                  <div className="acts">
                    <button type="button" className="btn btn-dark" onClick={() => fileInputRef.current?.click()}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>Choose a photo
                    </button>
                  </div>
                  {mode === 'replace' && (
                    <div className="fmt" style={{ marginTop: 16 }}>
                      {REPLACE_SUGGESTIONS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          className="pchip"
                          onClick={() => { setPrompt(s.prompt); fileInputRef.current?.click(); }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : canvasSrc ? (
                <div style={{ width: '100%' }}>
                  <div style={{ position: 'relative' }}>
                    <MaskCanvas
                      ref={canvasRef}
                      imageSrc={canvasSrc}
                      initialStrokes={strokes}
                      onStrokesChange={setStrokes}
                      onStrokeCountChange={setStrokeCount}
                    />
                    {generate.isPending && (
                      <div className="turn-wait-in" style={{ position: 'absolute', inset: 0, background: 'rgba(250,248,244,.72)', backdropFilter: 'blur(3px)', borderRadius: 16, zIndex: 5 }}>
                        <Loader2 className="spin" color="var(--brass)" width={28} height={28} />
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{generatingLabel}</span>
                      </div>
                    )}
                  </div>
                  <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>
                    Paint over the {mode === 'cleanup' ? 'thing you want gone' : 'thing you want swapped out'} — the red marks the spot, it won't show up in the result.
                  </p>

                  {(labeling || label || labelFailed) && (
                    <span className={`tagp${labeling || label ? ' dark' : ''}`} style={{ marginTop: 10, display: 'inline-flex' }}>
                      {labeling ? (
                        <><Loader2 className="animate-spin" width={13} height={13} /> Detecting…</>
                      ) : label ? (
                        <><Sparkles width={13} height={13} /> Looks like: <b>{label}</b></>
                      ) : (
                        "Couldn't identify it — you can still generate."
                      )}
                    </span>
                  )}

                  {mode === 'replace' && (
                    <div className="comp" style={{ marginTop: 16 }}>
                      <div className="top1"><span className="kicker" style={{ fontSize: 10 }}>{promptLabel}</span></div>
                      <div className="ta">
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder={promptPlaceholder}
                          rows={2}
                        />
                      </div>
                      {voice.supported && (
                        <div className="bot">
                          <button
                            type="button"
                            onClick={() => (voice.listening ? voice.stop() : voice.start())}
                            className="ico-btn"
                            aria-label={voice.listening ? 'Stop voice input' : 'Describe by voice'}
                            style={voice.listening ? { color: 'var(--rose)' } : undefined}
                          >
                            {voice.listening ? <MicOff width={15} height={15} /> : <Mic width={15} height={15} />}
                          </button>
                        </div>
                      )}

                      {(!!promptProducts.length || searchingProducts || hasActiveQuery) && (
                        <div style={{ marginTop: 14 }}>
                          <p className="kicker" style={{ fontSize: 10 }}>
                            {usingDetectedLabel ? `Matching what you painted (${label})` : 'Matching your prompt'}
                            <small>optional · up to {MAX_PRODUCTS_PER_GENERATION}</small>
                          </p>
                          <div style={{ marginTop: 6 }}><BudgetFilter min={budgetMin} max={budgetMax} onChange={(a, b) => { setBudgetMin(a); setBudgetMax(b); }} /></div>
                          {searchingProducts && promptProducts.length === 0 && (
                            <p className="muted" style={{ fontSize: 12 }}>Looking for real products…</p>
                          )}
                          {!searchingProducts && promptProducts.length === 0 && hasActiveQuery && (
                            <p className="muted" style={{ fontSize: 12 }}>
                              No real products found for "{activeQuery}" yet — try describing it differently.
                            </p>
                          )}
                          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 8 }}>
                            {(showAllProducts ? promptProducts : promptProducts.slice(0, INITIAL_VISIBLE_PRODUCTS)).map((p) => (
                              <ProductTile key={p.id} product={p} selected={selectedProductIds.includes(p.id)} onToggle={() => toggleProduct(p)} />
                            ))}
                          </div>
                          {promptProducts.length > INITIAL_VISIBLE_PRODUCTS && (
                            <button
                              type="button"
                              className="lnk"
                              style={{ marginTop: 8, fontSize: 12.5 }}
                              onClick={() => setShowAllProducts((s) => !s)}
                            >
                              {showAllProducts ? 'View fewer' : `View more (${promptProducts.length - INITIAL_VISIBLE_PRODUCTS})`}
                            </button>
                          )}
                          {selectedProductIds.length > 0 && (
                            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                              {selectedProductIds.length} selected — this exact product will appear in the result.
                            </p>
                          )}
                          {lastPicked && <MoreLikeThis product={lastPicked} selectedIds={selectedProductIds} onToggle={toggleProduct} />}
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="note r" style={{ marginTop: 14, background: 'var(--rose-bg)', boxShadow: 'inset 0 0 0 1px #F3D3CB', color: '#7A2E20' }}>
                      <div>
                        {error}
                        {outOfCredits && !subscribed && <Link to="/pricing" style={{ marginLeft: 6, fontWeight: 700, color: 'var(--brass)' }}>See plans</Link>}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-line" onClick={startOver}>
                      <RotateCcw width={14} height={14} /> Different photo
                    </button>
                    <span className="spacer" />
                    <button
                      type="button"
                      onClick={generateNow}
                      disabled={strokeCount === 0 || labeling || generate.isPending || outOfCredits || setupPending}
                      className={`go${strokeCount > 0 && !labeling && !generate.isPending && !outOfCredits && !setupPending ? ' ready' : ''}`}
                    >
                      {generate.isPending ? (
                        <><Loader2 className="animate-spin" width={15} height={15} /> {generatingLabel}</>
                      ) : (
                        <><Sparkles width={15} height={15} /> {hasGenerated ? 'Regenerate' : 'Generate'} <ArrowRight width={14} height={14} /></>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="muted">Loading photo…</div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>

            {!source && (
              <div className="demo r" style={{ ['--i' as string]: 4 }}>
                <div className="dh">
                  <b>How {title} works</b>
                  <span className="tagp">Example</span>
                </div>
                <div className="steps3">
                  <div><span className="n">01</span><b>Upload</b><span>One photo of the room.</span></div>
                  <div><span className="n">02</span><b>{mode === 'cleanup' ? 'Brush' : 'Mark'}</b><span>Paint over {mode === 'cleanup' ? 'what should go' : 'the piece to swap'}.</span></div>
                  <div><span className="n">03</span><b>{mode === 'cleanup' ? 'Erase' : 'Describe'}</b><span>{mode === 'cleanup' ? 'Mantha fills the gap in.' : 'Say what goes there instead.'}</span></div>
                </div>
              </div>
            )}
          </div>
        ) : cleanBeforeRef && (
          <div className="card r" style={{ ['--i' as string]: 3, marginTop: 20, overflow: 'hidden' }}>
            <div style={{ maxWidth: 'min(100%, calc(70vh * 1.3334))', margin: '0 auto' }}>
              <StoredCompare before={cleanBeforeRef} after={result.output_image_url} generationId={result.id} />
            </div>
            <div style={{ padding: '0 16px' }}><ShopThisLook generationId={result.id} /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check width={14} height={14} color="var(--brass)" />
                Saved to your <Link to="/app/library" style={{ fontWeight: 700, color: 'var(--brass)' }}>projects</Link>
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn btn-line btn-sm" onClick={editMaskAgain}>Edit mask again</button>
                <button type="button" className="btn btn-line btn-sm" onClick={startOver}><RotateCcw width={14} height={14} /> New photo</button>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  onClick={() => result.output_image_url && downloadStoredImage(result.output_image_url, fileNameFor(result.output_image_url, `thinkdecor-${mode}-${result.id.slice(0, 8)}`))}
                >
                  <Download width={14} height={14} /> Download
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
