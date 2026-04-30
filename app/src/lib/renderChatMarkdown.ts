/**
 * Browser-only Markdown → safe HTML for chat bubbles (Plan + PowerVibe).
 * Shiki loads once (async); until then, fenced code renders as plain markdown-it.
 */
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { fromHighlighter } from "@shikijs/markdown-it/core";
import { createHighlighter } from "shiki";

const mdPlain = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

let mdShiki: MarkdownIt | null = null;
let shikiInitPromise: Promise<void> | null = null;

let hooksInstalled = false;

function ensureLinkHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/** Load Shiki + wire markdown-it (call once from chat UI onMounted). */
export function initShikiChatMarkdown(): Promise<void> {
  if (mdShiki) return Promise.resolve();
  if (!shikiInitPromise) {
    shikiInitPromise = (async () => {
      const highlighter = await createHighlighter({
        themes: ["github-dark"],
        langs: ["vue", "typescript", "javascript", "tsx", "css", "json", "bash", "html"],
      });
      const md = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
        typographer: false,
      });
      md.use(
        fromHighlighter(highlighter, {
          theme: "github-dark",
          fallbackLanguage: "typescript",
        }),
      );
      mdShiki = md;
    })();
  }
  return shikiInitPromise;
}

function sanitizeChatHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ["span"],
    ADD_ATTR: ["class", "style", "tabindex", "aria-hidden"],
  });
}

export function renderChatMarkdown(markdown: string): string {
  ensureLinkHooks();
  const engine = mdShiki ?? mdPlain;
  const raw = engine.render(markdown);
  return sanitizeChatHtml(raw);
}
