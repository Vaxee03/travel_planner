// Trip creator ("방장") always has full access. Everyone else gets only the
// baseline actions (checklist check-toggle, AI restaurant recs, review board)
// unless the 방장 grants one of these categories via memberPermissions.
export const PERMISSION_CATEGORIES = [
  { key: "itinerary", label: "일정 관리 (날짜/항목 추가·수정·삭제·순서변경, 메모)" },
  { key: "budget", label: "예산 항목 추가/삭제" },
  { key: "checklist", label: "체크리스트 항목 추가/삭제" },
  { key: "bookings", label: "예약정보 추가/수정/삭제" },
];

export function isOwner(trip, uid) {
  return Boolean(trip && uid && trip.ownerId === uid);
}

export function hasPermission(trip, uid, category) {
  if (isOwner(trip, uid)) return true;
  return Boolean(trip?.memberPermissions?.[uid]?.includes(category));
}

/** All four gating flags at once, for threading down to tab components. */
export function computePerms(trip, uid) {
  const owner = isOwner(trip, uid);
  return {
    isOwner: owner,
    itinerary: owner || hasPermission(trip, uid, "itinerary"),
    budget: owner || hasPermission(trip, uid, "budget"),
    checklist: owner || hasPermission(trip, uid, "checklist"),
    bookings: owner || hasPermission(trip, uid, "bookings"),
  };
}
