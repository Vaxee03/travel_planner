// One-off migration: copies the two trips that lived in the Claude artifact's
// db into this project's Firestore. Run after web/.env.local is filled in:
//
//   node scripts/seed.mjs
//
// It signs in anonymously (same as the app does) and creates each trip with
// that session's uid as owner/member, then prints a `?join=<id>` URL per
// trip — open each once in the real app (signed in as yourself) to add your
// own account as a member.

import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.error("web/.env.local이 없거나 비어있어요. 먼저 Firebase 설정값을 채워주세요.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const TRIPS = [
  {
    title: "도쿄 & 하코네",
    destination: "도쿄, 하코네",
    startDate: "2026-12-01",
    endDate: "2026-12-05",
    travelers: 2,
    budgetTotal: 1500000,
    budgetItems: [],
    bookings: [],
    checklist: [
      "여권 & 항공권 e-티켓", "엔화 환전 / 트래블카드", "eSIM 또는 포켓와이파이",
      "료칸 예약 확인서", "온천용 소형 수건", "방한 외투 (하코네 산간, 도쿄보다 추움)",
      "편한 운동화", "보조배터리 & 충전기", "상비약", "여행자 보험",
      "캐리어 무게 확인", "숙소 주소 캡처 (오프라인 대비)",
    ].map((text) => ({ text, done: false })),
    review: { text: "", photos: [] },
    days: [
      { date: "2026-12-01", status: "open", summary: "인천 → 도쿄 도착, 숙소 체크인", items: [] },
      {
        date: "2026-12-02", status: "open", summary: "아키하바라 관광 & 쇼핑",
        items: [
          { kind: "time", time: "10:00", text: "아키하바라 전자상가 & 라디오 카이칸 — 레트로 게임, 피규어·프라모델" },
          { kind: "time", time: "11:00", text: "만다라케 콤플렉스 / 애니메이트 아키하바라" },
          { kind: "time", time: "12:30", text: "간다묘진 신사 (도보 10분)" },
          { kind: "time", time: "13:00", text: "점심 — 간다 야부소바 또는 아키하바라 테마 레스토랑" },
          { kind: "time", time: "14:30", text: "요도바시 카메라 아키바" },
          { kind: "time", time: "15:30", text: "진보초 헌책방 거리 (전철·도보 15분)" },
          { kind: "time", time: "17:00", text: "메이드카페 체험 (예약 권장)" },
          { kind: "time", time: "18:30", text: "오락실(GiGO) & 저녁식사" },
          { kind: "time", time: "20:00", text: "돈키호테 아키하바라점" },
        ],
      },
      { date: "2026-12-03", status: "open", summary: "", items: [] },
      {
        date: "2026-12-04", status: "confirmed", summary: "하코네 이동 · 관광 · 스이메이소 호텔 숙박",
        items: [
          { kind: "time", time: "08:21", text: "신주쿠 → 하코네유모토, 로망스카 (약 1시간 40분)" },
          { kind: "label", time: "이동", text: "하코네유모토 → 고라, 등산열차 (약 40분)" },
          { kind: "label", time: "이동", text: "고라 → 소운잔, 케이블카·푸니쿨라 (약 15분)" },
          { kind: "label", time: "이동", text: "소운잔 → 오와쿠다니, 로프웨이 · 흑계란 시식" },
          { kind: "label", time: "이동", text: "오와쿠다니 → 도겐다이, 대행버스" },
          { kind: "label", time: "이동", text: "도겐다이 → 하코네마치코, 하코네 해적선" },
          { kind: "label", time: "도보 37분", text: "하코네마치코 → 모토하코네, 하코네신사 & 평화의 토리이" },
          { kind: "label", time: "도보 30분", text: "모토하코네 → 하코네유모토, 텐잔온천" },
          { kind: "label", time: "숙박", text: "Hakone Suimeisou Hotel 체크인 & 1박" },
        ],
      },
      {
        date: "2026-12-05", status: "confirmed", summary: "하코네 → 도쿄 복귀, 식사 후 귀국",
        items: [
          { kind: "label", time: "이동", text: "하코네 → 도쿄 복귀, 로망스카" },
          { kind: "label", time: "식사", text: "점심 겸 저녁 식사" },
          { kind: "label", time: "귀국", text: "도쿄 → 인천 출발" },
        ],
      },
    ],
  },
  {
    title: "이갱 전역 여행",
    destination: "도쿄",
    startDate: "2026-12-01",
    endDate: "2026-12-05",
    travelers: 2,
    budgetTotal: 3000000,
    budgetItems: [],
    bookings: [],
    checklist: [
      "여권 & 항공권 e-티켓", "엔화 환전 / 트래블카드", "eSIM 또는 포켓와이파이",
      "숙소 예약 확인서", "보조배터리 & 충전기", "상비약", "여행자 보험", "캐리어 무게 확인",
    ].map((text) => ({ text, done: false })),
    review: { text: "", photos: [] },
    days: [],
  },
];

async function main() {
  const cred = await signInAnonymously(auth);
  const uid = cred.user.uid;
  console.log(`익명 계정으로 로그인: ${uid}\n`);

  for (const trip of TRIPS) {
    const ref = await addDoc(collection(db, "trips"), {
      ...trip,
      ownerId: uid,
      memberIds: [uid],
      createdAt: serverTimestamp(),
    });
    console.log(`"${trip.title}" 생성됨 (id: ${ref.id})`);
    console.log(`  → 내 계정으로 합류하려면 앱에서 이 주소를 한 번 열어주세요: /?join=${ref.id}\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("시드 실패:", err);
  process.exit(1);
});
