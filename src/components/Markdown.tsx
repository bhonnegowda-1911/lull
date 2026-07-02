import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

// Small shared markdown renderer. The app has no @tailwindcss/typography, so element styling is
// supplied via a `components` map (not `prose`) and text size/color is inherited from the wrapper's
// `className`. Authored content — e.g. on-demand coding-problem statements — is markdown (inline
// `code`, bold/italic, lists, soft line breaks); without this it renders as raw syntax. react-markdown
// builds React nodes and sanitizes by default, so there's no dangerouslySetInnerHTML.

const inlineCode: NonNullable<Components['code']> = ({ children }) => (
  <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-800">{children}</code>
)

const link: NonNullable<Components['a']> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-terracotta-700 underline hover:text-terracotta-800">
    {children}
  </a>
)

// Block rendering — valid anywhere a <div> is (e.g. the live interview view).
const blockComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: inlineCode,
  a: link,
}

// Inline rendering — block tags collapse to phrasing content so the output is valid inside a <button>
// (the picker card is one big button, which may only contain phrasing content).
const inlineComponents: Components = {
  p: ({ children }) => <span>{children}</span>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span>{children} </span>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: inlineCode,
  a: link,
}

const plugins = [remarkGfm, remarkBreaks]

export default function Markdown({
  children,
  className,
  inline = false,
}: {
  children: string
  className?: string
  inline?: boolean
}) {
  const md = (
    <ReactMarkdown remarkPlugins={plugins} components={inline ? inlineComponents : blockComponents}>
      {children}
    </ReactMarkdown>
  )
  return inline ? <span className={className}>{md}</span> : <div className={className}>{md}</div>
}
