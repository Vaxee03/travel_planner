import { useEffect, useRef, useState } from "react";
import { firebaseReady, watchAuth, signOutUser } from "./lib/firebase";
import { subscribeTrips, createTrip, saveTrip, deleteTrip, joinTrip, setChecklistDone } from "./lib/tripsApi";
import { fetchNickname, setNickname } from "./lib/users";
import { randomNickname } from "./lib/randomNickname";
import { checklistItemId, ensureChecklistIds, makeChecklistId } from "./lib/utils";
import { computePerms, PERMISSION_CATEGORIES } from "./lib/permissions";
import Home from "./components/Home";
import TripDetail from "./components/TripDetail";
import ModalHost from "./components/Modals";
import AuthGate from "./components/AuthGate";

function getTrip(trips, id) {
  return trips.find((t) => t.id === id) || null;
}

export default function App() {
  const [authResolved, setAuthResolved] = useState(false);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [trips, setTrips] = useState([]);
  const [tripsReady, setTripsReady] = useState(false);

  const [screen, setScreen] = useState("home");
  const [tripId, setTripId] = useState(null);
  const [tab, setTab] = useState("itinerary");
  const [dayIdx, setDayIdx] = useState(null);
  const [modal, setModal] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [nickname, setNicknameState] = useState("");
  const nicknamePromptedRef = useRef(null);

  useEffect(() => {
    if (!firebaseReady) { setAuthError("Firebase 설정이 없어요. web/.env.local을 채워주세요."); setAuthResolved(true); return; }
    const unsub = watchAuth((u) => {
      // A different account (or a sign-out) can't still be looking at the
      // previous account's trip screen, so drop back to the trip list.
      setUser((prev) => {
        if (prev?.uid !== u?.uid) { setScreen("home"); setTripId(null); }
        return u;
      });
      setAuthResolved(true);
    });
    return unsub;
  }, []);

  // Once a real (non-anonymous) user is signed in, consume a pending
  // ?join=<tripId> link from the URL exactly once.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (!joinId) return;
    joinTrip(joinId, user.uid)
      .catch(() => {})
      .then(() => window.history.replaceState(null, "", window.location.pathname));
  }, [user]);

  // Non-guest accounts need a nickname for other members to see them by; if
  // one hasn't been set yet (brand-new signup or a pre-existing account from
  // before this feature), prompt once per login — skippable, since the rest
  // of the app falls back to a default label when it's blank.
  useEffect(() => {
    if (!user || user.isAnonymous) { setNicknameState(""); return; }
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
    setScreen("trip"); setTripId(id); setTab("itinerary"); setDayIdx(null);
  }
  function goHome() {
    setScreen("home"); setTripId(null); setDayIdx(null); setTab("itinerary");
  }
  function openModal(m) { setModal(m); }
  function closeModal() { setModal(null); }

  function requestDelete(onYes, message, extra) {
    setModal({ type: "confirm", onYes, message, ...extra });
  }

  async function handleJoinByCode(code) {
    await joinTrip(code, user.uid);
    openTrip(code);
  }

  // A targeted field update (not the usual clone-whole-trip-and-saveTrip
  // pattern), so this stays allowed for every member regardless of checklist
  // permission and can't get caught up in an unrelated stale-field conflict
  // (see setChecklistDone's doc comment).
  function toggleCheck(idx) {
    const item = trip.checklist[idx];
    const id = checklistItemId(item, idx);
    const wasDone = trip.checklistDone?.[id] ?? item.done ?? false;
    setChecklistDone(tripId, id, !wasDone);
  }

  function reorderDayItems(dayIdx, newItems) {
    const t = structuredClone(trip);
    t.days[dayIdx].items = newItems;
    saveTrip(t);
  }

  async function handleModalSubmit(m, values) {
    if (m.type === "confirm") {
      if (m.onYes === "delete-trip") {
        await deleteTrip(tripId);
        goHome();
      } else if (m.onYes === "delete-day") {
        const t = structuredClone(trip);
        t.days.splice(m.idx, 1);
        await saveTrip(t);
        setDayIdx(null);
      } else if (m.onYes === "delete-item") {
        const t = structuredClone(trip);
        t.days[m.dayIdx].items.splice(m.idx, 1);
        await saveTrip(t);
      } else if (m.onYes === "delete-budget") {
        const t = structuredClone(trip);
        t.budgetItems.splice(m.idx, 1);
        await saveTrip(t);
      } else if (m.onYes === "delete-check") {
        const t = structuredClone(trip);
        const id = checklistItemId(t.checklist[m.idx], m.idx);
        t.checklist.splice(m.idx, 1);
        if (t.checklistDone) delete t.checklistDone[id];
        await saveTrip(t);
      } else if (m.onYes === "delete-booking") {
        const t = structuredClone(trip);
        t.bookings.splice(m.idx, 1);
        await saveTrip(t);
      } else if (m.onYes === "delete-review") {
        const t = structuredClone(trip);
        t.reviews = (t.reviews || []).filter((r) => r.authorId !== m.authorId);
        await saveTrip(t);
      }
      closeModal();
      return;
    }

    if (m.type === "set-nickname" || m.type === "edit-nickname") {
      const nick = (values.nickname || "").trim();
      if (nick) {
        await setNickname(user.uid, nick);
        setNicknameState(nick);
      }
      closeModal();
      return;
    }
    if (m.type === "manage-permissions") {
      const t = structuredClone(trip);
      const memberIds = (t.memberIds || []).filter((id) => id !== t.ownerId);
      const next = {};
      memberIds.forEach((id) => {
        const cats = PERMISSION_CATEGORIES.filter((c) => values[`perm_${id}_${c.key}`] === "on").map((c) => c.key);
        if (cats.length) next[id] = cats;
      });
      t.memberPermissions = next;
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "transfer-ownership") {
      const t = structuredClone(trip);
      const newOwnerId = values.newOwnerId;
      if (newOwnerId && (t.memberIds || []).includes(newOwnerId)) {
        t.ownerId = newOwnerId;
      }
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-trip") {
      const id = await createTrip(user.uid, {
        title: values.title, destination: values.destination,
        startDate: values.startDate, endDate: values.endDate,
        travelers: Number(values.travelers) || 1,
        budgetTotal: Number(values.budgetTotal) || 0,
        tripType: values.tripType === "domestic" ? "domestic" : "international",
      });
      openTrip(id);
      closeModal();
      return;
    }
    if (m.type === "edit-trip") {
      const t = structuredClone(trip);
      t.title = values.title; t.destination = values.destination;
      t.startDate = values.startDate; t.endDate = values.endDate;
      t.travelers = Number(values.travelers) || 1;
      t.budgetTotal = Number(values.budgetTotal) || 0;
      t.tripType = values.tripType === "domestic" ? "domestic" : "international";
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-day") {
      const t = structuredClone(trip);
      t.days = t.days || [];
      t.days.push({ date: values.date, status: values.status, summary: values.summary, items: [] });
      t.days.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "edit-day") {
      const t = structuredClone(trip);
      const d = t.days[m.idx];
      d.date = values.date; d.status = values.status; d.summary = values.summary;
      t.days.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-item" || m.type === "edit-item") {
      const t = structuredClone(trip);
      const day = t.days[m.dayIdx];
      day.items = day.items || [];
      const kind = values.kind === "label" ? "label" : "time";
      const item = {
        kind,
        time: kind === "time" ? values.timeValue : values.labelValue,
        text: values.text,
      };
      if (values.locationJson) item.location = JSON.parse(values.locationJson);
      if (m.type === "add-item") day.items.push(item);
      else day.items[m.idx] = item;
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-budget") {
      const t = structuredClone(trip);
      t.budgetItems = t.budgetItems || [];
      t.budgetItems.push({ category: values.category, amount: Number(values.amount) || 0, memo: values.memo, createdBy: user.uid });
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-check") {
      const t = structuredClone(trip);
      // Backfill ids onto any pre-existing legacy items in the same write —
      // this write already requires checklist permission, so it's a free
      // opportunity to migrate the trip off the position-based fallback id.
      t.checklist = ensureChecklistIds(t.checklist);
      const checkItem = { id: makeChecklistId(), text: values.text };
      if (values.assignedTo) checkItem.assignedTo = values.assignedTo;
      t.checklist.push(checkItem);
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-booking" || m.type === "edit-booking") {
      const t = structuredClone(trip);
      t.bookings = t.bookings || [];
      const booking = { type: values.type, name: values.name, confirmNumber: values.confirmNumber, link: values.link, memo: values.memo };
      if (m.type === "add-booking") t.bookings.push(booking);
      else t.bookings[m.idx] = booking;
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "edit-review") {
      const t = structuredClone(trip);
      t.reviews = t.reviews || [];
      const idx = t.reviews.findIndex((r) => r.authorId === user.uid);
      if (idx >= 0) t.reviews[idx] = { ...t.reviews[idx], text: values.text, updatedAt: Date.now() };
      else t.reviews.push({ authorId: user.uid, text: values.text, photos: [], updatedAt: Date.now() });
      await saveTrip(t);
      closeModal();
      return;
    }
  }

  return (
    <div className="page">
      <header className="top">
        <span className="eyebrow">Travel Planner</span>
        <div className="top-row">
          <div>
            <h1>여행 플래너</h1>
            <div className="subline">여러 여행을 관리하고, 다녀온 여행엔 후기와 사진을 남겨보세요.</div>
          </div>
          <div className="btn-row" style={{ alignItems: "center" }}>
            {user && user.isAnonymous && (
              <span className="btn-row" style={{ alignItems: "center" }}>
                <span className="section-note">게스트로 이용 중</span>
                <button className="btn btn-sm btn-primary" onClick={() => setShowUpgrade(true)}>계정 만들기</button>
              </span>
            )}
            {user && !user.isAnonymous && (
              <span className="btn-row" style={{ alignItems: "center" }}>
                <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{nickname || "닉네임 없음"}</span>
                <button className="btn" onClick={() => setModal({ type: "edit-nickname", currentNickname: nickname })}>닉네임 수정</button>
                <button className="btn" onClick={signOutUser}>로그아웃</button>
              </span>
            )}
          </div>
        </div>
      </header>

      {authError ? (
        <div className="empty">{authError}</div>
      ) : !authResolved ? (
        <div className="empty">불러오는 중이에요…</div>
      ) : !user ? (
        <AuthGate onAuthed={setUser} />
      ) : user.isAnonymous && showUpgrade ? (
        <AuthGate initialMode="signup" onCancel={() => setShowUpgrade(false)} onAuthed={(u) => { setUser(u); setShowUpgrade(false); }} />
      ) : !tripsReady ? (
        <div className="empty">저장 기능을 불러오는 중이에요…</div>
      ) : screen === "home" ? (
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
        <div className="empty">여행을 찾을 수 없어요.</div>
      )}

      {user && <footer className="app-footer">여행 플래너 · {trips.length}개 여행 관리 중</footer>}

      <ModalHost modal={modal} trip={trip} onClose={closeModal} onSubmit={handleModalSubmit} />
    </div>
  );
}
