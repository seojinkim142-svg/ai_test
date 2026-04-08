import { memo } from "react";
import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "../legal/companyInfo";
import { TERMS_CONTENT } from "../legal/termsContent";
import { PRIVACY_CONTENT } from "../legal/privacyContent";

const DOCUMENTS = {
  terms: TERMS_CONTENT,
  privacy: PRIVACY_CONTENT,
};

function renderBlock(block, index) {
  if (block.type === "ol") {
    return (
      <ol key={index} className="space-y-2 pl-5 text-sm leading-7 text-slate-300 list-decimal">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  if (block.type === "ul") {
    return (
      <ul key={index} className="space-y-2 pl-5 text-sm leading-7 text-slate-300 list-disc">
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

const LegalPage = memo(function LegalPage({ documentType = "terms" }) {
  const content = DOCUMENTS[documentType] || TERMS_CONTENT;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_30%),linear-gradient(180deg,_#04110f_0%,_#020617_100%)] text-slate-100">
      <header className="sticky top-0 z-10 border-b border-emerald-300/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/50 hover:bg-emerald-300/10"
          >
            홈으로
          </a>
          <nav className="flex flex-wrap items-center gap-2">
            {LEGAL_LINKS.map((link) => {
              const isActive = link.href === `/${content.slug}`;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "border-emerald-200 bg-emerald-300 text-emerald-950"
                      : "border-emerald-300/20 text-emerald-100 hover:border-emerald-200/45 hover:bg-emerald-300/10"
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="overflow-hidden border border-slate-200/12 bg-slate-950/90 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <div className="border-b border-slate-200/10 px-6 py-8 md:px-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">{content.title}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">{content.description}</p>
              </div>
              <div className="border border-slate-200/12 bg-black/25 px-4 py-3 text-sm text-emerald-100/85">
                시행일 {content.effectiveDate}
              </div>
            </div>
          </div>

          <div className="grid gap-0 border-b border-slate-200/10 md:grid-cols-3">
            {COMPANY_INFO_ITEMS.map((item) => (
              <div
                key={item.label}
                className="border-b border-r border-slate-200/10 bg-black/10 px-6 py-4 last:border-r-0 md:px-8"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/70">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="border-b border-slate-200/10 px-6 py-4 md:px-10">
            <div className="flex flex-wrap gap-2">
              {content.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="border border-slate-200/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-300/40 hover:text-emerald-100"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>

          <div className="max-h-[72vh] overflow-y-auto bg-[#020814]">
            <div className="px-6 py-6 md:px-10">
              {content.sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className={`scroll-mt-24 py-7 ${index > 0 ? "border-t border-slate-200/10" : ""}`}
                >
                  <h2 className="text-lg font-bold text-white md:text-xl">{section.title}</h2>
                  <div className="mt-4 space-y-3">{section.blocks.map(renderBlock)}</div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
});

export default LegalPage;
