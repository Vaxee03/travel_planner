// 정산: who owes whom, from budget items that record who paid (paidBy) and
// who shares the cost (splitAmong, defaulting to every current member).
// Items without a paidBy (added before this feature, or left unset) are
// skipped and only counted, so the UI can point them out.

/** Splits `amount` won into `n` whole-won shares that add back up exactly —
 * the leftover won from rounding go one each to the first shares. */
function splitWon(amount, n) {
  const base = Math.floor(amount / n);
  const rest = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

export function computeSettlement(items, memberIds) {
  const balance = {}; // + means others owe them, − means they owe
  let unassigned = 0;

  (items || []).forEach((it) => {
    const amount = Math.round(Number(it.amount) || 0);
    if (!amount) return;
    if (!it.paidBy) { unassigned += 1; return; }
    const among = (it.splitAmong?.length ? it.splitAmong : memberIds).filter(Boolean);
    if (!among.length) return;
    balance[it.paidBy] = (balance[it.paidBy] || 0) + amount;
    splitWon(amount, among.length).forEach((share, i) => {
      balance[among[i]] = (balance[among[i]] || 0) - share;
    });
  });

  // Greedy largest-debtor → largest-creditor matching: at most (people − 1)
  // transfers, which is what a group actually wants to see.
  const creditors = Object.entries(balance).filter(([, v]) => v > 0).map(([uid, v]) => ({ uid, v }));
  const debtors = Object.entries(balance).filter(([, v]) => v < 0).map(([uid, v]) => ({ uid, v: -v }));
  creditors.sort((a, b) => b.v - a.v);
  debtors.sort((a, b) => b.v - a.v);

  const transfers = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].v, debtors[di].v);
    if (pay > 0) transfers.push({ from: debtors[di].uid, to: creditors[ci].uid, amount: pay });
    creditors[ci].v -= pay;
    debtors[di].v -= pay;
    if (creditors[ci].v === 0) ci += 1;
    if (debtors[di].v === 0) di += 1;
  }

  return { transfers, balance, unassigned };
}
