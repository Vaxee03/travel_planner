import { useEffect } from "react";

/** For a horizontally scrolling row (the phone layout of the trip's button
 * row and tab bar): marks it with `more-left` / `more-right` while there's
 * hidden content on that side, so CSS can fade that edge and show the row
 * can be swiped. */
export function useScrollHint(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle("more-left", max > 1 && el.scrollLeft > 1);
      el.classList.toggle("more-right", max > 1 && el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  });
}
