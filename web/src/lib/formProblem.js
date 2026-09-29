// Turns a form's native constraint failures (required, type=email,
// minLength, min/max, step) into one specific Korean message, instead of a
// catch-all "모든 필수 항목을 입력해주세요" that never said *what* was wrong.

function hasBatchim(word) {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return false;
  return (c - 0xac00) % 28 !== 0;
}
const eul = (w) => w + (hasBatchim(w) ? "을" : "를");
const eun = (w) => w + (hasBatchim(w) ? "은" : "는");

/** The field's visible name: its .field label, else aria-label/placeholder,
 * without parenthesised hints ("금액 (원)" → "금액"). */
function labelOf(el) {
  const text = el.closest(".field")?.querySelector("label")?.textContent
    || el.getAttribute("aria-label") || el.placeholder || "입력값";
  return text.replace(/\s*\(.*?\)\s*/g, " ").trim() || "입력값";
}

/** The first invalid field in `form` and what's wrong with it, or null if
 * the form is valid. */
export function formProblem(form) {
  const el = [...form.elements].find((x) => x.willValidate && !x.checkValidity());
  if (!el) return null;
  const v = el.validity;
  const name = labelOf(el);
  let message;
  if (v.valueMissing) message = el.type === "date" || el.tagName === "SELECT" ? `${eul(name)} 선택해주세요.` : `${eul(name)} 입력해주세요.`;
  else if (v.typeMismatch && el.type === "email") message = "이메일 형식을 확인해주세요. (예: you@example.com)";
  else if (v.tooShort) message = `${eun(name)} ${el.minLength}자 이상이어야 해요.`;
  else if (v.tooLong) message = `${eun(name)} ${el.maxLength}자까지 입력할 수 있어요.`;
  else if (v.rangeUnderflow || v.rangeOverflow) {
    if (el.type === "date") {
      message = el.min && el.max ? `여행 기간(${el.min} ~ ${el.max}) 안의 날짜를 골라주세요.`
        : v.rangeUnderflow ? `${el.min} 이후 날짜를 골라주세요.` : `${el.max} 이전 날짜를 골라주세요.`;
    } else {
      message = v.rangeUnderflow ? `${eun(name)} ${Number(el.min).toLocaleString("ko-KR")} 이상이어야 해요.` : `${eun(name)} ${Number(el.max).toLocaleString("ko-KR")} 이하여야 해요.`;
    }
  } else if (v.stepMismatch) message = `${eun(name)} 소수점 없이 숫자로 입력해주세요.`;
  else if (v.badInput) message = `${eul(name)} 올바르게 입력해주세요.`;
  else message = `${eul(name)} 확인해주세요.`;
  return { message, el };
}

/** formProblem + move the cursor to that field. Returns the message or null. */
export function reportFormProblem(form) {
  const p = formProblem(form);
  if (!p) return null;
  try { p.el.focus({ preventScroll: false }); } catch { /* not focusable */ }
  return p.message;
}
