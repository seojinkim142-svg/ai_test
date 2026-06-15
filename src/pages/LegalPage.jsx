import { memo } from "react";
import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "../legal/companyInfo";
import { TERMS_CONTENT } from "../legal/termsContent";
import { PRIVACY_CONTENT } from "../legal/privacyContent";
import { JAPAN_TRANSACTIONS_CONTENT } from "../legal/japanTransactionsContent";

const DOCUMENTS = {
  terms: TERMS_CONTENT,
  privacy: PRIVACY_CONTENT,
  "japan-transactions": JAPAN_TRANSACTIONS_CONTENT,
};

function renderBlock(block, index) {
  if (block.type === "ol") {
    return (
      <ol key={index} className="space-y-2 pl-5 text-sm leading-7 text-[#666666] list-decimal">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  if (block.type === "ul") {
    return (
      <ul key={index} className="space-y-2 pl-5 text-sm leading-7 text-[#666666] list-disc">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <p key={index} className="text-sm leading-7 text-[#666666]">
      {block.text}
    </p>
  );
}

const LegalPage = memo(function LegalPage({ documentType = "terms" }) {
  const content = DOCUMENTS[documentType] || TERMS_CONTENT;

  return (
    <div className="min-h-screen bg-[#FBFBF9] font-sans text-[#0A0A0A]">
      <header className="sticky top-0 z-10 border-b border-[#E5E5E0] bg-[#FBFBF9]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E0] bg-white px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition hover:border-[#006FEE] hover:text-[#006FEE]"
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
                      ? "border-[#006FEE] bg-[#006FEE] text-white"
                      : "border-[#E5E5E0] bg-white text-[#666666] hover:border-[#006FEE] hover:text-[#006FEE]"
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
        <section className="overflow-hidden rounded-2xl border border-[#E5E5E0] bg-white shadow-sm">
          <div className="border-b border-[#E5E5E0] px-6 py-8 md:px-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#006FEE]">{content.eyebrow}</p>
                <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-[#0A0A0A] md:text-5xl">
                  {content.title}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#666666] md:text-base">{content.description}</p>
              </div>
              <div className="rounded-full border border-[#E5E5E0] bg-[#FBFBF9] px-4 py-3 text-sm text-[#666666]">
                시행일 {content.effectiveDate}
              </div>
            </div>
          </div>

          <div className="grid gap-0 border-b border-[#E5E5E0] md:grid-cols-3">
            {COMPANY_INFO_ITEMS.map((item) => (
              <div
                key={item.label}
                className="border-b border-r border-[#E5E5E0] bg-[#FBFBF9] px-6 py-4 last:border-r-0 md:px-8"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#006FEE]">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-[#0A0A0A]">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="border-b border-[#E5E5E0] px-6 py-4 md:px-10">
            <div className="flex flex-wrap gap-2">
              {content.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-full border border-[#E5E5E0] bg-[#FBFBF9] px-3 py-2 text-xs font-medium text-[#666666] transition hover:border-[#006FEE] hover:text-[#006FEE]"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>

          <div className="max-h-[72vh] overflow-y-auto">
            <div className="px-6 py-6 md:px-10">
              {content.sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className={`scroll-mt-24 py-7 ${index > 0 ? "border-t border-[#E5E5E0]" : ""}`}
                >
                  <h2 className="text-lg font-bold text-[#0A0A0A] md:text-xl">{section.title}</h2>
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
