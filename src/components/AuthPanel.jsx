import { useState } from "react";
import { signInWithEmail, signInWithProvider, signOut, signUpWithEmail, supabase } from "../services/supabase";

function AuthIcon({ children }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-current/10 bg-black/5">
      {children}
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M20 12.18c0 4.7-3.16 8.02-7.84 8.02A8.2 8.2 0 1 1 12 3.8c2.2 0 4.04.8 5.45 2.12" />
      <path d="M21 12h-9" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 4.5c4.7 0 8.5 3.01 8.5 6.72 0 3.72-3.8 6.73-8.5 6.73-.82 0-1.62-.09-2.38-.28L5.5 20l1.12-3.18c-1.92-1.2-3.12-3.19-3.12-5.6C3.5 7.51 7.3 4.5 12 4.5Z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m5 8 7 5 7-5" />
    </svg>
  );
}

function AuthPanel({ user, onAuth, theme = "dark" }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignup, setIsSignup] = useState(true);

  const isLight = theme === "light";
  const shellClass = isLight ? "text-slate-900" : "text-slate-100";
  const bodyClass = isLight ? "text-slate-600" : "text-slate-400";
  const buttonClass = isLight
    ? "border-slate-300 bg-white/70 text-slate-900 hover:border-slate-400 hover:bg-white"
    : "border-white/12 bg-white/[0.03] text-slate-100 hover:border-white/24 hover:bg-white/[0.06]";
  const inputClass = isLight
    ? "border-slate-300 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-300/60"
    : "border-white/12 bg-white/[0.03] text-slate-100 placeholder:text-slate-500 focus:border-white/30 focus:ring-white/15";
  const subtleButtonClass = isLight ? "text-slate-700 hover:text-slate-900" : "text-slate-300 hover:text-slate-100";
  const legalLinkClass = isLight ? "text-slate-900" : "text-slate-100";
  const noticeClass = isLight ? "text-slate-700" : "text-slate-300";

  const title = showEmailForm ? (isSignup ? "이메일로 계정 생성" : "이메일로 로그인") : isSignup ? "계정 생성" : "로그인";
  const description = showEmailForm
    ? isSignup
      ? "이메일과 비밀번호를 입력해 Zeusian 계정을 만드세요."
      : "이메일과 비밀번호를 입력해 다시 로그인하세요."
    : isSignup
      ? "Google, 카카오 또는 이메일로 바로 계정을 만들 수 있습니다."
      : "이미 계정이 있다면 원하는 방식으로 바로 로그인하세요.";

  const resetMessages = () => {
    setError("");
    setMessage("");
  };

  const openEmailForm = () => {
    setShowEmailForm(true);
    resetMessages();
  };

  const closeEmailForm = () => {
    setShowEmailForm(false);
    setEmail("");
    setPassword("");
    resetMessages();
  };

  const handleProvider = async (provider) => {
    resetMessages();
    setLoading(true);
    try {
      await signInWithProvider(provider);
      setMessage("인증 화면으로 이동하고 있습니다.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    resetMessages();
    setLoading(true);
    try {
      if (isSignup) {
        await signUpWithEmail(email, password);
        setMessage("계정 생성이 완료되었습니다. 이메일 인증이 필요할 수 있습니다.");
      } else {
        await signInWithEmail(email, password);
        setMessage("로그인되었습니다.");
      }
      onAuth?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = () => {
    setIsSignup((prev) => !prev);
    closeEmailForm();
  };

  const providerItems = [
    {
      key: "google",
      label: "Google로 계속",
      icon: <GoogleIcon />,
      onClick: () => handleProvider("google"),
    },
    {
      key: "kakao",
      label: "카카오로 계속",
      icon: <KakaoIcon />,
      onClick: () => handleProvider("kakao"),
    },
    {
      key: "email",
      label: "이메일로 계속",
      icon: <EmailIcon />,
      onClick: openEmailForm,
    },
  ];

  if (!supabase) {
    return (
      <div className="w-full max-w-xl rounded-2xl border border-red-400/20 bg-red-900/20 p-4 text-sm text-red-100">
        Supabase 환경 변수가 설정되지 않았습니다. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 확인해주세요.
      </div>
    );
  }

  if (user) {
    return (
      <div className={`w-full max-w-xl ${shellClass}`}>
        <h1 className="text-4xl font-black tracking-tight">계정 연결 완료</h1>
        <p className={`mt-3 text-sm leading-7 ${bodyClass}`}>{user.email}</p>
        <button
          type="button"
          onClick={async () => {
            resetMessages();
            setLoading(true);
            try {
              await signOut();
              onAuth?.();
            } catch (err) {
              setError(err.message);
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className={`mt-8 inline-flex h-12 items-center rounded-2xl border px-5 text-sm font-medium transition ${buttonClass}`}
        >
          로그아웃
        </button>
        {error && (
          <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-900/20 px-4 py-3 text-sm text-red-200">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full max-w-xl ${shellClass}`}>
      <div className="max-w-lg">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className={`mt-4 text-sm leading-7 sm:text-base ${bodyClass}`}>{description}</p>
      </div>

      {!showEmailForm ? (
        <div className="mt-10 flex w-full max-w-lg flex-col gap-3">
          {providerItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              disabled={loading}
              className={`flex h-14 w-full items-center justify-between rounded-2xl border px-4 text-sm font-medium transition ${buttonClass}`}
            >
              <span className="flex items-center gap-3">
                <AuthIcon>{item.icon}</AuthIcon>
                <span>{item.label}</span>
              </span>
              <span className={`text-xs ${bodyClass}`}>계속</span>
            </button>
          ))}
        </div>
      ) : (
        <form className="mt-10 flex w-full max-w-lg flex-col gap-3" onSubmit={handleEmailSubmit}>
          <input
            name="auth-email"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`h-14 rounded-2xl border px-4 text-sm outline-none ring-1 ring-transparent transition ${inputClass}`}
          />
          <input
            name="auth-password"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`h-14 rounded-2xl border px-4 text-sm outline-none ring-1 ring-transparent transition ${inputClass}`}
          />
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeEmailForm}
              className={`flex h-12 flex-1 items-center justify-center rounded-2xl border text-sm font-medium transition ${buttonClass}`}
            >
              돌아가기
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex h-12 flex-1 items-center justify-center rounded-2xl border text-sm font-medium transition ${buttonClass}`}
            >
              {isSignup ? "계정 생성" : "로그인"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 max-w-lg">
        <button type="button" onClick={handleModeChange} className={`text-sm font-medium transition ${subtleButtonClass}`}>
          {isSignup ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 계정 생성"}
        </button>
        <p className={`mt-5 text-xs leading-6 ${noticeClass}`}>
          계속하면{" "}
          <a href="/terms" className={`font-medium underline underline-offset-4 ${legalLinkClass}`}>
            이용약관
          </a>{" "}
          및{" "}
          <a href="/privacy" className={`font-medium underline underline-offset-4 ${legalLinkClass}`}>
            개인정보처리방침
          </a>
          에 동의하게 됩니다.
        </p>
      </div>

      {error && (
        <p className="mt-6 max-w-lg rounded-2xl border border-red-400/20 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {message && <p className={`mt-4 max-w-lg text-sm ${noticeClass}`}>{message}</p>}
    </div>
  );
}

export default AuthPanel;
