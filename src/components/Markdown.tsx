import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { prepareMath } from "../lib/mathText";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: "ignore" }]] as never;

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  code: ({ node: _node, className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
    if (!isBlock) {
      return (
        <code className="md-inline-code" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {prepareMath(text)}
      </ReactMarkdown>
    </div>
  );
}
