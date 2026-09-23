import { useEffect, useState } from "react";
import { fetchNicknames } from "./users";

/** Resolves a list of uids to a { uid: nickname } map, refetching whenever
 * the (order-independent) set of uids changes. */
export function useNicknames(uids) {
  const key = [...new Set((uids || []).filter(Boolean))].sort().join(",");
  const [map, setMap] = useState({});

  useEffect(() => {
    if (!key) { setMap({}); return; }
    let cancelled = false;
    fetchNicknames(key.split(",")).then((m) => { if (!cancelled) setMap(m); });
    return () => { cancelled = true; };
  }, [key]);

  return map;
}
