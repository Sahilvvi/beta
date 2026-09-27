import type { RoomType } from '@/lib/templates';

/** Carries a style from a public share page (/r/<slug>) into Create, across
 *  whatever sign-in/sign-up detour a signed-out visitor takes on the way —
 *  sessionStorage survives that redirect chain; React Router navigation
 *  state does not (ProtectedRoute's own redirect state clobbers it). */
const KEY = 'td:pendingRemix';

export interface PendingRemix {
  templateKey?: string | null;
  roomType?: RoomType | null;
  prompt?: string | null;
}

export function savePendingRemix(payload: PendingRemix) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Private browsing / storage disabled — remix just won't carry over; the
    // share page's plain "Try it on your room" link still works.
  }
}

/** Reads and clears the pending remix, if any — one-shot, so it never
 *  reapplies on a later visit to Create. */
export function consumePendingRemix(): PendingRemix | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as PendingRemix;
  } catch {
    return null;
  }
}
