export default function Bookings({ trip, openModal, requestDelete }) {
  const items = trip.bookings || [];
  return (
    <section>
      <div className="section-head">
        <h2>예약 정보</h2>
        <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-booking" })}>+ 예약 추가</button>
      </div>
      {items.length === 0 ? (
        <div className="empty">등록된 예약 정보가 없어요. 항공권/숙소 예약번호를 저장해보세요.</div>
      ) : (
        <div className="food-results">
          {items.map((b, idx) => (
            <div className="food-card" key={idx}>
              <div className="food-card-top">
                <span className="food-card-name">{b.name || "(이름 없음)"}</span>
                <span className="food-card-tag">{b.type || "기타"}</span>
              </div>
              {b.confirmNumber && <div className="food-card-why">예약번호: <b style={{ color: "var(--ink)" }} className="nums">{b.confirmNumber}</b></div>}
              {b.memo && <div className="food-card-why">{b.memo}</div>}
              {b.link && <div style={{ marginTop: 6 }}><a href={b.link} target="_blank" rel="noopener noreferrer">🔗 예약 확인 / 체크인 링크</a></div>}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => openModal({ type: "edit-booking", idx })}>수정</button>
                <button className="btn btn-sm btn-danger" onClick={() => requestDelete("delete-booking", "이 예약 정보를 삭제할까요?", { idx })}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
