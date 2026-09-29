import { useEffect, useState } from "react";
import { watchNicknames } from "./users";

/** Resolves a list of uids to a { uid: nickname } map that stays up to date
 * as people change their nicknames (and re-subscribes when the set of uids
 * changes). */
export function useNicknames(uids) {
  const key = [...new Set((uids || []).filter(Boolean))].sort().join(",");
  const [map, setMap] = useState({});

  useEffect(() => {
    if (!key) { setMap({}); return; }
    return watchNicknames(key.split(","), setMap);
  }, [key]);

  return map;
}
