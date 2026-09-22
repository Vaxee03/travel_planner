import { fmtMoney, truncateCanvasText } from "./utils";

const W = 720;
const H = 460;
const PAD = 40;
const FONT = '"Jua", "Noto Sans KR", sans-serif';

export function inviteJoinUrl(tripId) {
  return `${window.location.origin}${window.location.pathname}?join=${tripId}`;
}

function roundedClip(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
}

function drawBackground(ctx) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#14161c");
  grad.addColorStop(1, "#1d212b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W - 90, 90, 10, W - 90, 90, 260);
  glow.addColorStop(0, "rgba(224,122,99,0.22)");
  glow.addColorStop(1, "rgba(224,122,99,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

/** A simple two-tone paper airplane silhouette, nose pointing right. */
function drawPaperPlane(ctx, cx, cy, size, angleDeg) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);

  // dashed flight trail behind the plane
  ctx.save();
  ctx.strokeStyle = "rgba(236,230,219,0.28)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.moveTo(-size * 1.6, size * 0.5);
  ctx.quadraticCurveTo(-size * 0.9, size * 0.55, -size * 0.35, size * 0.12);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.15, size * 0.42);
  ctx.lineTo(size * 0.18, size * 0.16);
  ctx.closePath();
  ctx.fillStyle = "rgba(236,230,219,0.92)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.15, -size * 0.42);
  ctx.lineTo(size * 0.18, -size * 0.16);
  ctx.closePath();
  ctx.fillStyle = "rgba(224,122,99,0.9)";
  ctx.fill();

  ctx.strokeStyle = "rgba(29,33,43,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(size * 0.18, 0);
  ctx.stroke();

  ctx.restore();
}

export async function drawInviteCard(canvas, trip) {
  // Render at a higher pixel density than the card's CSS size so text stays
  // crisp — a canvas sized 1:1 to its display size looks soft on any
  // standard-DPI-unaware draw, and worse once devicePixelRatio > 1.
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const dateRange = `${trip.startDate || ""} ~ ${trip.endDate || ""}`;
  const budgetText = trip.budgetTotal ? `${fmtMoney(trip.budgetTotal)}원` : "-";
  // The code IS the trip's Firestore document id (case-sensitive) so
  // "join by code" can look the document up directly — do not reformat it.
  const code = trip.id || "";
  // Google Fonts serves Korean glyphs as a separate subset chunk that only
  // loads once the browser sees text that needs it — passing a Latin-only
  // sample to fonts.load() (or none at all) leaves batchim-heavy characters
  // unloaded at draw time, so they silently fall back to a different font.
  // Passing every string this card actually draws forces that subset in.
  const sampleText = [
    "TRAVEL PLANNER", "동행자 초대장", "동행자 초대", "여행", "여행 기간", "총 예산", "참여 코드",
    `${trip.travelers || 1}명`, trip.destination || "", trip.title || "", dateRange, budgetText, code,
    window.location.host,
  ].join(" ");
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(`16px ${FONT}`, sampleText),
      document.fonts.load(`52px ${FONT}`, sampleText),
      document.fonts.ready,
    ]);
  }

  ctx.save();
  roundedClip(ctx, 0, 0, W, H, 22);
  drawBackground(ctx);
  drawPaperPlane(ctx, W - 110, 78, 46, -18);

  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#c9a35f";
  ctx.font = `12px ${FONT}`;
  ctx.fillText("T R A V E L   P L A N N E R", PAD, PAD + 4);

  ctx.fillStyle = "#ece6db";
  ctx.font = `26px ${FONT}`;
  ctx.fillText("동행자 초대장", PAD, PAD + 42);

  const infoY = PAD + 78;
  const infoParts = ["동행자 초대", `${trip.travelers || 1}명`, `${trip.destination || "여행"}`];
  ctx.font = `14px ${FONT}`;
  let ix = PAD;
  infoParts.forEach((part, i) => {
    ctx.fillStyle = i === 0 ? "#e07a63" : "#ece6db";
    ctx.fillText(part, ix, infoY);
    ix += ctx.measureText(part).width + 14;
    if (i < infoParts.length - 1) {
      ctx.fillStyle = "rgba(236,230,219,0.35)";
      ctx.fillText("|", ix, infoY);
      ix += ctx.measureText("|").width + 14;
    }
  });

  ctx.fillStyle = "#e2624a";
  ctx.font = `52px ${FONT}`;
  const title = truncateCanvasText(ctx, trip.title || "여행", W - PAD * 2);
  ctx.fillText(title, PAD, infoY + 66);

  const rowsY = infoY + 108;
  const rows = [
    ["여행 기간", dateRange],
    ["총 예산", budgetText],
  ];
  rows.forEach(([label, value], i) => {
    const y = rowsY + i * 30;
    ctx.fillStyle = "rgba(236,230,219,0.6)";
    ctx.font = `14px ${FONT}`;
    ctx.fillText(label, PAD, y);
    ctx.fillStyle = "#c9a35f";
    ctx.font = `15px ${FONT}`;
    ctx.fillText(value, PAD + 92, y);
  });

  const codeY = H - PAD - 56;
  ctx.fillStyle = "rgba(236,230,219,0.6)";
  ctx.font = `13px ${FONT}`;
  ctx.fillText("참여 코드", PAD, codeY);
  ctx.fillStyle = "#ece6db";
  ctx.font = `22px ${FONT}`;
  ctx.fillText(code, PAD, codeY + 30);
  ctx.fillStyle = "#e07a63";
  ctx.font = `13px ${FONT}`;
  ctx.fillText("🔗 " + window.location.host, PAD, codeY + 54);

  ctx.restore();
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
