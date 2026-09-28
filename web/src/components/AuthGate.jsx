import { useEffect, useRef, useState } from "react";
import {
  signIn, signUp, signInWithGoogle, signInWithKakao, setRememberMe, sendPasswordReset, authErrorMessage,
} from "../lib/firebase";

const REMEMBER_KEY = "tp-remember-me";

function readRemember() {
  try { return localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { return true; }
}

function GoogleLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function KakaoLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#191919" d="M12 3.8c-5 0-9 3.15-9 7.05 0 2.5 1.66 4.7 4.17 5.95l-.86 3.2c-.08.3.26.54.52.37l3.83-2.53c.44.05.88.08 1.34.08 5 0 9-3.15 9-7.07S17 3.8 12 3.8z" />
    </svg>
  );
}

export default function AuthGate({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [remember, setRemember] = useState(readRemember);
  const formRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set on every mount, not just initially — StrictMode's dev-only
    // unmount/remount would otherwise leave it false and the form stuck busy.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function switchMode(next) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function toggleRemember(checked) {
    setRemember(checked);
    try { localStorage.setItem(REMEMBER_KEY, checked ? "1" : "0"); } catch { /* per-device nicety only */ }
  }

  async function run(signInFn) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await setRememberMe(remember);
      const cred = await signInFn();
      onAuthed?.(cred.user);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!e.target.checkValidity()) {
      setError("모든 필수 항목을 입력해주세요.");
      return;
    }
    const fd = new FormData(e.target);
    const email = fd.get("email");
    const password = fd.get("password");
    if (mode === "signup" && password !== fd.get("passwordConfirm")) {
      setError("비밀번호가 서로 달라요.");
      return;
    }
    run(() => (mode === "signup" ? signUp(email, password) : signIn(email, password)));
  }

  async function handleForgot() {
    const input = formRef.current?.elements.email;
    const email = input?.value.trim();
    setNotice(null);
    if (!email || !input.checkValidity()) {
      setError("비밀번호를 재설정할 이메일을 위 칸에 먼저 입력해주세요.");
      input?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setNotice(`${email}(으)로 가입된 계정이 있으면 비밀번호 재설정 메일을 보냈어요. 메일함과 스팸함을 확인해주세요.`);
    } catch (err) {
      // Same answer whether or not the address has an account, so the form
      // can't be used to check who's signed up.
      if (err?.code === "auth/user-not-found") setNotice(`${email}(으)로 가입된 계정이 있으면 비밀번호 재설정 메일을 보냈어요. 메일함과 스팸함을 확인해주세요.`);
      else setError(authErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <section className="auth">
      <div className="card auth-card">
        <h2 className="auth-title">{isSignup ? "회원가입" : "로그인"}</h2>
        <p className="auth-sub">{isSignup ? "이메일로 가입하고 첫 여행을 계획해보세요." : "다시 만나서 반가워요. 여행 계획을 이어가볼까요?"}</p>

        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          <input className="auth-input" name="email" type="email" placeholder="이메일" aria-label="이메일" required autoComplete="email" />
          <input
            className="auth-input"
            name="password"
            type="password"
            placeholder={isSignup ? "비밀번호 (6자 이상)" : "비밀번호"}
            aria-label="비밀번호"
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
          {isSignup && (
            <input className="auth-input" name="passwordConfirm" type="password" placeholder="비밀번호 확인" aria-label="비밀번호 확인" required minLength={6} autoComplete="new-password" />
          )}

          {error && <div className="note auth-msg"><span className="dot" /><span>{error}</span></div>}
          {notice && <div className="auth-msg auth-notice">{notice}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? "처리 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>

        <div className="auth-row">
          <label className="auth-check">
            <input type="checkbox" checked={remember} onChange={(e) => toggleRemember(e.target.checked)} />
            로그인 상태 유지
          </label>
          {!isSignup && (
            <button type="button" className="auth-link" onClick={handleForgot} disabled={loading}>
              비밀번호를 잊어버렸어요!
            </button>
          )}
        </div>

        <div className="auth-divider"><span>또는</span></div>

        <div className="auth-social">
          <button type="button" className="auth-social-btn google" disabled={loading} onClick={() => run(signInWithGoogle)} aria-label="Google로 계속하기" title="Google로 계속하기">
            <GoogleLogo />
          </button>
          <button type="button" className="auth-social-btn kakao" disabled={loading} onClick={() => run(signInWithKakao)} aria-label="카카오로 계속하기" title="카카오로 계속하기">
            <KakaoLogo />
          </button>
        </div>

        <button type="button" className="btn auth-switch" onClick={() => switchMode(isSignup ? "login" : "signup")}>
          {isSignup ? "이미 계정이 있어요 · 로그인" : "처음이신가요? 회원가입"}
        </button>

      </div>
    </section>
  );
}
