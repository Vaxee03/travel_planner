// Start-up screen for the Android/iOS app. The system splash (the app icon
// on the dark background) hands over to this the moment React mounts: it
// starts as the very same picture, then the dashed route flows along its
// loop and the plane bobs while sign-in and the trip list load. When
// everything is ready the plane darts off and the screen fades away.
import { useEffect, useState } from "react";
import art from "../../assets/icon/foreground.svg?raw";

// Split the icon artwork so the route and the plane can move separately.
const inner = art.replace(/^[\s\S]*?<g /, "<g ").replace(/<\/svg>\s*$/, "");
const planeAt = inner.indexOf('<g transform="translate(650');
const lastClose = inner.lastIndexOf("</g>");
const markup = planeAt > 0
  ? inner.slice(0, planeAt) + '<g class="ldr-plane">' + inner.slice(planeAt, lastClose) + "</g>" + inner.slice(lastClose)
  : inner;

export default function AppLoader({ done }) {
  const [gone, setGone] = useState(false);

  // Take over from the native splash as soon as this is on screen.
  useEffect(() => {
    import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 0 })).catch(() => {});
  }, []);

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setGone(true), 650);
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;
  return (
    <div className={"app-loader" + (done ? " done" : "")} role="status" aria-label="불러오는 중">
      <svg viewBox="171 171 682 682" className="app-loader-icon" aria-hidden="true">
        <circle cx="512" cy="512" r="341" fill="#e07a63" />
        <g dangerouslySetInnerHTML={{ __html: markup }} />
      </svg>
    </div>
  );
}
