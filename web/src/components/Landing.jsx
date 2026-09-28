import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AnimatePresence, LazyMotion, MotionConfig, animate, domAnimation, m as motion, useInView,
  useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring,
} from "motion/react";
import "../styles/landing.css";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const EASE = [0.22, 1, 0.36, 1];

const ICONS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M15.5 15H18" /></>,
  sparkle: <><path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  check: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12.5l3 3 5-6.5" /></>,
  ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" /><path d="M14 7.5v9" strokeDasharray="1.5 2.2" /></>,
  camera: <><path d="M4 8h3.2l1.8-2.6h6l1.8 2.6H20v11H4z" /><circle cx="12" cy="13" r="3.4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  export: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 12.5v5.5M9.5 15.5 12 18l2.5-2.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9.5" r="1.8" /><path d="M21 16l-5-5-8 9" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

function Icon({ name, size = 22 }) {
  return (
    <svg className="lp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** The brand paper plane, nose pointing right (0°) so it can be rotated to
 * follow a path. */
function PaperPlane({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 4 22 12 2 20 6.5 12z" fill="var(--accent)" />
      <path d="M6.5 12 22 12 2 20z" fill="rgba(0,0,0,.2)" />
      <path d="M6.5 12H22" stroke="rgba(255,255,255,.55)" strokeWidth=".8" />
    </svg>
  );
}

function Reveal({ children, delay = 0, y = 26, className, as = "div" }) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

function CountUp({ to, suffix = "원" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, to, { duration: 1.3, ease: "easeOut", onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [inView, to, reduce]);
  return <span ref={ref} className="nums">{value.toLocaleString("ko-KR")}{suffix}</span>;
}

/** Moves `planeRef` along an SVG path as `progress` (0–1) changes. The path
 * lives in a viewBox stretched over `boxRef` (preserveAspectRatio="none"), so
 * points are scaled into the box's pixels and the plane is rotated to the
 * on-screen direction of travel. With `fadeOut` the plane fades away over the
 * last stretch instead of parking at the end of the path. */
function usePathFollower(progress, pathRef, boxRef, planeRef, viewBox, fadeOut) {
  const place = useCallback((p) => {
    const path = pathRef.current, box = boxRef.current, plane = planeRef.current;
    if (!path || !box || !plane) return;
    const len = path.getTotalLength();
    const at = Math.max(0, Math.min(len - 0.5, p * len));
    const a = path.getPointAtLength(at);
    const b = path.getPointAtLength(at + 0.5);
    const sx = box.clientWidth / viewBox.w, sy = box.clientHeight / viewBox.h;
    const angle = (Math.atan2((b.y - a.y) * sy, (b.x - a.x) * sx) * 180) / Math.PI;
    plane.style.transform = `translate(${a.x * sx}px, ${a.y * sy}px) translate(-50%, -50%) rotate(${angle}deg)`;
    plane.style.opacity = fadeOut && p > 0.85 ? String(Math.max(0, (1 - p) / 0.15)) : "1";
  }, [pathRef, boxRef, planeRef, viewBox.w, viewBox.h, fadeOut]);

  useMotionValueEvent(progress, "change", place);
  // A passive effect, not a layout one: the box ref belongs to the parent,
  // which React attaches only after this component's layout effects run.
  useEffect(() => {
    place(progress.get());
    const onResize = () => place(progress.get());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place, progress]);
}

/** A dashed trail that is revealed up to `progress`, with the plane on its tip. */
function FlightPath({ d, viewBox, progress, boxRef, className, maskId, fadeOut = false }) {
  const pathRef = useRef(null);
  const planeRef = useRef(null);
  usePathFollower(progress, pathRef, boxRef, planeRef, viewBox, fadeOut);
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="none">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-50" y="-50" width={viewBox.w + 100} height={viewBox.h + 100}>
            <motion.path d={d} fill="none" stroke="#fff" strokeWidth={viewBox.w * 0.08} style={{ pathLength: progress }} />
          </mask>
        </defs>
        <path ref={pathRef} d={d} fill="none" stroke="none" />
        <path d={d} className="lp-trail" mask={`url(#${maskId})`} vectorEffect="non-scaling-stroke" />
      </svg>
      <div ref={planeRef} className="lp-plane"><PaperPlane /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo visuals (built from the app's own look, with made-up sample data)
// ---------------------------------------------------------------------------

const PEOPLE = {
  민수: "#e07a63",
  지은: "#5b9bc2",
  서연: "#5f9e7a",
};

function Avatar({ name, size = 28 }) {
  return (
    <span className="lp-avatar" style={{ background: PEOPLE[name], width: size, height: size, fontSize: size * 0.42 }}>
      {name[0]}
    </span>
  );
}

const DEMO_ITEMS = [
  { time: "10:00", text: "오사카성 공원 산책", who: "민수" },
  { time: "12:30", text: "구로몬 시장에서 점심", who: "지은" },
  { time: "15:00", text: "우메다 공중정원 전망대", who: "서연" },
  { time: "18:30", text: "도톤보리 야경 · 타코야키", who: "민수" },
];
const ROW_H = 58;

/** Three companions filling in the same day at once — the app's headline
 * feature, played on a loop while it's on screen. */
function CollabDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? DEMO_ITEMS.length : 0);

  useEffect(() => {
    if (reduce || !inView) return;
    const delay = step === 0 ? 700 : step < DEMO_ITEMS.length ? 1700 : 3600;
    const t = setTimeout(() => setStep((s) => (s >= DEMO_ITEMS.length ? 0 : s + 1)), delay);
    return () => clearTimeout(t);
  }, [step, inView, reduce]);

  const latest = step > 0 && step <= DEMO_ITEMS.length ? DEMO_ITEMS[step - 1] : null;

  return (
    <div ref={ref} className="lp-window lp-collab">
      <div className="lp-window-bar"><i /><i /><i /></div>
      <div className="lp-collab-head">
        <div>
          <div className="lp-collab-title">오사카 3박 4일</div>
          <div className="lp-collab-meta">10.3 – 10.6 · 3명</div>
        </div>
        <div className="lp-avatars">
          {Object.keys(PEOPLE).map((n) => <Avatar key={n} name={n} />)}
        </div>
      </div>
      <div className="lp-day-tabs">
        <span className="on">1일차</span><span>2일차</span><span>3일차</span><span>4일차</span>
      </div>
      <div className="lp-live"><span className="lp-live-dot" />실시간으로 함께 편집 중</div>

      <div className="lp-timeline" style={{ height: ROW_H * DEMO_ITEMS.length }}>
        <AnimatePresence>
          {DEMO_ITEMS.slice(0, step).map((item, i) => (
            <motion.div
              key={item.text}
              className="lp-tl-item"
              style={{ top: i * ROW_H, height: ROW_H - 10 }}
              initial={{ opacity: 0, x: -14, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <span className="lp-tl-time nums">{item.time}</span>
              <span className="lp-tl-text">{item.text}</span>
              <span className="lp-tl-bar" style={{ background: PEOPLE[item.who] }} />
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {latest && !reduce && (
            <motion.div
              key="cursor"
              className="lp-cursor"
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: (step - 1) * ROW_H + ROW_H / 2 - 6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
                <path d="M1 1l13 7-6 1.6L5 16z" fill={PEOPLE[latest.who]} stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              <span style={{ background: PEOPLE[latest.who] }}>{latest.who}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="lp-toast-slot">
        <AnimatePresence mode="wait">
          {latest && (
            <motion.div
              key={latest.text}
              className="lp-toast"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <Avatar name={latest.who} size={20} />
              <span><b>{latest.who}</b>님이 일정을 추가했어요</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function InviteVisual() {
  return (
    <div className="lp-stack">
      <motion.div
        className="lp-invite"
        initial={{ rotate: -4, y: 20, opacity: 0 }}
        whileInView={{ rotate: -2.5, y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <div className="lp-invite-eyebrow">T R I P &nbsp; P L A N N E R</div>
        <div className="lp-invite-kicker">동행자 초대장</div>
        <div className="lp-invite-info"><b>동행자 초대</b> | 3명 | 오사카</div>
        <div className="lp-invite-title">오사카 3박 4일</div>
        <div className="lp-invite-code">참여 코드 <span>K7Q2M9XA</span></div>
        <div className="lp-invite-plane"><PaperPlane size={40} /></div>
      </motion.div>
      <motion.div
        className="lp-window lp-members"
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.25 }}
      >
        <div className="lp-members-title">동행자</div>
        {[
          ["민수", "방장", "all"],
          ["지은", "모든 항목 편집", "all"],
          ["서연", "일정 · 체크리스트 편집", "some"],
        ].map(([name, role, kind], i) => (
          <motion.div
            key={name}
            className="lp-member"
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 + i * 0.15 }}
          >
            <Avatar name={name} />
            <span className="lp-member-name">{name}</span>
            <span className={"lp-role" + (kind === "some" ? " soft" : "")}>{role}</span>
          </motion.div>
        ))}
        <div className="lp-link-row">
          <span className="lp-link-url">tripplanner.kr/join/…</span>
          <span className="lp-mini-btn">공유하기</span>
        </div>
      </motion.div>
    </div>
  );
}

const MAP_STOPS = [
  { x: 92, y: 78, label: "오사카성" },
  { x: 226, y: 148, label: "구로몬 시장" },
  { x: 150, y: 232, label: "공중정원" },
  { x: 318, y: 238, label: "도톤보리" },
];

function MapVisual() {
  const route = `M${MAP_STOPS.map((s) => `${s.x} ${s.y}`).join(" L")}`;
  return (
    <div className="lp-window lp-map">
      <div className="lp-map-head">
        <span className="lp-chip">1일차 동선</span>
        <span className="lp-map-sub">장소 4곳</span>
      </div>
      <svg viewBox="0 0 400 300" className="lp-map-svg" aria-hidden="true">
        <rect width="400" height="300" className="lp-map-bg" />
        <path d="M-10 190 C 80 170, 140 280, 260 200 S 380 120, 420 150" className="lp-map-river" />
        <ellipse cx="96" cy="84" rx="58" ry="38" className="lp-map-park" />
        <path d="M0 120 H400 M0 262 H400 M60 0 V300 M190 0 V300 M300 0 V300" className="lp-map-road" />
        <path d="M0 40 L400 110 M120 300 L400 20" className="lp-map-road thin" />
        <motion.path
          d={route}
          className="lp-map-route"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.8, ease: "easeInOut", delay: 0.4 }}
        />
        {MAP_STOPS.map((s, i) => (
          <motion.g
            key={s.label}
            initial={{ opacity: 0, scale: 0.3 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.4 + i * 0.45 }}
            style={{ transformOrigin: `${s.x}px ${s.y}px`, transformBox: "view-box" }}
          >
            <circle cx={s.x} cy={s.y} r="13" className="lp-map-pin" />
            <text x={s.x} y={s.y + 4.5} className="lp-map-num">{i + 1}</text>
            <text x={s.x + (i >= 2 ? -16 : 16)} y={s.y - 16} className="lp-map-label" textAnchor={i >= 2 ? "end" : "start"}>{s.label}</text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

const EXPENSES = [
  { cat: "숙소", text: "난바 호텔 3박", who: "민수", amount: 480000 },
  { cat: "식비", text: "첫날 저녁", who: "지은", amount: 96000 },
  { cat: "교통", text: "간사이 공항 → 난바", who: "서연", amount: 36000 },
];

function BudgetVisual() {
  const total = EXPENSES.reduce((n, e) => n + e.amount, 0);
  return (
    <div className="lp-window lp-budget">
      <div className="lp-budget-rows">
        {EXPENSES.map((e, i) => (
          <motion.div
            key={e.text}
            className="lp-exp"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.18 }}
          >
            <span className="lp-chip">{e.cat}</span>
            <span className="lp-exp-text">{e.text}</span>
            <Avatar name={e.who} size={22} />
            <span className="lp-exp-amt nums">{e.amount.toLocaleString("ko-KR")}원</span>
          </motion.div>
        ))}
      </div>
      <div className="lp-budget-total">
        <span>총 지출</span><b><CountUp to={total} /></b>
      </div>
      <div className="lp-budget-total soft">
        <span>1인당</span><b><CountUp to={total / 3} /></b>
      </div>
      <div className="lp-settle">
        <div className="lp-settle-title">정산하기</div>
        {[["서연", 168000], ["지은", 108000]].map(([from, amt], i) => (
          <motion.div
            key={from}
            className="lp-settle-row"
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 1.4 + i * 0.25 }}
          >
            <Avatar name={from} size={22} />
            <span className="lp-settle-arrow"><Icon name="arrow" size={16} /></span>
            <Avatar name="민수" size={22} />
            <span className="lp-settle-text">{from}님이 민수님에게</span>
            <b className="nums">{amt.toLocaleString("ko-KR")}원</b>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const PLACES = [
  { name: "우메다 규카츠 전문점", desc: "겉바속촉 규카츠, 화로에 직접 구워 먹어요", price: "1만~2만원" },
  { name: "신세카이 쿠시카츠 골목", desc: "오사카 명물 꼬치튀김을 여러 가게에서", price: "1만원대" },
  { name: "난바 오코노미야키 식당", desc: "철판에서 바로 구워주는 현지 스타일", price: "1만원대" },
];

function RestaurantVisual() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [added, setAdded] = useState(Boolean(reduce));
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setTimeout(() => setAdded(true), 1500);
    return () => clearTimeout(t);
  }, [inView, reduce]);

  return (
    <div ref={ref} className="lp-window lp-food">
      <div className="lp-food-head"><Icon name="sparkle" size={18} /> AI 추천 · 오사카</div>
      {PLACES.map((p, i) => (
        <motion.div
          key={p.name}
          className="lp-place"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, delay: 0.15 + i * 0.15 }}
        >
          <div>
            <div className="lp-place-name">{p.name}</div>
            <div className="lp-place-desc">{p.desc} · {p.price}</div>
          </div>
          {i === 0 && (
            <motion.span className={"lp-add" + (added ? " done" : "")}>
              {added ? "2일차에 추가됨" : "+ 일정에 추가"}
            </motion.span>
          )}
        </motion.div>
      ))}
      <AnimatePresence>
        {added && (
          <motion.div
            className="lp-added-day"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="lp-added-inner">
              <span className="lp-chip">2일차</span>
              <span className="nums">19:00</span> 우메다 규카츠 전문점
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const FEATURES = [
  ["calendar", "일자별 일정", "시간순 타임라인으로 하루를 정리하고, 시간 미정 일정은 끌어서 순서를 바꿔요."],
  ["route", "동선 지도", "하루 일정의 장소를 지도 위에 순서대로 이어서 보여줘요."],
  ["users", "실시간 함께 편집", "초대 링크로 들어온 동행자와 같은 화면을 동시에 고쳐요."],
  ["wallet", "예산과 정산", "누가 얼마 냈는지 적어두면 1인당 금액과 정산까지 자동이에요."],
  ["sparkle", "AI 맛집 추천", "여행지 맛집을 추천받고 원하는 날 일정에 바로 넣어요."],
  ["check", "체크리스트", "기본 준비물 목록으로 시작하고, 지난 여행 목록도 가져와요."],
  ["ticket", "예약 정보", "항공권 · 숙소 예약번호와 링크를 한 곳에 모아둬요."],
  ["camera", "후기와 사진", "다녀온 여행의 이야기와 사진을 동행자와 함께 남겨요."],
];

const EXTRAS = [
  ["export", "캘린더로 내보내기", "일정을 구글 · 아이폰 캘린더에 한 번에 추가해요."],
  ["link", "공개 링크", "로그인 없이 볼 수 있는 읽기 전용 링크로 일정을 보여줘요."],
  ["image", "초대장 이미지", "단톡방에 올리기 좋은 초대장 이미지를 만들어줘요."],
  ["phone", "앱처럼 설치", "홈 화면에 추가하면 앱처럼 바로 열 수 있어요."],
];

const SECTIONS = [
  {
    id: "together",
    kicker: "함께 계획",
    title: "초대 링크 하나면,\n모두가 같은 화면을 봐요",
    body: "링크나 참여 코드를 보내면 동행자가 바로 합류해요. 누가 무엇을 바꾸든 모두의 화면에 실시간으로 반영돼요.",
    points: ["카카오톡으로 보내기 좋은 초대장 이미지와 링크", "항목별 편집 권한으로 역할 나누기", "방장 위임과 동행자 관리까지"],
    Visual: InviteVisual,
  },
  {
    id: "route",
    kicker: "일정과 동선",
    title: "어디서 어디로,\n하루 동선이 한눈에",
    body: "시간순으로 일정을 쌓고, 장소는 지도에서 직접 찍어 저장해요. 하루 일정은 지도 위에 순서대로 이어서 보여줘요.",
    points: ["시간순 자동 정렬, 시간 미정 일정은 끌어서 정리", "지도에서 직접 위치 지정", "동행자와 함께 쓰는 여행 메모"],
    Visual: MapVisual,
  },
  {
    id: "budget",
    kicker: "예산과 정산",
    title: "여행 끝나고 정산,\n이제 계산기 없이",
    body: "지출마다 누가 냈고 누구와 나눌지만 적어두세요. 1인당 금액과, 누가 누구에게 얼마를 보내면 되는지 자동으로 계산해요.",
    points: ["카테고리별 지출 집계", "1인당 분담 금액", "송금 횟수를 최소로 줄인 정산"],
    Visual: BudgetVisual,
  },
  {
    id: "food",
    kicker: "AI 맛집 추천",
    title: "현지 맛집 찾기,\nAI에게 맡겨보세요",
    body: "여행지에 맞는 맛집을 추천받고, 마음에 드는 곳은 버튼 한 번으로 원하는 날 일정에 넣어요. 위치도 자동으로 찾아서 저장해요.",
    points: ["여행지 기반 맛집 추천", "장소 위치 자동 저장", "원하는 날짜 일정에 바로 추가"],
    Visual: RestaurantVisual,
  },
];

const STEPS = [
  ["여행 만들기", "여행지와 날짜만 정하면 바로 시작이에요."],
  ["동행자 초대", "초대 링크를 단톡방에 공유하세요."],
  ["함께 계획하고 떠나기", "일정 · 예산 · 준비물을 같이 채워요."],
];

const HERO_PATH = "M-60 330 C 160 380, 300 140, 500 190 S 780 360, 1060 40";
const JOURNEY_PATH = "M88 0 C 88 70, 6 80, 6 190 S 94 330, 94 440 S 6 600, 6 700 S 90 830, 90 900 S 50 960, 50 1000";

export default function Landing() {
  const reduce = useReducedMotion();

  // The app's normal page padding would frame the full-bleed sections.
  useEffect(() => {
    document.body.classList.add("lp-body");
    return () => document.body.classList.remove("lp-body");
  }, []);

  const heroRef = useRef(null);
  const heroProgress = useMotionValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(heroProgress, 1, { duration: 2.6, ease: [0.45, 0, 0.2, 1], delay: 0.4 });
    return () => controls.stop();
  }, [heroProgress, reduce]);

  const journeyRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: journeyRef, offset: ["start 55%", "end 55%"] });
  const journeyProgress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.0005 });

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
      <div className="lp">
        <nav className="lp-nav">
          <Link to="/" className="lp-logo">
            <PaperPlane size={22} />
            <span>Trip Planner</span>
          </Link>
          <div className="lp-nav-links">
            <a href="#features">기능</a>
            <a href="#together">함께 쓰기</a>
            <a href="#steps">시작 방법</a>
          </div>
          <div className="lp-nav-cta">
            <Link to="/login" className="btn btn-ghost">로그인</Link>
            <Link to="/login" className="btn btn-primary btn-sm">무료로 시작하기</Link>
          </div>
        </nav>

        <header className="lp-hero" ref={heroRef}>
          {!reduce && (
            <FlightPath d={HERO_PATH} viewBox={{ w: 1000, h: 400 }} progress={heroProgress} boxRef={heroRef} className="lp-flight lp-flight-hero" maskId="lp-hero-mask" fadeOut />
          )}
          <div className="lp-hero-text">
            <motion.div className="lp-eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
              TRIP PLANNER
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}>
              친구와 함께 짜는 여행,<br />계획부터 정산까지 한곳에서
            </motion.h1>
            <motion.p className="lp-lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.16 }}>
              일정, 동선 지도, 예산과 정산, 체크리스트까지. 초대 링크 하나로 동행자와 실시간으로 같이 계획해요.
            </motion.p>
            <motion.div className="lp-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.24 }}>
              <Link to="/login" className="btn btn-primary lp-btn-lg">무료로 시작하기</Link>
              <a href="#features" className="btn lp-btn-lg">기능 둘러보기</a>
            </motion.div>
            <motion.div className="lp-hero-meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.4 }}>
              무료 · 설치 없이 웹에서 바로 · Google, 카카오 로그인
            </motion.div>
          </div>
          <motion.div className="lp-hero-visual" initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}>
            <CollabDemo />
          </motion.div>
        </header>

        <div className="lp-journey" ref={journeyRef}>
          {!reduce && (
            <FlightPath d={JOURNEY_PATH} viewBox={{ w: 100, h: 1000 }} progress={journeyProgress} boxRef={journeyRef} className="lp-flight lp-flight-journey" maskId="lp-journey-mask" />
          )}

          <section className="lp-section" id="features">
            <Reveal className="lp-section-head">
              <div className="lp-kicker">모든 기능</div>
              <h2>여행 준비에 필요한 건 다 있어요</h2>
              <p>메모 앱, 단톡방, 엑셀, 지도 앱을 오가던 일을 하나로 모았어요.</p>
            </Reveal>
            <div className="lp-feature-grid">
              {FEATURES.map(([icon, title, desc], i) => (
                <Reveal key={title} className="lp-feature" delay={(i % 4) * 0.08}>
                  <span className="lp-feature-icon"><Icon name={icon} /></span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </Reveal>
              ))}
            </div>
          </section>

          {SECTIONS.map(({ id, kicker, title, body, points, Visual }, i) => (
            <section key={id} id={id} className={"lp-section lp-split" + (i % 2 ? " flip" : "")}>
              <Reveal className="lp-split-text">
                <div className="lp-kicker">{kicker}</div>
                <h2>{title.split("\n").map((line, j) => <span key={j}>{line}<br /></span>)}</h2>
                <p>{body}</p>
                <ul>
                  {points.map((p) => <li key={p}><Icon name="check" size={18} />{p}</li>)}
                </ul>
              </Reveal>
              <div className="lp-split-visual"><Visual /></div>
            </section>
          ))}

          <section className="lp-section">
            <Reveal className="lp-section-head">
              <div className="lp-kicker">떠나기 전에도, 다녀와서도</div>
              <h2>필요한 순간에 꺼내 쓰는 기능들</h2>
            </Reveal>
            <div className="lp-extra-grid">
              {EXTRAS.map(([icon, title, desc], i) => (
                <Reveal key={title} className="lp-extra" delay={i * 0.08}>
                  <span className="lp-feature-icon"><Icon name={icon} /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="lp-section" id="steps">
            <Reveal className="lp-section-head">
              <div className="lp-kicker">시작 방법</div>
              <h2>세 단계면 충분해요</h2>
            </Reveal>
            <div className="lp-steps">
              {STEPS.map(([title, desc], i) => (
                <Reveal key={title} className="lp-step" delay={i * 0.12}>
                  <span className="lp-step-num nums">{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </Reveal>
              ))}
            </div>
          </section>
        </div>

        <section className="lp-final">
          <Reveal className="lp-final-inner">
            <motion.div
              className="lp-final-plane"
              initial={{ x: -120, y: 40, rotate: -20, opacity: 0 }}
              whileInView={{ x: 0, y: 0, rotate: -8, opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.1, ease: EASE }}
            >
              <PaperPlane size={48} />
            </motion.div>
            <h2>다음 여행, 지금 같이 계획해볼까요?</h2>
            <p>가입은 무료예요. 여행을 하나 만들고 친구에게 링크를 보내보세요.</p>
            <Link to="/login" className="btn btn-primary lp-btn-lg">무료로 시작하기</Link>
          </Reveal>
        </section>

        <footer className="lp-footer">
          <div className="lp-logo small"><PaperPlane size={18} /><span>Trip Planner</span></div>
          <div className="lp-footer-links">
            <Link to="/terms">이용약관</Link>
            <Link to="/privacy"><b>개인정보처리방침</b></Link>
          </div>
          <div className="lp-copy">© {new Date().getFullYear()} Trip Planner</div>
        </footer>
      </div>
    </MotionConfig>
    </LazyMotion>
  );
}
