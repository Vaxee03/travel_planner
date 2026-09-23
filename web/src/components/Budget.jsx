import { fmtMoney } from "../lib/utils";
import { useNicknames } from "../lib/useNicknames";

export default function Budget({ trip, openModal, requestDelete }) {
  const items = trip.budgetItems || [];
  const showAuthor = (trip.memberIds || []).length > 1;
  const nicknames = useNicknames(items.map((it) => it.createdBy));
  const spent = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const total = Number(trip.budgetTotal) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  const travelers = Number(trip.travelers) || 1;

  const byCat = {};
  items.forEach((it) => {
    const c = it.category || "기타";
    byCat[c] = (byCat[c] || 0) + (Number(it.amount) || 0);
  });
  const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);

  return (
    <>
      <section>
        <div className="budget-hero">
          <div>
            <div className="budget-label">지출 합계</div>
            <div className="budget-amount nums">{fmtMoney(spent)}<span>원</span></div>
          </div>
          <div className="budget-per">총 예산<b className="nums">{fmtMoney(total)}원</b></div>
        </div>
        <div className="budget-bar"><div className="budget-bar-fill" style={{ width: pct + "%" }} /></div>
        {travelers > 1 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="cat-row" style={{ borderBottom: "none" }}>
              <span className="cat-name">1인당 ({travelers}명 기준)</span>
              <span className="cat-amt nums">지출 {fmtMoney(Math.round(spent / travelers))}원 · 예산 {fmtMoney(Math.round(total / travelers))}원</span>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="section-head"><h2>카테고리별 집계</h2></div>
        {cats.length === 0 ? (
          <div className="empty">등록된 지출 항목이 없어요.</div>
        ) : (
          <div className="card">
            {cats.map((c) => (
              <div className="cat-row" key={c}>
                <span className="cat-name">{c}</span>
                <span className="cat-amt nums">{fmtMoney(byCat[c])}원</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>지출 내역</h2>
          <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-budget" })}>+ 항목 추가</button>
        </div>
        {items.length === 0 ? (
          <div className="empty">아직 등록된 지출이 없어요.</div>
        ) : (
          <div className="card">
            {items.map((it, idx) => (
              <div className="item-row" key={idx}>
                <span>
                  {it.category || "기타"}{it.memo ? " · " + it.memo : ""}
                  {showAuthor && it.createdBy && (
                    <span className="section-note" style={{ marginLeft: 8 }}>{nicknames[it.createdBy] || "이름 없는 동행자"}</span>
                  )}
                </span>
                <span className="btn-row" style={{ alignItems: "center" }}>
                  <span className="nums" style={{ color: "var(--ink)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtMoney(it.amount)}원</span>
                  <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-budget", "이 지출 항목을 삭제할까요?", { idx })}>삭제</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
