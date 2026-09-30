// App-only (Capacitor) behaviour that a browser gives for free:
//  - Android's back button/gesture: close an open dialog first (as Esc does,
//    so the "discard what you typed?" check still applies), then an in-page
//    step such as an open day (lib/backHandlers.js), then go back a screen,
//    and only leave the app from the trip list.
//  - Links to tripplanner.kr (invites, public trip pages) opened on a phone
//    with the app installed land in the app — route them like a page load.
import { useEffect, useRef } from "react";
import { isNativeApp } from "./platform";
import { runBackHandlers } from "./backHandlers";

export function useNativeShell({ navigate, location }) {
  // The listeners are attached once; read the latest state through a ref.
  const state = useRef({});
  state.current = { navigate, pathname: location.pathname };

  useEffect(() => {
    if (!isNativeApp) return;
    let handles = [];
    let stopped = false;
    import("@capacitor/app").then(({ App }) => {
      if (stopped) return;
      handles = [
        App.addListener("backButton", ({ canGoBack }) => {
          const s = state.current;
          if (document.querySelector(".modal-overlay")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          else if (runBackHandlers()) { /* an in-page step (e.g. an open day) closed */ }
          else if (s.pathname !== "/") (canGoBack ? window.history.back() : s.navigate("/", { replace: true }));
          else App.exitApp();
        }),
        App.addListener("appUrlOpen", ({ url }) => {
          // Only site links; the app's own scheme (sign-in return) is
          // handled where the sign-in started.
          if (!url.startsWith("https://")) return;
          try {
            const u = new URL(url);
            state.current.navigate(u.pathname + u.search);
          } catch {
            /* not a link we handle */
          }
        }),
      ];
    });
    return () => {
      stopped = true;
      handles.forEach((h) => Promise.resolve(h).then((x) => x.remove()));
    };
  }, []);
}
