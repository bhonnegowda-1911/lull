import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import type { Extension } from '@codemirror/state'
import type { CodeLanguage } from '../../data/coding/stages'

// Thin CodeMirror wrapper for the IMPLEMENT stage. Picks the syntax-highlighting extension from the
// selected language; everything else (submit, language select) lives in CodeComposer.

const LANG_EXT: Record<CodeLanguage, () => Extension> = {
  javascript: () => javascript(),
  python: () => python(),
  java: () => java(),
  cpp: () => cpp(),
}

interface CodeEditorProps {
  value: string
  language: CodeLanguage
  onChange: (value: string) => void
  readOnly?: boolean
}

export default function CodeEditor({ value, language, onChange, readOnly }: CodeEditorProps) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-300 bg-white">
      <CodeMirror
        value={value}
        height="280px"
        extensions={[LANG_EXT[language]()]}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly }}
        placeholder="Write your solution here…"
      />
    </div>
  )
}
