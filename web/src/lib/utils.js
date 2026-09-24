const DEFAULT_CHECKLIST_INTERNATIONAL = [
  "여권 & 항공권 e-티켓", "환전 / 트래블카드", "eSIM 또는 포켓와이파이",
  "숙소 예약 확인서", "보조배터리 & 충전기", "상비약", "여행자 보험", "캐리어 무게 확인",
];

const DEFAULT_CHECKLIST_DOMESTIC = [
  "숙소 예약 확인서", "기차/버스표 예매 확인", "보조배터리 & 충전기", "상비약", "여벌 옷 & 세면도구", "카드/현금",
];

export function makeChecklistId() {
  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Checked/unchecked state lives in trip.checklistDone (keyed by this id),
 * separate from the checklist array itself — see ensureChecklistIds below for
 * why. Items saved before that split has an id fall back to a position-based
 * key; it's only unstable across a delete/reorder of an item that was never
 * migrated to a real id, which self-heals the next time anyone with
 * checklist-edit permission adds or removes an item (ensureChecklistIds runs
 * then). */
export function checklistItemId(item, idx) {
  return item?.id || `idx-${idx}`;
}

/** Backfills a stable id onto any legacy checklist item that doesn't have
 * one yet. Only called from add/delete-item flows (which already require
 * checklist permission), never from the checkbox toggle — toggling only ever
 * writes to trip.checklistDone, which every member (not just 방장 /
 * permission-holders) is always allowed to touch. */
export function ensureChecklistIds(items) {
  return (items || []).map((it) => (it.id ? it : { ...it, id: makeChecklistId() }));
}

export function defaultChecklist(tripType) {
  const items = tripType === "domestic" ? DEFAULT_CHECKLIST_DOMESTIC : DEFAULT_CHECKLIST_INTERNATIONAL;
  return items.map((text) => ({ id: makeChecklistId(), text }));
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`;
}

export function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString("ko-KR");
}

export function tripStatus(t) {
  const today = todayStr();
  if (t.endDate && today > t.endDate) return "completed";
  if (t.startDate && today >= t.startDate) return "ongoing";
  return "upcoming";
}

export function statusLabel(s) {
  return { upcoming: "예정", ongoing: "여행중", completed: "완료" }[s] || s;
}

export function mapUrl(q) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

export function ddayLabel(t) {
  const st = tripStatus(t);
  if (st === "completed" || !t.startDate || !t.endDate) return null;
  const today = new Date(todayStr() + "T00:00:00");
  const start = new Date(t.startDate + "T00:00:00");
  if (st === "ongoing") {
    const end = new Date(t.endDate + "T00:00:00");
    const totalDays = Math.round((end - start) / 86400000) + 1;
    const dayNum = Math.round((today - start) / 86400000) + 1;
    return `${dayNum}일차 / ${totalDays}일`;
  }
  const diff = Math.round((start - today) / 86400000);
  return diff === 0 ? "D-DAY" : `D-${diff}`;
}

export function itemKind(it) {
  if (it.kind === "time" || it.kind === "label") return it.kind;
  return /^\d{1,2}:\d{2}$/.test(it.time || "") ? "time" : "label";
}

export function splitItems(items) {
  const timeEntries = [];
  const labelEntries = [];
  (items || []).forEach((it, idx) => {
    (itemKind(it) === "time" ? timeEntries : labelEntries).push({ it, idx });
  });
  timeEntries.sort((a, b) => (a.it.time || "").localeCompare(b.it.time || ""));
  return { timeEntries, labelEntries };
}

export function truncateCanvasText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

export function saveBlobAsFile(filename, dataOrBlob) {
  const blob = dataOrBlob instanceof Blob ? dataOrBlob : new Blob([dataOrBlob], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function emptyTrip(overrides) {
  return {
    title: "", destination: "", startDate: "", endDate: "", travelers: 1, budgetTotal: 0,
    tripType: "international",
    days: [], budgetItems: [], bookings: [],
    checklist: defaultChecklist(overrides?.tripType),
    checklistDone: {},
    memberPermissions: {},
    review: { text: "", photos: [] },
    ...overrides,
  };
}
