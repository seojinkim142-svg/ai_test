import { useState } from "react";
import { signInWithEmail, signOut, signUpWithEmail, supabase } from "../services/supabase";

function AuthPanel({ user, onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-red-400/20 bg-red-900/30 p-4 text-sm text-red-100">
        Supabase 환경변수가 설정되지 않았습니다. <code>VITE_SUPABASE_URL</code>과 <code>VITE_SUPABASE_ANON_KEY</code>를
        .env에 추가해주세요.
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력하세요.");
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        setMessage("로그인 성공");
      } else {
        await signUpWithEmail(email, password);
        setMessage("가입 완료. 메일 인증이 필요할 수 있습니다.");
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

  if (user) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
        <div>
          <p className="text-xs text-slate-400">로그인됨</p>
          <p className="text-sm font-semibold text-white">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={loading}
          className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-slate-100 transition hover:bg-white/20 disabled:opacity-60"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/30"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Supabase Auth</p>
          <h2 className="text-lg font-semibold text-white">로그인</h2>
        </div>
        <div className="flex gap-1 rounded-full bg-white/5 p-1">
          {[
            { id: "signin", label: "로그인" },
            { id: "signup", label: "회원가입" },
          ].map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active ? "bg-emerald-500 text-emerald-950" : "text-slate-200 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm text-slate-200" htmlFor="auth-email">
        이메일
        <input
          id="auth-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
          placeholder="you@example.com"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-200" htmlFor="auth-password">
        비밀번호
        <input
          id="auth-password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
          placeholder="8자 이상"
          required
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {loading ? "처리 중..." : mode === "signin" ? "로그인" : "회원가입"}
      </button>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">{error}</p>}
      {message && <p className="text-sm text-emerald-200">{message}</p>}
    </form>
  );
}

export default AuthPanel;
