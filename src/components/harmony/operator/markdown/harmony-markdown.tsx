"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseMarkdown, type Block, type Inline } from "./parse";

/**
 * Renders Harmony's markdown replies as React elements (no dangerouslySetInnerHTML,
 * so escaping — and thus XSS safety — is handled entirely by React). Supports
 * headings, emphasis, inline code, fenced code blocks (with a copy button), GFM
 * tables, lists, blockquotes, links, and horizontal rules. Tolerant of partial
 * markdown so it renders cleanly while a reply is still streaming.
 */

function renderInline(nodes: Inline[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (n.kind) {
      case "text":
        return <span key={key}>{n.value}</span>;
      case "br":
        return <br key={key} />;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]"
          >
            {n.value}
          </code>
        );
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(n.children, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(n.children, key)}</em>;
      case "del":
        return (
          <del key={key} className="opacity-70">
            {renderInline(n.children, key)}
          </del>
        );
      case "link":
        return (
          <a
            key={key}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            {renderInline(n.children, key)}
          </a>
        );
      default:
        return null;
    }
  });
}

function CodeBlock({
  lang,
  value,
  copyLabel,
  copiedLabel,
}: {
  lang: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-background/60">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
          aria-label={copied ? copiedLabel : copyLabel}
        >
          {copied ? (
            <Check className="size-3" aria-hidden="true" />
          ) : (
            <Copy className="size-3" aria-hidden="true" />
          )}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[0.8rem] leading-relaxed">
        <code className="font-mono">{value}</code>
      </pre>
    </div>
  );
}

const ALIGN_CLASS: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function renderBlock(
  block: Block,
  key: string,
  copyLabel: string,
  copiedLabel: string,
): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const cls = [
        "text-lg font-semibold",
        "text-base font-semibold",
        "text-sm font-semibold",
        "text-sm font-semibold",
        "text-xs font-semibold uppercase tracking-wide",
        "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
      ][block.level - 1];
      const Tag = (`h${block.level}` as unknown) as keyof React.JSX.IntrinsicElements;
      return (
        <Tag key={key} className={cn("mt-1 first:mt-0", cls)}>
          {renderInline(block.inline, key)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="leading-relaxed">
          {renderInline(block.inline, key)}
        </p>
      );
    case "code":
      return (
        <CodeBlock
          key={key}
          lang={block.lang}
          value={block.value}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
      );
    case "hr":
      return <hr key={key} className="my-3 border-border" />;
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground"
        >
          {renderInline(block.inline, key)}
        </blockquote>
      );
    case "list": {
      const items = block.items.map((it, i) => (
        <li key={`${key}-li-${i}`} className="leading-relaxed">
          {renderInline(it, `${key}-li-${i}`)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} start={block.start} className="list-decimal space-y-0.5 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-0.5 pl-5">
          {items}
        </ul>
      );
    }
    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.8rem]">
            <thead>
              <tr className="border-b border-border">
                {block.header.map((cell, i) => (
                  <th
                    key={`${key}-th-${i}`}
                    className={cn(
                      "px-2 py-1 font-semibold",
                      ALIGN_CLASS[block.align[i] ?? ""] ?? "",
                    )}
                  >
                    {renderInline(cell, `${key}-th-${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={`${key}-tr-${r}`} className="border-b border-border/50">
                  {row.map((cell, c) => (
                    <td
                      key={`${key}-td-${r}-${c}`}
                      className={cn("px-2 py-1", ALIGN_CLASS[block.align[c] ?? ""] ?? "")}
                    >
                      {renderInline(cell, `${key}-td-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export function HarmonyMarkdown({
  content,
  className,
  copyLabel = "Copy",
  copiedLabel = "Copied",
}: {
  content: string;
  className?: string;
  copyLabel?: string;
  copiedLabel?: string;
}) {
  const blocks = parseMarkdown(content);
  return (
    <div className={cn("space-y-2 break-words", className)}>
      {blocks.map((b, i) => renderBlock(b, `b-${i}`, copyLabel, copiedLabel))}
    </div>
  );
}
