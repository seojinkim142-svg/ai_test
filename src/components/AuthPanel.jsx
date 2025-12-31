import { useState } from "react";
import { signInWithEmail, signUpWithEmail, signInWithProvider, signOut, supabase } from "../services/supabase";

function AuthPanel({ user, onAuth }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignup, setIsSignup] = useState(false);

  const handleProvider = async (provider) => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await signInWithProvider(provider);
      setMessage("소셜 로그인 리다이렉트 중입니다...");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력하세요.");
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (isSignup) {
        await signUpWithEmail(email, password);
        setMessage("회원가입 완료. 메일 인증이 필요할 수 있습니다.");
      } else {
        await signInWithEmail(email, password);
        setMessage("로그인 성공");
      }
      onAuth?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await signOut();
      onAuth?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-red-400/20 bg-red-900/30 p-4 text-sm text-red-100">
        Supabase 환경변수가 설정되지 않았습니다. <code>VITE_SUPABASE_URL</code>과 <code>VITE_SUPABASE_ANON_KEY</code>를
        .env에 추가해주세요.
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-card auth-card-logged flex items-center justify-between rounded-2xl border border-emerald-200/30 bg-slate-900/80 px-4 py-3 shadow-lg">
        <div>
          <p className="text-xs text-emerald-200/80">로그인됨</p>
          <p className="text-sm font-semibold text-slate-50">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={loading}
          className="ghost-button text-sm text-emerald-100"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="auth-card flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border border-emerald-300/40 bg-slate-950/90 px-8 pt-6 pb-8 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="text-center leading-tight">
        <h1 className="text-xl font-extrabold tracking-tight text-emerald-300">ZEUSIAN.AI</h1>
      </div>

      {!showEmailForm && (
        <div className="flex w-full flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => handleProvider("google")}
            disabled={loading}
            className="ghost-button h-12 w-full max-w-xs text-sm text-slate-100"
            data-ghost-size="xl"
            style={{ "--ghost-color": "226, 232, 240" }}
          >
            Google로 로그인
          </button>
          <button
            type="button"
            onClick={() => handleProvider("kakao")}
            disabled={loading}
            className="ghost-button h-12 w-full max-w-xs text-sm text-amber-100"
            data-ghost-size="xl"
            style={{ "--ghost-color": "251, 191, 36" }}
          >
            카카오로 로그인
          </button>
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            disabled={loading}
            className="ghost-button h-12 w-full max-w-xs text-sm text-emerald-100"
            data-ghost-size="xl"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            아이디 로그인
          </button>
        </div>
      )}

      {showEmailForm && (
        <form className="flex w-full flex-col items-center gap-2" onSubmit={handleEmailSubmit}>
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full max-w-xs rounded-2xl border border-emerald-200/50 bg-slate-800 px-4 text-sm text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full max-w-xs rounded-2xl border border-emerald-200/50 bg-slate-800 px-4 text-sm text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
          />
          <div className="flex w-full max-w-xs gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEmailForm(false);
                setIsSignup(false);
                setError("");
                setMessage("");
              }}
              className="ghost-button h-11 flex-1 text-sm text-slate-200"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="ghost-button h-11 flex-1 text-sm text-emerald-100"
              style={{ "--ghost-color": "52, 211, 153" }}
            >
              {isSignup ? "회원가입" : "로그인"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsSignup((prev) => !prev)}
            className="ghost-button text-xs text-emerald-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {isSignup ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
          </button>
        </form>
      )}

      <p className="mt-1 text-center text-xs text-slate-400">
        로그인 시{" "}
        <a className="font-semibold text-emerald-300 underline underline-offset-2">이용약관</a> 및{" "}
        <a className="font-semibold text-emerald-300 underline underline-offset-2">개인정보 처리방침</a>에 동의합니다
      </p>

      {error && (
        <p className="w-full rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/40">{error}</p>
      )}
      {message && <p className="text-sm text-emerald-200">{message}</p>}
    </div>
  );
}

export default AuthPanel;
