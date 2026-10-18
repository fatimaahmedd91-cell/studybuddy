"use client";

// Shows one legal document from src/content/legal.ts. Placeholders like [INSERT DATE] are highlighted,
// and a banner says the page is a draft until every placeholder is filled in.
import Link from "next/link";
import { type Block, type LegalDoc, placeholders } from "@/content/legal";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { useOptions } from "@/lib/options";
import { MeerkatMark } from "./Brand";
import LegalLinks from "./LegalLinks";

const PLACEHOLDER = /(\[[A-Z][A-Z0-9 ,.'’()/:;\-–—“”"]+\])/g;
// The same pattern without the "g" flag: a global pattern remembers its position between .test() calls.
const IS_PLACEHOLDER = /^\[[A-Z][A-Z0-9 ,.'’()/:;\-–—“”"]+\]$/;

function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, i) =>
        IS_PLACEHOLDER.test(part) ? (
          <mark key={i} className="rounded bg-warning-soft px-1 font-semibold text-warning">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string") return <p className="mt-2"><Text text={block} /></p>;
  if ("list" in block) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {block.list.map((item) => <li key={item}><Text text={item} /></li>)}
      </ul>
    );
  }
  if ("table" in block) {
    const [head, ...rows] = block.table;
    return (
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>{head.map((h) => <th key={h} className="border-b-2 border-forest p-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="align-top">
                {row.map((cell, i) => <td key={i} className="border-b border-sage-strong p-2"><Text text={cell} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <aside className="mt-3 rounded-xl border-2 border-dashed border-warning bg-warning-soft p-3 text-sm text-warning">
      <b>Draft check (remove before launch):</b> {block.note}
    </aside>
  );
}

export default function LegalPage({ doc, summary }: { doc: LegalDoc; summary?: string[] }) {
  const { status } = useAuth();
  const { options } = useOptions();
  const missing = placeholders(doc);
  const isTerms = doc.title.includes("Terms");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={status === "ready" ? "/feed" : "/"} className="flex min-h-11 items-center gap-2 text-xl font-extrabold">
          <MeerkatMark className="h-9 w-9" /> {BRAND.name}
        </Link>
        <Link href={status === "ready" ? "/settings" : "/"} className="font-semibold underline">
          ← Back
        </Link>
      </div>

      <div role="note" className="mt-6 rounded-frame border-2 border-warning bg-warning-soft p-4 text-warning">
        <p className="font-bold">Draft — not ready to publish</p>
        <p className="mt-1 text-sm">
          This text has not been reviewed by a lawyer and doesn&apos;t mean {BRAND.name} is legally compliant.
          {missing.length > 0 && ` ${missing.length} item${missing.length === 1 ? " is" : "s are"} still to be filled in (highlighted).`}{" "}
          The team&apos;s checklist is in docs/PRE_LAUNCH_CHECKLIST.md.
        </p>
      </div>

      <article className="mt-6 rounded-frame bg-cream p-5 sm:p-8">
        <h1 className="text-3xl font-extrabold">{doc.title}</h1>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {isTerms && (
            <>
              <dt className="font-semibold">Version</dt>
              <dd>{options?.terms_version ?? "…"} (the version people accept when signing up)</dd>
            </>
          )}
          {doc.meta.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold">{label}</dt>
              <dd><Text text={value} /></dd>
            </div>
          ))}
        </dl>

        {summary && (
          <section aria-labelledby="summary-title" className="mt-6 rounded-xl bg-sage p-4">
            <h2 id="summary-title" className="text-xl font-bold">In plain language</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {summary.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        )}

        {doc.intro.map((block, i) => <BlockView key={i} block={block} />)}
        {doc.sections.map((section) => (
          <section key={section.heading} className="mt-6">
            <h2 className="text-xl font-bold">{section.heading}</h2>
            {section.blocks.map((block, i) => <BlockView key={i} block={block} />)}
          </section>
        ))}
      </article>

      <footer className="mt-6">
        <LegalLinks />
      </footer>
    </main>
  );
}
