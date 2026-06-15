import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { TERMS_CONTENT } from "../legal/termsContent";
import { PRIVACY_CONTENT } from "../legal/privacyContent";

const COPY = {
  ko: {
    title: "이용약관 및 개인정보처리방침",
    agree: "동의하기",
    cancel: "취소",
    scrollHint: "약관 전체를 끝까지 확인해주세요.",
  },
  en: {
    title: "Terms of Service & Privacy Policy",
    agree: "I Agree",
    cancel: "Cancel",
    scrollHint: "Please scroll to the end before agreeing.",
  },
  zh: {
    title: "服务条款及隐私政策",
    agree: "同意",
    cancel: "取消",
    scrollHint: "请阅读至末尾后再同意。",
  },
  ja: {
    title: "利用規約とプライバシーポリシー",
    agree: "同意する",
    cancel: "キャンセル",
    scrollHint: "最後まで確認してください。",
  },
  hi: {
    title: "उपयोग की शर्तें और गोपनीयता नीति",
    agree: "सहमत हूँ",
    cancel: "रद्द करें",
    scrollHint: "कृपया अंत तक पढ़ें।",
  },
};

function renderBlock(block, index) {
  if (block.type === "ol") {
    return (
      <ol key={index} className="list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-300">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  if (block.type === "ul") {
    return (
      <ul key={index} className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <p key={index} className="text-sm leading-7 text-slate-300">
      {block.text}
    </p>
  );
}

function renderDocument(content) {
  return (
    <section className="space-y-6">
      <h3 className="text-base font-bold text-white">{content.title}</h3>
      {content.sections.map((section) => (
        <div key={section.id}>
          <h4 className="text-sm font-bold text-emerald-200">{section.title}</h4>
          <div className="mt-2 space-y-3">{section.blocks.map(renderBlock)}</div>
        </div>
      ))}
    </section>
  );
}

function TermsAgreementDialog({ open, onOpenChange, onAgree, outputLanguage = "ko" }) {
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const contentRef = useRef(null);
  const copy = COPY[outputLanguage] ?? COPY.ko;

  const handleScroll = () => {
    const content = contentRef.current;
    if (!content) return;

    const scrollPercentage = content.scrollTop / (content.scrollHeight - content.clientHeight);
    if (scrollPercentage >= 0.99 && !hasReadToBottom) {
      setHasReadToBottom(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange?.(false)} className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>

        <div ref={contentRef} onScroll={handleScroll} className="overflow-y-auto px-6 py-4">
          <div className="space-y-10">
            {renderDocument(TERMS_CONTENT)}
            <div className="h-px bg-white/10" />
            {renderDocument(PRIVACY_CONTENT)}
          </div>
        </div>

        <DialogFooter className="border-t border-white/10 px-6 py-4 sm:items-center">
          {!hasReadToBottom && (
            <span className="grow text-xs text-slate-400 max-sm:text-center">{copy.scrollHint}</span>
          )}
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-medium text-slate-100 transition hover:border-white/24 hover:bg-white/[0.06]"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            disabled={!hasReadToBottom}
            onClick={onAgree}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.agree}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TermsAgreementDialog;
