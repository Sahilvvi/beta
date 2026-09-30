import { Link } from 'react-router-dom';
import { SEO } from '@/components/shared/SEO';
import { StoredImage } from '@/components/app/StoredImage';
import { isActiveSubscription, useDisplayName, useSubscription } from '@/hooks/useProfile';
import {
  FREE_SIGNUP_CREDITS, formatDate, isSetupError, titleFor, useCreditBalance, useGenerations,
} from '@/lib/generation';
import { TEMPLATES } from '@/lib/templates';

export default function Overview() {
  const { firstName } = useDisplayName();
  const { data: subscription } = useSubscription();
  const { data: credits, error: creditsError } = useCreditBalance();
  const { data: recent, error: recentError } = useGenerations(6);
  const { data: all } = useGenerations();

  const setupPending = isSetupError(creditsError) || isSetupError(recentError);
  const featured = TEMPLATES.filter((t) => t.featured).slice(0, 3);
  const rest = TEMPLATES.filter((t) => !t.featured);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <SEO title="Overview | Think Decor" description="Your Think Decor workspace." />

      <section className="panel">
        <div className="ph">
          <div className="r">
            <div className="kicker">Your studio · {today}</div>
            <h1>Hello, <em>{firstName}</em></h1>
            <p className="sub">
              {credits !== undefined ? `You have ${credits} free redesign${credits === 1 ? '' : 's'} waiting` : 'Loading your credits'}
              <span className="sep" />Pick a room and let Mantha get to work
            </p>
          </div>
          <div className="actions r" style={{ ['--i' as string]: 1 }}>
            <Link className="btn btn-line" to="/app/templates">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>
              Browse templates
            </Link>
            <Link className="btn btn-dark" to="/app/create">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              New design
            </Link>
          </div>
        </div>

        {setupPending && (
          <div className="note r" style={{ ['--i' as string]: 2, marginTop: 24 }}>
            <div className="ic">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>
            </div>
            <div><b>Almost ready.</b> Credits and design history switch on once the latest database update is applied.</div>
          </div>
        )}

        <div className="hero r" style={{ ['--i' as string]: 2 }}>
          <div className="copy">
            <div className="kicker">Mantha AI · Redesign</div>
            <h2>Redesign a room, <em>keep the walls</em></h2>
            <p>Upload a photo, choose a style and describe what you want changed. Same architecture, same light. Only the surfaces change.</p>
            <div className="steps">
              <div><span>1</span>Upload a room photo</div>
              <div><span>2</span>Choose one of {TEMPLATES.length} styles</div>
              <div><span>3</span>Describe anything to change</div>
            </div>
            <div className="cta">
              <Link className="btn btn-w" to="/app/create">
                Start creating
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link className="btn btn-g" to="/app/templates">See examples</Link>
            </div>
          </div>
          <div className="dip">
            <figure><img src="/assets/samples/empty_room.png" alt="Room before" /></figure>
            <figure className="af"><img src="/assets/samples/styled_room.png" alt="Same room redesigned in Modern" /></figure>
            <span className="seam" />
            <span className="knob">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></svg>
            </span>
            <span className="lbl b">BEFORE</span>
            <span className="lbl a">AFTER · MODERN</span>
          </div>
        </div>

        <div className="strip r" style={{ ['--i' as string]: 3 }}>
          <Link className="sx" to="/pricing">
            <div className="ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg></div>
            <div className="v">{credits === undefined ? '—' : credits}</div>
            <div><div className="l">Credits left</div><div className="d">Each redesign uses 1</div></div>
            <span className="stat-go"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
          </Link>
          <Link className="sx" to="/app/library">
            <div className="ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></div>
            <div className="v">{all === undefined ? '—' : all.length}</div>
            <div><div className="l">Designs created</div><div className="d">Saved to Projects</div></div>
            <span className="stat-go"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
          </Link>
          <Link className="sx" to="/app/templates">
            <div className="ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg></div>
            <div className="v">{TEMPLATES.length}</div>
            <div><div className="l">Style templates</div><div className="d">Ready to apply</div></div>
            <span className="stat-go"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
          </Link>
        </div>

        <div className="sec r" style={{ ['--i' as string]: 4 }}>
          <div>
            <h3>Quick <em>start</em></h3>
            <p>Tap a style to open it in Create with your next photo.</p>
          </div>
          <Link to="/app/templates">All templates <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
        </div>
        <div className="qs">
          {featured.map((t, i) => (
            <Link key={t.key} className="tc r" style={{ ['--i' as string]: 5 + i }} to={`/app/create?template=${t.key}`}>
              <div className="pic">
                <img src={t.image} alt="" />
                {i === 0 && <span className="tagp dark">Popular</span>}
                <span className="use">Use style <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
              </div>
              <div className="bd">
                <h4>{t.label}</h4>
                <p>{t.description}</p>
              </div>
            </Link>
          ))}
          <Link className="more r" style={{ ['--i' as string]: 8 }} to="/app/templates">
            <div className="fan">
              {rest.slice(0, 3).map((t) => <img key={t.key} src={t.image} alt="" />)}
            </div>
            <b>+{rest.length} more styles</b>
            <span>{rest.slice(0, 2).map((t) => t.label).join(', ')} &amp; more <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
          </Link>
        </div>

        <div className="sec r" style={{ ['--i' as string]: 9 }}>
          <div><h3>Recent <em>designs</em></h3></div>
          {recent && recent.length > 0 && <Link to="/app/library">View all <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>}
        </div>
        {recent && recent.length > 0 ? (
          <div className="dgrid r" style={{ ['--i' as string]: 10 }}>
            {recent.map((g) => (
              <Link key={g.id} className="dcard" to={`/app/library?open=${g.id}`}>
                <div className="pic">
                  <StoredImage src={g.output_image_url ?? g.input_image_url} alt="" />
                </div>
                <div className="bd">
                  <h4>{titleFor(g)}</h4>
                  <div className="m">{formatDate(g.created_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty r" style={{ ['--i' as string]: 10 }}>
            <div className="frames">
              <i /><i />
              <i>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10M18 13v2M18 19v2M16 17h-2M22 17h-2" /></svg>
              </i>
            </div>
            <div>
              <h4>Your first redesign is one photo away</h4>
              <p>
                Designs you create land here, ready to compare before and after, download, or refine with another prompt.
                {' '}{credits !== undefined && credits > 0 ? `You have ${credits} ${isActiveSubscription(subscription) ? 'credit' : 'free redesign'}${credits === 1 ? '' : 's'}.` : `Every account starts with ${FREE_SIGNUP_CREDITS} free redesigns.`}
              </p>
            </div>
            <Link className="btn btn-dark" to="/app/create">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Create your first design
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
