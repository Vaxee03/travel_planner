export const DEFAULT_CHECKLIST = [
  "여권 & 항공권 e-티켓", "엔화 환전 / 트래블카드", "eSIM 또는 포켓와이파이",
  "숙소 예약 확인서", "보조배터리 & 충전기", "상비약", "여행자 보험", "캐리어 무게 확인",
].map((text) => ({ text, done: false }));

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

export function buildItineraryText(trip) {
  const lines = [];
  lines.push(trip.title || "여행 일정");
  lines.push(
    `${trip.destination || "-"} · ${trip.startDate || ""} ~ ${trip.endDate || ""}` +
      (trip.travelers ? ` · ${trip.travelers}명` : "")
  );
  lines.push("");
  (trip.days || []).forEach((d) => {
    lines.push(`[${fmtDate(d.date)}] ${d.summary || (d.status === "confirmed" ? "확정" : "자유일정")}`);
    const { timeEntries, labelEntries } = splitItems(d.items);
    timeEntries.concat(labelEntries).forEach(({ it }) => {
      lines.push("  " + (it.time ? `- ${it.time} ` : "- ") + it.text);
    });
    lines.push("");
  });
  if (trip.bookings && trip.bookings.length) {
    lines.push("[예약 정보]");
    trip.bookings.forEach((b) => {
      lines.push(
        `  - (${b.type || "기타"}) ${b.name}` +
          (b.confirmNumber ? ` / 예약번호: ${b.confirmNumber}` : "") +
          (b.link ? ` / ${b.link}` : "")
      );
    });
  }
  return lines.join("\n");
}

function truncateCanvasText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

export function buildItineraryImageBlob(trip) {
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  return fontsReady.then(() => {
    const W = 900, padX = 56, headerH = 190, rowH = 68;
    const days = trip.days || [];
    const H = headerH + Math.max(days.length, 1) * rowH + 50;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#faf6ef"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#9c7a3f"; ctx.font = '700 13px "Noto Sans KR", sans-serif';
    ctx.fillText("TRAVEL PLANNER", padX, 54);
    ctx.fillStyle = "#211d1c"; ctx.font = '700 34px "Noto Serif KR", serif';
    ctx.fillText(truncateCanvasText(ctx, trip.title || "여행 일정", W - padX * 2), padX, 96);

    const sub = `${trip.destination || "-"}  ·  ${trip.startDate || ""} – ${trip.endDate || ""}` +
      (trip.travelers ? `  ·  ${trip.travelers}명` : "");
    ctx.fillStyle = "#6b625a"; ctx.font = '400 15px "Noto Sans KR", sans-serif';
    ctx.fillText(sub, padX, 124);

    ctx.strokeStyle = "#e2d8c8"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, 150); ctx.lineTo(W - padX, 150); ctx.stroke();

    let y = headerH;
    if (days.length === 0) {
      ctx.fillStyle = "#6b625a"; ctx.font = 'italic 400 15px "Noto Sans KR", sans-serif';
      ctx.fillText("등록된 일정이 없어요.", padX, y + 30);
    } else {
      days.forEach((d) => {
        const confirmed = d.status === "confirmed";
        ctx.beginPath(); ctx.arc(padX + 6, y + 22, 6, 0, Math.PI * 2);
        ctx.fillStyle = confirmed ? "#3f5a4a" : "#faf6ef"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = confirmed ? "#3f5a4a" : "#9c7a3f"; ctx.stroke();

        ctx.fillStyle = "#211d1c"; ctx.font = '700 17px "Noto Serif KR", serif';
        const dateLabel = fmtDate(d.date);
        ctx.fillText(dateLabel, padX + 26, y + 28);
        const dateW = ctx.measureText(dateLabel).width;

        ctx.fillStyle = confirmed ? "#3f5a4a" : "#9c7a3f"; ctx.font = '700 11px "Noto Sans KR", sans-serif';
        ctx.fillText(confirmed ? "확정" : "자유일정", padX + 26 + dateW + 12, y + 27);

        ctx.fillStyle = d.summary ? "#211d1c" : "#6b625a";
        ctx.font = (d.summary ? "400" : "italic 400") + ' 15px "Noto Sans KR", sans-serif';
        const summaryText = truncateCanvasText(ctx, d.summary || "세부 계획 미정", W - padX * 2 - 26);
        ctx.fillText(summaryText, padX + 26, y + 50);

        y += rowH;
      });
    }

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  });
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
    days: [], budgetItems: [], bookings: [],
    checklist: JSON.parse(JSON.stringify(DEFAULT_CHECKLIST)),
    review: { text: "", photos: [] },
    ...overrides,
  };
}
