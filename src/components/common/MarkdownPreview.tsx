import { useMemo } from "react";
import { Marked, Renderer } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

const renderer = new Renderer();

renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  const highlighted = hljs.highlight(text, { language }).value;
  const langLabel = lang ? `<span class="code-lang-label">${lang}</span>` : "";
  return `<pre>${langLabel}<code class="hljs language-${language}">${highlighted}</code></pre>`;
};

const marked = new Marked({
  renderer,
  gfm: true,
  breaks: true,
});

export function MarkdownPreview({
  content,
  className,
}: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (!content || !content.trim()) return "";
    return marked.parse(content) as string;
  }, [content]);

  if (!html) {
    return (
      <div className={className}>
        <p className="text-zinc-500 italic text-sm">No content</p>
      </div>
    );
  }

  return (
    <>
      <style>{markdownStyles}</style>
      <div
        className={`markdown-preview prose dark:prose-invert prose-sm max-w-none ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

const markdownStyles = `
  .markdown-preview pre {
    position: relative;
    background: var(--tw-prose-pre-bg, #1e1e2e);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    margin: 1rem 0;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .markdown-preview pre .code-lang-label {
    position: absolute;
    top: 0.375rem;
    right: 0.5rem;
    font-size: 0.675rem;
    color: rgba(160, 160, 160, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    pointer-events: none;
    user-select: none;
  }

  .markdown-preview pre code {
    background: transparent;
    padding: 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: inherit;
  }

  .markdown-preview code {
    background: rgba(127, 127, 127, 0.15);
    padding: 0.15em 0.35em;
    border-radius: 0.25rem;
    font-size: 0.85em;
  }

  .markdown-preview blockquote {
    border-left: 3px solid rgba(127, 127, 127, 0.4);
    padding-left: 1rem;
    color: rgba(160, 160, 160, 0.85);
    font-style: italic;
    margin: 1rem 0;
  }

  .markdown-preview table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.875rem;
  }

  .markdown-preview th,
  .markdown-preview td {
    border: 1px solid rgba(127, 127, 127, 0.25);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .markdown-preview th {
    background: rgba(127, 127, 127, 0.1);
    font-weight: 600;
  }

  .markdown-preview tr:nth-child(even) {
    background: rgba(127, 127, 127, 0.04);
  }

  .markdown-preview img {
    max-width: 100%;
    border-radius: 0.5rem;
    margin: 1rem 0;
  }

  .markdown-preview a {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .markdown-preview hr {
    border: none;
    border-top: 1px solid rgba(127, 127, 127, 0.2);
    margin: 1.5rem 0;
  }

  .markdown-preview ul,
  .markdown-preview ol {
    padding-left: 1.5rem;
    margin: 0.5rem 0;
  }

  .markdown-preview li {
    margin: 0.25rem 0;
  }

  .markdown-preview h1,
  .markdown-preview h2,
  .markdown-preview h3,
  .markdown-preview h4 {
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }
`;
