// Where the day-complete credit flies from and to (plan §4.1 beat 7, C-07). Components that
// take part register a view under a key; CreditFlight, RingBurst and the milestone screen
// measure them with measureInWindow at the moment they need them, so nothing re-renders.
//
// Keys: `check:<habitId>` (a Today card's check disc or done pill), `ring` and `strip` (the
// header ring and its brand strip), `ringSticky` and `sticky` (the sticky bar's ring and the
// bar). Module state; `useAnchor` is the per-instance callback ref components use.
import { useCallback, useRef } from 'react';

const nodes = new Map();

export const checkKey = (habitId) => `check:${habitId}`;

/**
 * Register `node` under `key`, or with `node` null, release `prev`: the key is only dropped
 * while `prev` is still the registered node, so when two views share a key (the token
 * preview's extra headers) the one that detaches cannot delete the other (C-07 review m3).
 */
export function setAnchor(key, node, prev = null) {
  if (node) nodes.set(key, node);
  else if (prev == null || nodes.get(key) === prev) nodes.delete(key);
}

/** A per-instance callback ref for `key`, stable while the key is (memo props hold). */
export function useAnchor(key) {
  const mine = useRef(null);
  return useCallback((node) => {
    const prev = mine.current;
    mine.current = node;
    setAnchor(key, node, prev);
  }, [key]);
}

/** Measures a view in window coordinates: `{ x, y, width, height }`, or null. */
export function measureNode(node) {
  return new Promise((resolve) => {
    if (!node || typeof node.measureInWindow !== 'function') { resolve(null); return; }
    try {
      node.measureInWindow((x, y, width, height) => {
        resolve(Number.isFinite(x) && Number.isFinite(y) && (width > 0 || height > 0) ? { x, y, width, height } : null);
      });
    } catch {
      resolve(null);
    }
  });
}

export function measureAnchor(key) {
  return measureNode(nodes.get(key));
}

export const centreOf = (r) => (r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null);

/** `rect` relative to `origin` (both in window coordinates). */
export function relativeTo(rect, origin) {
  if (!rect || !origin) return null;
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}

/**
 * Where the credit leaves from (pure, tested). `source` is the checked card's check, `layer`
 * the overlay (both relative to the overlay), `edge` the strip (or the sticky bar when
 * scrolled). The check's centre when it is inside the overlay and not under `cover` (the
 * sticky bar); otherwise, the card having scrolled away or unmounted (§4.2), the bottom edge
 * of `edge` near its right end, under the chips.
 */
export function departurePoint({ source, layer, edge, cover = null }) {
  const c = centreOf(source);
  const inside = (p, r) => r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  if (c && layer && inside(c, { x: 0, y: 0, width: layer.width, height: layer.height }) && !inside(c, cover)) return c;
  if (!edge) return null;
  return { x: edge.x + edge.width * EDGE_X, y: edge.y + edge.height };
}
// The strip-edge departure sits this far along the strip (the chips' column, clear of the ring).
export const EDGE_X = 0.75;

export function __resetAnchorsForTests() {
  nodes.clear();
}
