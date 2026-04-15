import { useState } from "react";
import { signInWithEmail, signInWithProvider, signOut, signUpWithEmail, supabase } from "../services/supabase";

const AUTH_COPY = {
  ko: {
    titleSignup: "계정 생성",
    titleLogin: "로그인",
    titleSignupEmail: "이메일로 계정 생성",
    titleLoginEmail: "이메일로 로그인",
    descriptionSignup: "Google, 카카오 또는 이메일로 바로 계정을 만들 수 있습니다.",
    descriptionLogin: "이미 계정이 있다면 원하는 방식으로 바로 로그인하세요.",
    descriptionSignupEmail: "이메일과 비밀번호를 입력해 Zeusian 계정을 만드세요.",
    descriptionLoginEmail: "이메일과 비밀번호를 입력해 다시 로그인하세요.",
    providerGoogle: "Google로 계속",
    providerKakao: "카카오로 계속",
    providerEmail: "이메일로 계속",
    providerAction: "계속",
    emailPlaceholder: "이메일",
    passwordPlaceholder: "비밀번호",
    back: "돌아가기",
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
    accountLinked: "계정 연결 완료",
    logout: "로그아웃",
    missingSupabase: "Supabase 환경 변수가 설정되지 않았습니다. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 확인해주세요.",
  },
  en: {
    titleSignup: "Create Account",
    titleLogin: "Log In",
    titleSignupEmail: "Create Account with Email",
    titleLoginEmail: "Log In with Email",
    descriptionSignup: "Create your account right away with Google, Kakao, or email.",
    descriptionLogin: "If you already have an account, sign in with the method you prefer.",
    descriptionSignupEmail: "Enter your email and password to create your Zeusian account.",
    descriptionLoginEmail: "Enter your email and password to sign in again.",
    providerGoogle: "Continue with Google",
    providerKakao: "Continue with Kakao",
    providerEmail: "Continue with Email",
    providerAction: "Continue",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    back: "Back",
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
    accountLinked: "Account linked",
    logout: "Log Out",
    missingSupabase: "Supabase environment variables are missing. Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.",
  },
  zh: {
    titleSignup: "创建账号",
    titleLogin: "登录",
    titleSignupEmail: "使用邮箱创建账号",
    titleLoginEmail: "使用邮箱登录",
    descriptionSignup: "可立即通过 Google、Kakao 或邮箱创建账号。",
    descriptionLogin: "如果你已经有账号，可以直接用想要的方式登录。",
    descriptionSignupEmail: "输入邮箱和密码来创建你的 Zeusian 账号。",
    descriptionLoginEmail: "输入邮箱和密码重新登录。",
    providerGoogle: "使用 Google 继续",
    providerKakao: "使用 Kakao 继续",
    providerEmail: "使用邮箱继续",
    providerAction: "继续",
    emailPlaceholder: "邮箱",
    passwordPlaceholder: "密码",
    back: "返回",
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
    accountLinked: "账号已连接",
    logout: "退出登录",
    missingSupabase: "未设置 Supabase 环境变量。请检查 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。",
  },
  ja: {
    titleSignup: "アカウント作成",
    titleLogin: "ログイン",
    titleSignupEmail: "メールでアカウント作成",
    titleLoginEmail: "メールでログイン",
    descriptionSignup: "Google、Kakao、またはメールですぐにアカウントを作成できます。",
    descriptionLogin: "すでにアカウントがある場合は、希望する方法ですぐにログインできます。",
    descriptionSignupEmail: "メールアドレスとパスワードを入力して Zeusian アカウントを作成してください。",
    descriptionLoginEmail: "メールアドレスとパスワードを入力して再度ログインしてください。",
    providerGoogle: "Googleで続ける",
    providerKakao: "Kakaoで続ける",
    providerEmail: "メールで続ける",
    providerAction: "続ける",
    emailPlaceholder: "メールアドレス",
    passwordPlaceholder: "パスワード",
    back: "戻る",
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
    accountLinked: "アカウント連携完了",
    logout: "ログアウト",
    missingSupabase: "Supabase 環境変数が設定されていません。`VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を確認してください。",
  },
  hi: {
    titleSignup: "खाता बनाएँ",
    titleLogin: "लॉग इन",
    titleSignupEmail: "ईमेल से खाता बनाएँ",
    titleLoginEmail: "ईमेल से लॉग इन करें",
    descriptionSignup: "Google, Kakao या ईमेल से तुरंत खाता बनाया जा सकता है।",
    descriptionLogin: "यदि आपका खाता पहले से है, तो अपनी पसंद के तरीके से तुरंत लॉग इन करें।",
    descriptionSignupEmail: "अपना Zeusian खाता बनाने के लिए ईमेल और पासवर्ड दर्ज करें।",
    descriptionLoginEmail: "फिर से लॉग इन करने के लिए ईमेल और पासवर्ड दर्ज करें।",
    providerGoogle: "Google के साथ जारी रखें",
    providerKakao: "Kakao के साथ जारी रखें",
    providerEmail: "ईमेल के साथ जारी रखें",
    providerAction: "जारी रखें",
    emailPlaceholder: "ईमेल",
    passwordPlaceholder: "पासवर्ड",
    back: "वापस",
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
    accountLinked: "खाता जुड़ गया",
    logout: "लॉग आउट",
    missingSupabase: "Supabase environment variables सेट नहीं हैं। `VITE_SUPABASE_URL` और `VITE_SUPABASE_ANON_KEY` जाँचें।",
  },
};

function getAuthCopy(outputLanguage) {
  return AUTH_COPY[outputLanguage] ?? AUTH_COPY.ko;
}

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

function AuthPanel({ user, onAuth, theme = "light", outputLanguage = "ko" }) {
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
  const copy = getAuthCopy(outputLanguage);

  const title = showEmailForm
    ? isSignup
      ? copy.titleSignupEmail
      : copy.titleLoginEmail
    : isSignup
      ? copy.titleSignup
      : copy.titleLogin;
  const description = showEmailForm
    ? isSignup
      ? copy.descriptionSignupEmail
      : copy.descriptionLoginEmail
    : isSignup
      ? copy.descriptionSignup
      : copy.descriptionLogin;

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

  const handleModeChange = () => {
    setIsSignup((prev) => !prev);
    closeEmailForm();
  };

  const providerItems = [
    {
      key: "google",
      label: copy.providerGoogle,
      icon: <GoogleIcon />,
      onClick: () => handleProvider("google"),
    },
    {
      key: "kakao",
      label: copy.providerKakao,
      icon: <KakaoIcon />,
      onClick: () => handleProvider("kakao"),
    },
    {
      key: "email",
      label: copy.providerEmail,
      icon: <EmailIcon />,
      onClick: openEmailForm,
    },
  ];

  if (!supabase) {
    return (
      <div className="w-full max-w-xl rounded-2xl border border-red-400/20 bg-red-900/20 p-4 text-sm text-red-100">
        {copy.missingSupabase}
      </div>
    );
  }

  if (user) {
    return (
      <div className={`w-full max-w-xl ${shellClass}`}>
        <h1 className="text-4xl font-black tracking-tight">{copy.accountLinked}</h1>
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
          {copy.logout}
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
              <span className={`text-xs ${bodyClass}`}>{copy.providerAction}</span>
            </button>
          ))}
        </div>
      ) : (
        <form className="mt-10 flex w-full max-w-lg flex-col gap-3" onSubmit={handleEmailSubmit}>
          <input
            name="auth-email"
            type="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`h-14 rounded-2xl border px-4 text-sm outline-none ring-1 ring-transparent transition ${inputClass}`}
          />
          <input
            name="auth-password"
            type="password"
            placeholder={copy.passwordPlaceholder}
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
              {copy.back}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex h-12 flex-1 items-center justify-center rounded-2xl border text-sm font-medium transition ${buttonClass}`}
            >
              {isSignup ? copy.createAccount : copy.login}
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 max-w-lg">
        <button type="button" onClick={handleModeChange} className={`text-sm font-medium transition ${subtleButtonClass}`}>
          {isSignup ? copy.toggleToLogin : copy.toggleToSignup}
        </button>
        <p className={`mt-5 text-xs leading-6 ${noticeClass}`}>
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
