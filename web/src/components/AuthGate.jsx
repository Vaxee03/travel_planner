import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { signIn, signUp, signInWithGoogle, signInWithKakao, authErrorMessage } from "../lib/firebase";

export default function AuthGate({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!e.target.checkValidity()) {
      setError("모든 필수 항목을 입력해주세요.");
      return;
    }
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

        <form onSubmit={handleSubmit} noValidate>
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
        </form>

        <p className="section-note" style={{ marginTop: 12, textAlign: "center" }}>
          가입하거나 소셜 계정으로 계속하면 <Link to="/terms">이용약관</Link> 및 <Link to="/privacy">개인정보처리방침</Link>에 동의하는 것으로 간주돼요.
        </p>

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
