import * as monaco from "monaco-editor";
import "monaco-editor/min/vs/editor/editor.main.css";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useEffect, useRef } from "react";

type MonacoWorkerEnvironment = {
  getWorker: (_workerId: string, label: string) => Worker;
};

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

monacoGlobal.MonacoEnvironment ??= {
  getWorker: (_workerId, label) => {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

interface MonacoCodeSurfaceProps {
  readonly contents: string;
  readonly language: string;
  readonly path: string;
  readonly theme: "light" | "dark";
}

export default function MonacoCodeSurface({
  contents,
  language,
  path,
  theme,
}: MonacoCodeSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const modelUri = monaco.Uri.parse(`file:///${path}`);
    const model =
      monaco.editor.getModel(modelUri) ?? monaco.editor.createModel(contents, language, modelUri);
    model.setValue(contents);
    monaco.editor.setModelLanguage(model, language);

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      contextmenu: true,
      cursorBlinking: "smooth",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontLigatures: false,
      fontSize: 13,
      lineHeight: 20,
      lineNumbers: "on",
      minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
      model,
      padding: { bottom: 18, top: 14 },
      readOnly: true,
      renderLineHighlight: "all",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      theme: theme === "dark" ? "vs-dark" : "vs",
      wordWrap: "off",
    });

    return () => {
      editor.dispose();
    };
  }, [contents, language, path, theme]);

  return <div ref={containerRef} className="min-h-0 min-w-0 flex-1" />;
}
