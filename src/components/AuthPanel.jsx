import { useState } from "react";
import { resetPasswordForEmail, signInWithEmail, signInWithProvider, signOut, signUpWithEmail, supabase } from "../services/supabase";

const AUTH_COPY = {
  ko: {
    titleSignup: "계정 생성",
    titleLogin: "로그인",
    providerGoogle: "Google로 계속",
    providerKakao: "카카오로 계속",
    orDivider: "또는",
    emailLabel: "이메일",
    passwordLabel: "비밀번호",
    emailPlaceholder: "이메일",
    passwordPlaceholder: "비밀번호",
    forgotPasswordLead: "비밀번호를 잊으셨나요?",
    resetPasswordAction: "비밀번호 재설정",
    createAccount: "계정 생성",
    login: "로그인",
    toggleToLogin: "이미 계정이 있으신가요? 로그인",
    toggleToSignup: "계정이 없으신가요? 계정 생성",
    noticeLead: "계속하면",
    noticeConnector: "및",
    noticeTail: "에 동의하게 됩니다.",
    terms: "이용약관",
    privacy: "개인정보처리방침",
    missingFields: "이메일과 비밀번호를 입력해주세요.",
    movingToAuth: "인증 화면으로 이동하고 있습니다.",
    signupDone: "계정 생성이 완료되었습니다. 이메일 인증이 필요할 수 있습니다.",
    loginDone: "로그인되었습니다.",
    resetPasswordSent: "비밀번호 재설정 링크를 이메일로 보냈습니다.",
    resetPasswordMissingEmail: "재설정 링크를 받을 이메일을 입력해주세요.",
    accountLinked: "계정 연결 완료",
    logout: "로그아웃",
    missingSupabase: "Supabase 환경 변수가 설정되지 않았습니다. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 확인해주세요.",
  },
  en: {
    titleSignup: "Create Account",
    titleLogin: "Log In",
    providerGoogle: "Continue with Google",
    providerKakao: "Continue with Kakao",
    orDivider: "or",
    emailLabel: "Email",
    passwordLabel: "Password",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    forgotPasswordLead: "Forgot your password?",
    resetPasswordAction: "Reset password",
    createAccount: "Create Account",
    login: "Log In",
    toggleToLogin: "Already have an account? Log in",
    toggleToSignup: "Don't have an account? Create one",
    noticeLead: "By continuing, you agree to the",
    noticeConnector: "and",
    noticeTail: ".",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    missingFields: "Please enter your email and password.",
    movingToAuth: "Redirecting you to the authentication page.",
    signupDone: "Your account has been created. Email verification may be required.",
    loginDone: "You are now logged in.",
    resetPasswordSent: "We sent a password reset link to your email.",
    resetPasswordMissingEmail: "Please enter your email to receive a reset link.",
    accountLinked: "Account linked",
    logout: "Log Out",
    missingSupabase: "Supabase environment variables are missing. Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.",
  },
  zh: {
    titleSignup: "创建账号",
    titleLogin: "登录",
    providerGoogle: "使用 Google 继续",
    providerKakao: "使用 Kakao 继续",
    orDivider: "或",
    emailLabel: "邮箱",
    passwordLabel: "密码",
    emailPlaceholder: "邮箱",
    passwordPlaceholder: "密码",
    forgotPasswordLead: "忘记密码？",
    resetPasswordAction: "重置密码",
    createAccount: "创建账号",
    login: "登录",
    toggleToLogin: "已经有账号了吗？登录",
    toggleToSignup: "还没有账号？创建账号",
    noticeLead: "继续即表示你同意",
    noticeConnector: "以及",
    noticeTail: "。",
    terms: "服务条款",
    privacy: "隐私政策",
    missingFields: "请输入邮箱和密码。",
    movingToAuth: "正在跳转到认证页面。",
    signupDone: "账号已创建完成，可能需要进行邮箱验证。",
    loginDone: "已登录。",
    resetPasswordSent: "重置密码链接已发送到您的邮箱。",
    resetPasswordMissingEmail: "请输入邮箱以接收重置链接。",
    accountLinked: "账号已连接",
    logout: "退出登录",
    missingSupabase: "未设置 Supabase 环境变量。请检查 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。",
  },
  ja: {
    titleSignup: "アカウント作成",
    titleLogin: "ログイン",
    providerGoogle: "Googleで続ける",
    providerKakao: "Kakaoで続ける",
    orDivider: "または",
    emailLabel: "メールアドレス",
    passwordLabel: "パスワード",
    emailPlaceholder: "メールアドレス",
    passwordPlaceholder: "パスワード",
    forgotPasswordLead: "パスワードをお忘れですか？",
    resetPasswordAction: "パスワードを再設定",
    createAccount: "アカウント作成",
    login: "ログイン",
    toggleToLogin: "すでにアカウントをお持ちですか？ ログイン",
    toggleToSignup: "アカウントをお持ちでないですか？ アカウント作成",
    noticeLead: "続行すると、",
    noticeConnector: "および",
    noticeTail: "に同意したものとみなされます。",
    terms: "利用規約",
    privacy: "プライバシーポリシー",
    missingFields: "メールアドレスとパスワードを入力してください。",
    movingToAuth: "認証画面に移動しています。",
    signupDone: "アカウント作成が完了しました。メール認証が必要な場合があります。",
    loginDone: "ログインしました。",
    resetPasswordSent: "パスワード再設定リンクをメールで送信しました。",
    resetPasswordMissingEmail: "再設定リンクを受け取るメールアドレスを入力してください。",
    accountLinked: "アカウント連携完了",
    logout: "ログアウト",
    missingSupabase: "Supabase 環境変数が設定されていません。`VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を確認してください。",
  },
  hi: {
    titleSignup: "खाता बनाएँ",
    titleLogin: "लॉग इन",
    providerGoogle: "Google के साथ जारी रखें",
    providerKakao: "Kakao के साथ जारी रखें",
    orDivider: "या",
    emailLabel: "ईमेल",
    passwordLabel: "पासवर्ड",
    emailPlaceholder: "ईमेल",
    passwordPlaceholder: "पासवर्ड",
    forgotPasswordLead: "पासवर्ड भूल गए?",
    resetPasswordAction: "पासवर्ड रीसेट करें",
    createAccount: "खाता बनाएँ",
    login: "लॉग इन",
    toggleToLogin: "क्या आपका खाता पहले से है? लॉग इन करें",
    toggleToSignup: "क्या आपका खाता नहीं है? खाता बनाएँ",
    noticeLead: "जारी रखने पर आप",
    noticeConnector: "और",
    noticeTail: "से सहमत माने जाएँगे।",
    terms: "उपयोग की शर्तें",
    privacy: "गोपनीयता नीति",
    missingFields: "कृपया ईमेल और पासवर्ड दर्ज करें।",
    movingToAuth: "प्रमाणीकरण पेज पर ले जाया जा रहा है।",
    signupDone: "खाता बन गया है। ईमेल सत्यापन की आवश्यकता हो सकती है।",
    loginDone: "आप लॉग इन हो गए हैं।",
    resetPasswordSent: "पासवर्ड रीसेट लिंक आपके ईमेल पर भेज दिया गया है।",
    resetPasswordMissingEmail: "रीसेट लिंक प्राप्त करने के लिए कृपया अपना ईमेल दर्ज करें।",
    accountLinked: "खाता जुड़ गया",
    logout: "लॉग आउट",
    missingSupabase: "Supabase environment variables सेट नहीं हैं। `VITE_SUPABASE_URL` और `VITE_SUPABASE_ANON_KEY` जाँचें।",
  },
};

function getAuthCopy(outputLanguage) {
  return AUTH_COPY[outputLanguage] ?? AUTH_COPY.ko;
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

function AuthPanel({ user, onAuth, theme = "light", outputLanguage = "ko" }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
  const primaryButtonClass = isLight
    ? "bg-slate-900 text-white hover:bg-slate-800"
    : "bg-white text-slate-900 hover:bg-slate-200";
  const dividerClass = isLight ? "bg-slate-200" : "bg-white/10";
  const subtleButtonClass = isLight ? "text-slate-700 hover:text-slate-900" : "text-slate-300 hover:text-slate-100";
  const legalLinkClass = isLight ? "text-slate-900" : "text-slate-100";
  const noticeClass = isLight ? "text-slate-700" : "text-slate-300";
  const copy = getAuthCopy(outputLanguage);

  const title = isSignup ? copy.titleSignup : copy.titleLogin;

  const resetMessages = () => {
    setError("");
    setMessage("");
  };

  const handleProvider = async (provider) => {
    resetMessages();
    setLoading(true);
    try {
      await signInWithProvider(provider);
      setMessage(copy.movingToAuth);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError(copy.missingFields);
      return;
    }

    resetMessages();
    setLoading(true);
    try {
      if (isSignup) {
        await signUpWithEmail(email, password);
        setMessage(copy.signupDone);
      } else {
        await signInWithEmail(email, password);
        setMessage(copy.loginDone);
      }
      onAuth?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!email) {
      setError(copy.resetPasswordMissingEmail);
      return;
    }

    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      setMessage(copy.resetPasswordSent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = () => {
    setIsSignup((prev) => !prev);
    resetMessages();
  };

  const providerItems = [
    {
      key: "google",
      label: copy.providerGoogle,
      shortLabel: "Google",
      icon: <GoogleIcon />,
      onClick: () => handleProvider("google"),
    },
    {
      key: "kakao",
      label: copy.providerKakao,
      shortLabel: "Kakao",
      icon: <KakaoIcon />,
      onClick: () => handleProvider("kakao"),
    },
  ];

  if (!supabase) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-red-400/20 bg-red-900/20 p-4 text-sm text-red-100">
        {copy.missingSupabase}
      </div>
    );
  }

  if (user) {
    return (
      <div className={`w-full max-w-md text-center ${shellClass}`}>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{copy.accountLinked}</h1>
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
          className={`mt-8 inline-flex h-12 items-center justify-center rounded-xl border px-5 text-sm font-medium transition ${buttonClass}`}
        >
          {copy.logout}
        </button>
        {error && (
          <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-900/20 px-4 py-3 text-sm text-red-200">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full max-w-md ${shellClass}`}>
      <div className="flex items-center gap-2.5">
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="h-8 w-8 rounded-[8px] object-cover"
        />
        <span className="text-base font-semibold">Zeusian.ai</span>
      </div>

      <div className="mt-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <button type="button" onClick={handleModeChange} className={`mt-1 text-sm font-medium transition ${subtleButtonClass}`}>
          {isSignup ? copy.toggleToLogin : copy.toggleToSignup}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {providerItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            disabled={loading}
            aria-label={item.label}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition ${buttonClass}`}
          >
            {item.icon}
            <span>{item.shortLabel}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className={`h-px flex-1 ${dividerClass}`} />
        <span className={`text-xs font-medium uppercase tracking-wider ${bodyClass}`}>{copy.orDivider}</span>
        <span className={`h-px flex-1 ${dividerClass}`} />
      </div>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleEmailSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="auth-email" className="text-sm font-medium">
            {copy.emailLabel}
          </label>
          <input
            id="auth-email"
            name="auth-email"
            type="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`h-12 rounded-xl border px-4 text-sm outline-none ring-1 ring-transparent transition ${inputClass}`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="auth-password" className="text-sm font-medium">
            {copy.passwordLabel}
          </label>
          <input
            id="auth-password"
            name="auth-password"
            type="password"
            placeholder={copy.passwordPlaceholder}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`h-12 rounded-xl border px-4 text-sm outline-none ring-1 ring-transparent transition ${inputClass}`}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className={`mt-1 flex h-12 items-center justify-center rounded-xl text-sm font-semibold transition ${primaryButtonClass}`}
        >
          {isSignup ? copy.createAccount : copy.login}
        </button>
      </form>

      <p className={`mt-4 text-center text-sm ${bodyClass}`}>
        {copy.forgotPasswordLead}{" "}
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={loading}
          className={`font-medium underline underline-offset-4 transition ${legalLinkClass}`}
        >
          {copy.resetPasswordAction}
        </button>
      </p>

      <p className={`mt-5 text-center text-xs leading-6 ${noticeClass}`}>
        {copy.noticeLead}{" "}
        <a href="/terms" className={`font-medium underline underline-offset-4 ${legalLinkClass}`}>
          {copy.terms}
        </a>{" "}
        {copy.noticeConnector}{" "}
        <a href="/privacy" className={`font-medium underline underline-offset-4 ${legalLinkClass}`}>
          {copy.privacy}
        </a>
        {copy.noticeTail}
      </p>

      {error && (
        <p className="mt-6 rounded-2xl border border-red-400/20 bg-red-900/20 px-4 py-3 text-sm text-red-200">{error}</p>
      )}
      {message && <p className={`mt-4 text-center text-sm ${noticeClass}`}>{message}</p>}
    </div>
  );
}

export default AuthPanel;
