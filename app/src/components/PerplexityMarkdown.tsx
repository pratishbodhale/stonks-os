import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeAiMarkdown } from "@/lib/strip-thinking-tags";

type Props = {
  markdown: string;
  className?: string;
};

export function PerplexityMarkdown({ markdown, className }: Props) {
  const cleaned = normalizeAiMarkdown(markdown);

  return (
    <div className={`block w-full overflow-visible ${className ?? ""}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => (
            <h2 className="mt-4 first:mt-0 text-base font-bold text-slate-900">{children}</h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-3 first:mt-0 text-sm font-bold text-slate-900">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-2 text-sm font-semibold text-slate-800">{children}</h4>
          ),
          p: ({ children }) => <p className="mt-2 first:mt-0 leading-relaxed text-slate-800">{children}</p>,
          ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-800">{children}</ul>,
          ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-800">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return <code className={className}>{children}</code>;
            }
            return (
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-900">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-2 border-l-4 border-violet-200 pl-3 text-slate-700">{children}</blockquote>
          ),
          hr: () => <hr className="my-4 border-slate-200" />,
          table: ({ children }) => (
            <div className="mt-2 max-w-full overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-100 text-slate-700">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-slate-200 px-2 py-1.5 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-200 px-2 py-1.5 text-slate-800">{children}</td>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
