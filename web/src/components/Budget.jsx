import { fmtMoney } from "../lib/utils";
import { computeSettlement } from "../lib/settlement";
import { useNicknames } from "../lib/useNicknames";
import { DEFAULT_NICKNAME } from "../lib/users";

export default function Budget({ trip, openModal, requestDelete, canEdit }) {
  const items = trip.budgetItems || [];
  const memberIds = trip.memberIds || [];
  const settlement = computeSettlement(items, memberIds);
  // Payers/sharers can include people who've since left the trip.
  const nicknames = useNicknames([...memberIds, ...items.map((it) => it.paidBy), ...Object.keys(settlement.balance)]);
  const name = (uid) => {
    if (memberIds.includes(uid)) return nicknames[uid] || DEFAULT_NICKNAME;
    return nicknames[uid] ? `${nicknames[uid]} (나감)` : "나간 동행자";
  };
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

      {memberIds.length > 1 && (
        <section>
          <div className="section-head"><h2>💸 정산</h2></div>
          {settlement.transfers.length === 0 ? (
            <div className="empty">
              {items.some((it) => it.paidBy) ? "주고받을 돈이 없어요. 정산 완료!" : "지출 항목에 \"결제한 사람\"을 지정하면 누가 누구에게 얼마를 보내면 되는지 계산해드려요."}
            </div>
          ) : (
            <div className="card">
              {settlement.transfers.map((tr, i) => (
                <div className="cat-row" key={i}>
                  <span className="cat-name">{name(tr.from)} → {name(tr.to)}</span>
                  <span className="cat-amt nums">{fmtMoney(tr.amount)}원</span>
                </div>
              ))}
            </div>
          )}
          {settlement.unassigned > 0 && (
            <div className="section-note" style={{ marginTop: 8 }}>
              결제한 사람이 지정되지 않은 지출 {settlement.unassigned}건은 정산에서 빠졌어요.{canEdit ? " 항목의 \"수정\"에서 지정할 수 있어요." : ""}
            </div>
          )}
        </section>
      )}

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
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-budget" })}>+ 항목 추가</button>}
        </div>
        {items.length === 0 ? (
          <div className="empty">아직 등록된 지출이 없어요.</div>
        ) : (
          <div className="card">
            {items.map((it, idx) => (
              <div className="item-row" key={idx}>
                <span>
                  {it.category || "기타"}{it.memo ? " · " + it.memo : ""}
                  {memberIds.length > 1 && (
                    <span className="section-note" style={{ display: "block", marginTop: 2 }}>
                      {it.paidBy ? `${name(it.paidBy)} 결제` : "결제자 미지정"}
                      {it.paidBy && it.splitAmong?.length && it.splitAmong.length !== memberIds.length ? ` · ${it.splitAmong.length}명이 나눔` : ""}
                    </span>
                  )}
                </span>
                <span className="btn-row" style={{ alignItems: "center" }}>
                  <span className="nums" style={{ color: "var(--ink)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtMoney(it.amount)}원</span>
                  {canEdit && (
                    <>
                      <button className="btn-ghost btn-sm" onClick={() => openModal({ type: "edit-budget", idx })}>수정</button>
                      <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-budget", "이 지출 항목을 삭제할까요?", { idx })}>삭제</button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
