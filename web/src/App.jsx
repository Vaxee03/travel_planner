import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { firebaseReady, watchAuth, signOutUser, deleteMyAccount } from "./lib/firebase";
import { subscribeTrips, createTrip, mutateTrip, deleteTrip, joinTrip, removeMember, setChecklistDone, setPublicShareId, fetchNickname, setNickname } from "./lib/data";

const JOIN_FAILED = "여행에 참여하지 못했어요. 코드가 맞는지, 방장이 참여를 막지 않았는지 확인해주세요.";
import { NICKNAME_MAX } from "./lib/nickname";
import { randomNickname } from "./lib/randomNickname";
import {
  checklistItemId, copyChecklist, daysBetween, ensureChecklistIds, makeChecklistId, shiftDate,
  locateDay, locateItem, stableStringify, StaleEditError, FormError, fmtDate, normalizeLink,
  datesInRange, emptyDay, outsideTrip, myReviewDraft,
} from "./lib/utils";
import { computePerms, PERMISSION_CATEGORIES } from "./lib/permissions";
import Home from "./components/Home";
import AuthGate from "./components/AuthGate";

// Loaded on demand so the first screen (login / trip list) doesn't have to
// download the trip page, every form and the Google Maps library up front.
const loadModals = () => import("./components/Modals");
const TripDetail = lazy(() => import("./components/TripDetail"));
const ModalHost = lazy(loadModals);
const PublicTripView = lazy(() => import("./components/PublicTripView"));
const TermsPage = lazy(() => import("./components/LegalPage").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./components/LegalPage").then((m) => ({ default: m.PrivacyPage })));
// The landing page is what signed-out visitors see at "/"; start fetching it
// right away there so it isn't waiting on the auth check to begin loading.
const loadLanding = () => import("./components/Landing");
const Landing = lazy(loadLanding);
if (typeof window !== "undefined" && window.location.pathname === "/") loadLanding();

const TAB_KEYS = ["itinerary", "budget", "checklist", "bookings", "restaurants", "review"];

function getTrip(trips, id) {
  return trips.find((t) => t.id === id) || null;
}

export default function App() {
  const [authResolved, setAuthResolved] = useState(false);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [trips, setTrips] = useState([]);
  const [tripsReady, setTripsReady] = useState(false);

  // Which screen/trip/tab is showing lives in the URL (/, /trip/:tripId/:tab,
  // /join/:tripId) so a refresh or a shared link lands on the same view.
  const location = useLocation();
  const navigate = useNavigate();
  const tripMatch = matchPath("/trip/:tripId/:tab?", location.pathname);
  const joinMatch = matchPath("/join/:tripId", location.pathname);
  const shareMatch = matchPath("/share/:shareId", location.pathname);
  const tripId = tripMatch?.params.tripId || null;
  const tab = TAB_KEYS.includes(tripMatch?.params.tab) ? tripMatch.params.tab : "itinerary";
  const [dayIdx, setDayIdx] = useState(null);
  const [modal, setModal] = useState(null);
  // A one-off notice shown above the page (e.g. an invite link that failed).
  const [flash, setFlash] = useState(null);
  const [nickname, setNicknameState] = useState("");
  const nicknamePromptedRef = useRef(null);

  useEffect(() => {
    if (!firebaseReady) { setAuthError("Firebase 설정이 없어요. web/.env.local을 채워주세요."); setAuthResolved(true); return; }
    const unsub = watchAuth((u) => {
      // Guest/anonymous auth isn't a supported sign-in method anymore — a
      // browser that still has an old cached anonymous session (from before
      // this was removed) gets signed straight back out instead of silently
      // continuing as a ghost guest.
      if (u?.isAnonymous) { signOutUser(); return; }
      setUser(u);
      setAuthResolved(true);
    });
    return unsub;
  }, []);

  // A different account (or a sign-out) can't still be looking at the
  // previous account's trip screen, so drop back to the trip list. The first
  // sign-in of a page load (null → user) is left alone so a refreshed or
  // shared /trip/... or /join/... URL still opens where it points.
  const prevUidRef = useRef(null);
  useEffect(() => {
    const uid = user?.uid || null;
    const prev = prevUidRef.current;
    prevUidRef.current = uid;
    if (prev && prev !== uid) navigate("/", { replace: true });
  }, [user, navigate]);

  // Once signed in, fetch the trip page and forms in the background while the
  // browser is idle, so opening the first trip or form isn't delayed by the
  // download (they stay out of the initial page load either way).
  useEffect(() => {
    if (!user) return;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(() => { import("./components/TripDetail"); loadModals(); });
  }, [user]);

  // Any other path (typo, old bookmark) just falls back to the trip list.
  const legalPage = location.pathname === "/terms" ? "terms" : location.pathname === "/privacy" ? "privacy" : null;
  const loginPage = location.pathname === "/login";
  const aboutPage = location.pathname === "/about";
  const knownPath = Boolean(location.pathname === "/" || loginPage || aboutPage || tripMatch || joinMatch || shareMatch || legalPage);
  useEffect(() => {
    if (!knownPath) navigate("/", { replace: true });
  }, [knownPath, navigate]);

  // /login is only for signed-out visitors; once signed in, go to the trips.
  useEffect(() => {
    if (user && loginPage) navigate("/", { replace: true });
  }, [user, loginPage, navigate]);

  // The day picked inside the itinerary tab isn't part of the URL, so it
  // resets whenever a different trip is opened.
  useEffect(() => { setDayIdx(null); }, [tripId]);

  // Consume an invite link — /join/<tripId>, or the older ?join=<tripId> form
  // that already-shared invite cards still point at — then open that trip.
  const joinId = joinMatch?.params.tripId || new URLSearchParams(location.search).get("join");
  useEffect(() => {
    if (!user || !joinId) return;
    joinTrip(joinId, user.uid)
      .then(() => navigate(`/trip/${joinId}/itinerary`, { replace: true }))
      .catch(() => { setFlash(JOIN_FAILED); navigate("/", { replace: true }); });
  }, [user, joinId, navigate]);

  // If a nickname hasn't been set yet (brand-new signup or a pre-existing
  // account from before this feature), prompt once per login — skippable,
  // since the rest of the app falls back to a default label when it's blank.
  useEffect(() => {
    if (!user) { setNicknameState(""); return; }
    let cancelled = false;
    fetchNickname(user.uid).then((nick) => {
      if (cancelled) return;
      setNicknameState(nick);
      if (!nick && nicknamePromptedRef.current !== user.uid) {
        nicknamePromptedRef.current = user.uid;
        setModal({ type: "set-nickname", suggested: randomNickname() });
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) { setTrips([]); setTripsReady(false); return; }
    const unsub = subscribeTrips(
      user.uid,
      (list) => { setTrips(list); setTripsReady(true); },
      (err) => setAuthError(err?.message || "데이터를 불러오지 못했어요.")
    );
    return unsub;
  }, [user]);

  const trip = tripId ? getTrip(trips, tripId) : null;

  function openTrip(id) {
    navigate(`/trip/${id}/itinerary`);
  }
  function goHome() {
    navigate("/");
  }
  function setTab(key) {
    navigate(`/trip/${tripId}/${key}`);
  }
  // Forms that act on an existing item remember the trip as it was when they
  // opened: the live trip keeps updating from other members' edits, so
  // "item #idx" could otherwise point at a different item by submit time.
  function openModal(m) { setModal({ ...m, tripAtOpen: trip }); }
  function closeModal() { setModal(null); }

  function requestDelete(onYes, message, extra) {
    setModal({ type: "confirm", onYes, message, ...extra, tripAtOpen: trip });
  }

  async function handleJoinByCode(code) {
    await joinTrip(code, user.uid);
    openTrip(code);
  }

  // A targeted single-field update rather than a mutateTrip transaction, so
  // it works offline too and stays allowed for every member regardless of
  // checklist permission (see setChecklistDone's doc comment).
  function toggleCheck(idx) {
    const item = trip.checklist[idx];
    const id = checklistItemId(item, idx);
    const wasDone = trip.checklistDone?.[id] ?? item.done ?? false;
    setChecklistDone(tripId, id, !wasDone);
  }

  function reorderDayItems(dayIdx, newItems) {
    const seen = trip.days[dayIdx];
    return runMutation(() => mutateTrip(tripId, (t) => {
      const day = t.days[locateDay(t.days, seen.date)];
      // Only a pure reorder of the items the user was looking at — if someone
      // added/removed/edited one meanwhile, don't overwrite their change.
      const sortedKeys = (items) => (items || []).map(stableStringify).sort().join("|");
      if (sortedKeys(day.items) !== sortedKeys(seen.items)) throw new StaleEditError();
      day.items = newItems;
    })).catch(() => false);
  }

  // Runs a trip write; if the item the user acted on was already changed or
  // deleted by another member, says so instead of failing silently.
  async function runMutation(fn) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof StaleEditError) {
        window.alert("다른 동행자가 이 항목을 먼저 바꿨어요. 화면이 최신 내용으로 바뀌었으니 확인 후 다시 시도해주세요.");
        return false;
      }
      throw err;
    }
    return true;
  }

  async function handleModalSubmit(m, values) {
    const seenTrip = m.tripAtOpen || trip;
    if (m.type === "confirm") {
      if (m.run) {
        m.run();
        closeModal();
        return;
      }
      if (m.onYes === "delete-trip") {
        await deleteTrip(tripId);
        navigate("/", { replace: true });
      } else if (m.onYes === "remove-member") {
        await removeMember(tripId, m.uid, { block: true });
      } else if (m.onYes === "leave-trip") {
        await removeMember(tripId, user.uid);
        navigate("/", { replace: true });
      } else if (m.onYes === "delete-day") {
        const date = seenTrip.days[m.idx].date;
        await runMutation(() => mutateTrip(tripId, (t) => {
          t.days.splice(locateDay(t.days, date), 1);
        }));
        setDayIdx(null);
      } else if (m.onYes === "delete-item") {
        const seenDay = seenTrip.days[m.dayIdx];
        const seenItem = seenDay.items[m.idx];
        await runMutation(() => mutateTrip(tripId, (t) => {
          const day = t.days[locateDay(t.days, seenDay.date)];
          day.items.splice(locateItem(day.items, m.idx, seenItem), 1);
        }));
      } else if (m.onYes === "delete-budget") {
        const seen = seenTrip.budgetItems[m.idx];
        await runMutation(() => mutateTrip(tripId, (t) => {
          t.budgetItems.splice(locateItem(t.budgetItems, m.idx, seen), 1);
        }));
      } else if (m.onYes === "delete-check") {
        const seen = seenTrip.checklist[m.idx];
        const seenId = checklistItemId(seen, m.idx);
        await runMutation(() => mutateTrip(tripId, (t) => {
          const idx = seen.id ? t.checklist.findIndex((c) => c.id === seen.id) : locateItem(t.checklist, m.idx, seen);
          if (idx < 0) throw new StaleEditError();
          t.checklist.splice(idx, 1);
          if (t.checklistDone) delete t.checklistDone[seenId];
        }));
      } else if (m.onYes === "delete-booking") {
        const seen = seenTrip.bookings[m.idx];
        await runMutation(() => mutateTrip(tripId, (t) => {
          t.bookings.splice(locateItem(t.bookings, m.idx, seen), 1);
        }));
      } else if (m.onYes === "delete-review") {
        // Only ever your own (see Review.jsx); a tombstone also hides any
        // older post of yours in the legacy shared array.
        await mutateTrip(tripId, (t) => {
          t.reviewsBy = t.reviewsBy || {};
          t.reviewsBy[user.uid] = { deleted: true, updatedAt: Date.now() };
        });
      }
      closeModal();
      return;
    }

    if (m.type === "set-nickname" || m.type === "edit-nickname") {
      const nick = (values.nickname || "").trim();
      if (!nick) throw new FormError("닉네임을 입력해주세요.");
      if (nick.length > NICKNAME_MAX) throw new FormError(`닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있어요.`);
      await setNickname(user.uid, nick);
      setNicknameState(nick);
      closeModal();
      return;
    }
    if (m.type === "manage-permissions") {
      await mutateTrip(tripId, (t) => {
        const memberIds = (t.memberIds || []).filter((id) => id !== t.ownerId);
        const next = {};
        memberIds.forEach((id) => {
          const cats = PERMISSION_CATEGORIES.filter((c) => values[`perm_${id}_${c.key}`] === "on").map((c) => c.key);
          if (cats.length) next[id] = cats;
        });
        t.memberPermissions = next;
      });
      closeModal();
      return;
    }
    if (m.type === "delete-account") {
      await deleteMyAccount();
      closeModal();
      navigate("/", { replace: true });
      return;
    }
    if (m.type === "share-link") {
      // Only flips publicShareId; the getPublicTrip function looks the trip
      // up by it on each view. The modal stays open so the new link shows up.
      await setPublicShareId(tripId, values.action === "on");
      return;
    }
    if (m.type === "transfer-ownership") {
      await mutateTrip(tripId, (t) => {
        const newOwnerId = values.newOwnerId;
        if (newOwnerId && (t.memberIds || []).includes(newOwnerId)) {
          t.ownerId = newOwnerId;
        }
      });
      closeModal();
      return;
    }
    if (m.type === "add-trip") {
      const fields = {
        title: values.title, destination: values.destination,
        startDate: values.startDate, endDate: values.endDate,
        travelers: Number(values.travelers) || 1,
        budgetTotal: Number(values.budgetTotal) || 0,
        tripType: values.tripType === "domestic" ? "domestic" : "international",
        days: datesInRange(values.startDate, values.endDate).map(emptyDay),
      };
      const source = values.checklistFrom ? getTrip(trips, values.checklistFrom) : null;
      if (source) fields.checklist = copyChecklist(source.checklist);
      const id = await createTrip(user.uid, fields);
      openTrip(id);
      closeModal();
      return;
    }
    if (m.type === "duplicate-trip") {
      // Copies the plan itself — itinerary (dates moved to the new start),
      // memo and checklist — but nothing personal to the original group:
      // no members, budget, bookings, reviews or share link.
      const offset = trip.startDate ? daysBetween(trip.startDate, values.startDate) : 0;
      const id = await createTrip(user.uid, {
        title: values.title,
        destination: trip.destination,
        tripType: trip.tripType,
        travelers: trip.travelers,
        budgetTotal: trip.budgetTotal,
        startDate: values.startDate,
        endDate: shiftDate(trip.endDate, offset),
        days: structuredClone(trip.days || []).map((d) => ({ ...d, date: shiftDate(d.date, offset) })),
        itineraryMemo: trip.itineraryMemo || "",
        checklist: copyChecklist(trip.checklist),
      });
      closeModal();
      openTrip(id);
      return;
    }
    if (m.type === "edit-trip") {
      await mutateTrip(tripId, (t) => {
        if (values.moveDays === "on") {
          // Keep each day's place in the trip (day 1 stays day 1), then add
          // an empty day for any date of the new range that has none. Days
          // that fall outside the new range are kept (marked in the list).
          const offset = t.startDate && values.startDate ? daysBetween(t.startDate, values.startDate) : 0;
          const days = (t.days || []).map((d) => ({ ...d, date: shiftDate(d.date, offset) }));
          const have = new Set(days.map((d) => d.date));
          datesInRange(values.startDate, values.endDate).forEach((date) => { if (!have.has(date)) days.push(emptyDay(date)); });
          days.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          t.days = days;
        }
        t.title = values.title; t.destination = values.destination;
        t.startDate = values.startDate; t.endDate = values.endDate;
        t.travelers = Number(values.travelers) || 1;
        t.budgetTotal = Number(values.budgetTotal) || 0;
        t.tripType = values.tripType === "domestic" ? "domestic" : "international";
      });
      closeModal();
      return;
    }
    if (m.type === "add-day") {
      await mutateTrip(tripId, (t) => {
        t.days = t.days || [];
        // Days are looked up by date everywhere, so two days with the same
        // date would send edits on the second one to the first.
        if (t.days.some((d) => d.date === values.date)) throw new FormError(`${fmtDate(values.date)}은(는) 이미 있는 날짜예요. 그 날짜에 항목을 추가해주세요.`);
        if (outsideTrip(t, values.date)) throw new FormError(`여행 기간(${t.startDate} ~ ${t.endDate}) 밖의 날짜예요. 먼저 '여행 정보 수정'에서 기간을 바꿔주세요.`);
        t.days.push({ date: values.date, status: values.status, summary: values.summary, items: [] });
        t.days.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      });
      closeModal();
      return;
    }
    if (m.type === "edit-day") {
      const date = seenTrip.days[m.idx].date;
      await runMutation(() => mutateTrip(tripId, (t) => {
        const d = t.days[locateDay(t.days, date)];
        if (values.date !== date && t.days.some((x) => x.date === values.date)) throw new FormError(`${fmtDate(values.date)}은(는) 이미 있는 날짜예요.`);
        if (values.date !== date && outsideTrip(t, values.date)) throw new FormError(`여행 기간(${t.startDate} ~ ${t.endDate}) 밖의 날짜예요.`);
        d.date = values.date; d.status = values.status; d.summary = values.summary;
        t.days.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      }));
      closeModal();
      return;
    }
    if (m.type === "add-item" || m.type === "edit-item" || m.type === "add-restaurant") {
      const seenDay = seenTrip.days[m.type === "add-restaurant" ? Number(values.dayIdx) || 0 : m.dayIdx];
      const seenItem = m.type === "edit-item" ? seenDay.items[m.idx] : null;
      await runMutation(() => mutateTrip(tripId, (t) => {
        const day = t.days[locateDay(t.days, seenDay.date)];
        day.items = day.items || [];
        const itemIdx = seenItem ? locateItem(day.items, m.idx, seenItem) : -1;
        const kind = values.kind === "label" ? "label" : "time";
        const item = {
          kind,
          time: kind === "time" ? values.timeValue : values.labelValue,
          text: values.text,
        };
        if (values.locationJson) item.location = JSON.parse(values.locationJson);
        // Tags the item with the recommendation it came from, so the 맛집 tab
        // can show "✓ 일정에 추가됨" even if the user renamed the item.
        if (m.type === "add-restaurant") item.restaurant = m.restaurant.name;
        else if (seenItem?.restaurant) item.restaurant = seenItem.restaurant;
        if (seenItem) day.items[itemIdx] = item;
        else day.items.push(item);
      }));
      closeModal();
      return;
    }
    if (m.type === "add-budget" || m.type === "edit-budget") {
      const seen = m.type === "edit-budget" ? seenTrip.budgetItems[m.idx] : null;
      await runMutation(() => mutateTrip(tripId, (t) => {
        t.budgetItems = t.budgetItems || [];
        const itemIdx = seen ? locateItem(t.budgetItems, m.idx, seen) : -1;
        const prev = seen ? t.budgetItems[itemIdx] : { createdBy: user.uid };
        const item = { ...prev, category: values.category, amount: Number(values.amount) || 0, memo: values.memo };
        // The split fields only exist on a multi-member trip. The split list is
        // stored explicitly (not "everyone") so someone who joins later isn't
        // retroactively charged for costs from before they joined.
        if ((t.memberIds || []).length > 1) {
          const split = t.memberIds.filter((id) => values[`split_${id}`] === "on");
          item.splitAmong = split.length ? split : [...t.memberIds];
          if (values.paidBy) item.paidBy = values.paidBy;
          else delete item.paidBy;
        }
        if (seen) t.budgetItems[itemIdx] = item;
        else t.budgetItems.push(item);
      }));
      closeModal();
      return;
    }
    if (m.type === "edit-check") {
      const seen = seenTrip.checklist[m.idx];
      await runMutation(() => mutateTrip(tripId, (t) => {
        const idx = seen.id ? t.checklist.findIndex((c) => c.id === seen.id) : locateItem(t.checklist, m.idx, seen);
        if (idx < 0) throw new StaleEditError();
        // Same id, so its checked state (checklistDone[id]) carries over.
        const item = { ...t.checklist[idx], text: values.text };
        if (values.assignedTo) item.assignedTo = values.assignedTo;
        else delete item.assignedTo;
        t.checklist[idx] = item;
      }));
      closeModal();
      return;
    }
    if (m.type === "add-check") {
      await mutateTrip(tripId, (t) => {
        // Backfill ids onto any pre-existing legacy items in the same write —
        // this write already requires checklist permission, so it's a free
        // opportunity to migrate the trip off the position-based fallback id.
        t.checklist = ensureChecklistIds(t.checklist);
        const checkItem = { id: makeChecklistId(), text: values.text };
        if (values.assignedTo) checkItem.assignedTo = values.assignedTo;
        t.checklist.push(checkItem);
      });
      closeModal();
      return;
    }
    if (m.type === "add-booking" || m.type === "edit-booking") {
      const seen = m.type === "edit-booking" ? seenTrip.bookings[m.idx] : null;
      const link = normalizeLink(values.link);
      if (link === null) throw new FormError("링크는 인터넷 주소로 입력해주세요. (예: https://hotel.com 또는 www.hotel.com)");
      await runMutation(() => mutateTrip(tripId, (t) => {
        t.bookings = t.bookings || [];
        const booking = { type: values.type, name: values.name, confirmNumber: values.confirmNumber, link, memo: values.memo };
        if (seen) t.bookings[locateItem(t.bookings, m.idx, seen)] = booking;
        else t.bookings.push(booking);
      }));
      closeModal();
      return;
    }
    if (m.type === "edit-review") {
      await mutateTrip(tripId, (t) => {
        const mine = myReviewDraft(t, user.uid);
        mine.text = values.text;
        mine.updatedAt = Date.now();
      });
      closeModal();
      return;
    }
  }

  // Signed-out visitors at "/" get the full-width landing page instead of the
  // app shell (the login form lives at /login). Until auth is known, render
  // nothing there so a signed-in user doesn't see the landing flash by.
  // /about shows the same landing page to signed-in users too (the header
  // logo links there), with its buttons pointing back to their trips.
  const onLandingPath = (location.pathname === "/" && !joinId && !authError) || aboutPage;
  if (onLandingPath && !authResolved) return null;
  if (onLandingPath && (!user || aboutPage)) {
    return (
      <Suspense fallback={null}>
        <Landing signedIn={Boolean(user)} nickname={nickname} />
      </Suspense>
    );
  }

  return (
    <div className="page">
      <header className="top">
        <Link to={user ? "/about" : "/"} className="eyebrow brand-link">Trip Planner</Link>
        <div className="top-row">
          <div>
            <h1><Link to={user ? "/about" : "/"} className="brand-link">여행 플래너</Link></h1>
            <div className="subline">여러 여행을 관리하고, 다녀온 여행엔 후기와 사진을 남겨보세요.</div>
          </div>
          <div className="btn-row" style={{ alignItems: "center", ...(!user && (loginPage || legalPage) ? { alignSelf: "flex-end" } : null) }}>
            {!user && loginPage && (
              // Back to wherever they came from inside the site (usually the
              // landing page); a direct visit to /login has nothing to go back
              // to, so fall back to the landing page.
              <button
                type="button"
                className="back-link"
                style={{ marginBottom: 0, fontSize: 16.5 }}
                onClick={() => (location.key !== "default" ? navigate(-1) : navigate("/"))}
              >
                ← 뒤로가기
              </button>
            )}
            {(user || legalPage) && (
              <div className="top-right-stack">
                {user && (
                  <span className="btn-row" style={{ alignItems: "center" }}>
                    <span style={{ color: "var(--nickname)", fontSize: 15, fontWeight: 700 }}>{nickname || "닉네임 없음"}</span>
                    <button className="btn btn-sm" onClick={() => setModal({ type: "edit-nickname", currentNickname: nickname })}>닉네임 수정</button>
                    <button className="btn btn-sm" onClick={signOutUser}>로그아웃</button>
                  </span>
                )}
                {legalPage && (
                  // Terms/privacy are reached from the landing page's footer,
                  // so "back" always means the landing page (/about when signed in).
                  <Link className="back-link" style={{ marginBottom: 0, fontSize: 16.5 }} to={user ? "/about" : "/"}>
                    ← 뒤로가기
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {flash && (
        <div className="note flash" role="status">
          <span className="dot" /><span style={{ flex: 1 }}>{flash}</span>
          <button type="button" className="btn-ghost" aria-label="닫기" onClick={() => setFlash(null)}>✕</button>
        </div>
      )}
      <Suspense fallback={<div className="empty">불러오는 중이에요…</div>}>
      {legalPage === "terms" ? (
        <TermsPage />
      ) : legalPage === "privacy" ? (
        <PrivacyPage />
      ) : shareMatch ? (
        <PublicTripView shareId={shareMatch.params.shareId} />
      ) : authError ? (
        <div className="empty">{authError}</div>
      ) : !authResolved ? (
        <div className="empty">불러오는 중이에요…</div>
      ) : !user ? (
        <AuthGate onAuthed={setUser} />
      ) : !tripsReady ? (
        <div className="empty">저장 기능을 불러오는 중이에요…</div>
      ) : joinId ? (
        <div className="empty">초대받은 여행에 참여하는 중이에요…</div>
      ) : !tripId ? (
        <Home trips={trips} onOpenTrip={openTrip} onAddTrip={() => openModal({ type: "add-trip" })} onJoinByCode={handleJoinByCode} />
      ) : trip ? (
        <TripDetail
          trip={trip}
          uid={user.uid}
          perms={computePerms(trip, user.uid)}
          tab={tab}
          setTab={setTab}
          dayIdx={dayIdx}
          setDayIdx={setDayIdx}
          openModal={openModal}
          requestDelete={requestDelete}
          toggleCheck={toggleCheck}
          reorderDayItems={reorderDayItems}
          onBack={goHome}
          onEditTrip={() => openModal({ type: "edit-trip" })}
          onDeleteTrip={() => requestDelete("delete-trip", "이 여행을 삭제할까요? 되돌릴 수 없어요.")}
        />
      ) : (
        <div className="empty">
          여행을 찾을 수 없어요. 삭제됐거나 참여하지 않은 여행이에요.
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => navigate("/", { replace: true })}>여행 목록으로</button>
          </div>
        </div>
      )}
      </Suspense>

      <footer className="app-footer">
        {user && <>여행 플래너 · {trips.length}개 여행 관리 중<br /></>}
        <span className="footer-links">
          <Link to="/terms">이용약관</Link>
          <Link to="/privacy"><b>개인정보처리방침</b></Link>
          {user && <button type="button" className="btn-ghost" onClick={() => setModal({ type: "delete-account" })}>회원 탈퇴</button>}
        </span>
      </footer>

      {modal && (
        <Suspense fallback={null}>
          <ModalHost modal={modal} trip={trip} trips={trips} uid={user?.uid} onClose={closeModal} onSubmit={handleModalSubmit} />
        </Suspense>
      )}
    </div>
  );
}
