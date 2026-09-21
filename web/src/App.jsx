import { useEffect, useState } from "react";
import { firebaseReady, ensureSignedIn } from "./lib/firebase";
import { subscribeTrips, createTrip, saveTrip, deleteTrip, joinTrip } from "./lib/tripsApi";
import Home from "./components/Home";
import TripDetail from "./components/TripDetail";
import ModalHost from "./components/Modals";

function getTrip(trips, id) {
  return trips.find((t) => t.id === id) || null;
}

export default function App() {
  const [uid, setUid] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [trips, setTrips] = useState([]);
  const [tripsReady, setTripsReady] = useState(false);

  const [screen, setScreen] = useState("home");
  const [tripId, setTripId] = useState(null);
  const [tab, setTab] = useState("itinerary");
  const [dayIdx, setDayIdx] = useState(null);
  const [modal, setModal] = useState(null);

  // Sign in anonymously, then join a trip if ?join=<id> is in the URL.
  useEffect(() => {
    if (!firebaseReady) { setAuthError("Firebase 설정이 없어요. web/.env.local을 채워주세요."); return; }
    ensureSignedIn()
      .then(async (id) => {
        setUid(id);
        const params = new URLSearchParams(window.location.search);
        const joinId = params.get("join");
        if (joinId) {
          await joinTrip(joinId, id).catch(() => {});
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch((err) => setAuthError(err?.message || "로그인에 실패했어요."));
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeTrips(
      uid,
      (list) => { setTrips(list); setTripsReady(true); },
      (err) => setAuthError(err?.message || "데이터를 불러오지 못했어요.")
    );
    return unsub;
  }, [uid]);

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

  function toggleCheck(idx) {
    const t = structuredClone(trip);
    t.checklist[idx].done = !t.checklist[idx].done;
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
        t.checklist.splice(m.idx, 1);
        await saveTrip(t);
      } else if (m.onYes === "delete-booking") {
        const t = structuredClone(trip);
        t.bookings.splice(m.idx, 1);
        await saveTrip(t);
      }
      closeModal();
      return;
    }

    if (m.type === "add-trip") {
      const id = await createTrip(uid, {
        title: values.title, destination: values.destination,
        startDate: values.startDate, endDate: values.endDate,
        travelers: Number(values.travelers) || 1,
        budgetTotal: Number(values.budgetTotal) || 0,
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
      t.budgetItems.push({ category: values.category, amount: Number(values.amount) || 0, memo: values.memo });
      await saveTrip(t);
      closeModal();
      return;
    }
    if (m.type === "add-check") {
      const t = structuredClone(trip);
      t.checklist = t.checklist || [];
      t.checklist.push({ text: values.text, done: false });
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
      t.review = t.review || { photos: [] };
      t.review.text = values.text;
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
          {screen === "trip" && (
            <button className="back-link" style={{ marginBottom: 0 }} onClick={goHome}>← 여행 목록으로</button>
          )}
        </div>
      </header>

      {authError ? (
        <div className="empty">{authError}</div>
      ) : !tripsReady ? (
        <div className="empty">저장 기능을 불러오는 중이에요…</div>
      ) : screen === "home" ? (
        <Home trips={trips} onOpenTrip={openTrip} onAddTrip={() => openModal({ type: "add-trip" })} />
      ) : trip ? (
        <TripDetail
          trip={trip}
          tab={tab}
          setTab={setTab}
          dayIdx={dayIdx}
          setDayIdx={setDayIdx}
          openModal={openModal}
          requestDelete={requestDelete}
          toggleCheck={toggleCheck}
          onEditTrip={() => openModal({ type: "edit-trip" })}
          onDeleteTrip={() => requestDelete("delete-trip", "이 여행을 삭제할까요? 되돌릴 수 없어요.")}
        />
      ) : (
        <div className="empty">여행을 찾을 수 없어요.</div>
      )}

      <footer className="app-footer">여행 플래너 · {trips.length}개 여행 관리 중</footer>

      <ModalHost modal={modal} trip={trip} onClose={closeModal} onSubmit={handleModalSubmit} />
    </div>
  );
}
