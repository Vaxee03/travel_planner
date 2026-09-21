import { useEffect, useRef, useState } from "react";
import { signIn, signUp, signInWithGoogle, signInWithKakao, authErrorMessage } from "../lib/firebase";

export default function AuthGate({ initialMode = "login", onCancel, onAuthed }) {
  const [mode, setMode] = useState(initialMode); // "login" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get("email");
    const password = fd.get("password");
    const passwordConfirm = fd.get("passwordConfirm");

    if (mode === "signup" && password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cred = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      // linkWithCredential/linkWithPopup (used when upgrading an anonymous
      // session) don't reliably re-fire onAuthStateChanged since the uid
      // doesn't change, so push the resulting user up explicitly too.
      onAuthed?.(cred.user);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleSocial(fn) {
    setLoading(true);
    setError(null);
    try {
      const cred = await fn();
      onAuthed?.(cred.user);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <section style={{ maxWidth: 420, margin: "40px auto 0" }}>
      <div className="card">
        <div className="btn-row" style={{ marginBottom: 22, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
          <button
            type="button"
            className={"tab" + (mode === "login" ? " active" : "")}
            onClick={() => { setMode("login"); setError(null); }}
          >
            로그인
          </button>
          <button
            type="button"
            className={"tab" + (mode === "signup" ? " active" : "")}
            onClick={() => { setMode("signup"); setError(null); }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>이메일</label>
            <input name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input
              name="password"
              type="password"
              placeholder="6자 이상"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>비밀번호 확인</label>
              <input name="passwordConfirm" type="password" placeholder="비밀번호 다시 입력" required minLength={6} autoComplete="new-password" />
            </div>
          )}

          {error && (
            <div className="note"><span className="dot" /><span>{error}</span></div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={loading}>
            {loading ? "처리 중…" : mode === "signup" ? "회원가입" : "로그인"}
          </button>
          {onCancel && (
            <button type="button" className="back-link" style={{ marginTop: 14, marginBottom: 0, justifyContent: "center", width: "100%" }} onClick={onCancel}>
              나중에 하기
            </button>
          )}
        </form>

        <div className="btn-row" style={{ margin: "18px 0", color: "var(--ink-soft)", fontSize: 12.5 }}>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          또는
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={loading} onClick={() => handleSocial(signInWithGoogle)}>
            Google로 계속하기
          </button>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "center", background: "#FEE500", borderColor: "#FEE500", color: "#191919" }}
            disabled={loading}
            onClick={() => handleSocial(signInWithKakao)}
          >
            카카오로 계속하기
          </button>
        </div>
      </div>
    </section>
  );
}
