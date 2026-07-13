import { useEffect, useRef } from "react";

type CodeBlockProps = {
  code: string;
  language: "sql" | "csv";
};

const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const codeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    const highlightCode = async () => {
      const { createHighlighter } = await import("shiki");
      const highlighter = await createHighlighter({
        themes: ["github-light"],
        langs: [language],
      });

      if (!cancelled && codeRef.current) {
        const html = highlighter.codeToHtml(code, {
          lang: language,
          themes: { light: "github-light" },
        });
        const innerContent = html
          .replace(/<pre[^>]*>/, "")
          .replace(/<\/pre>$/, "");
        codeRef.current.innerHTML = innerContent;
      }
    };

    highlightCode();
    return () => { cancelled = true; };
  }, [code, language]);

  return (
    <pre
      ref={codeRef}
      className="p-4 overflow-auto text-sm border rounded-md border-slate-200 dark:border-slate-700 not-prose"
    />
  );
};

export default CodeBlock;
