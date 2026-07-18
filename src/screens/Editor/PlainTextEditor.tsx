import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (text: string) => void;
  spellCheck: boolean;
}

/** Yerel <textarea> tabanlı düz metin editörü.
 *  macOS sesli yazma (dictation) CodeMirror'ın contenteditable'ında çalışmaz ama yerel
 *  textarea'da çalışır (arama kutusu gibi). Aynı draft/onChange yolunu kullanır →
 *  veri güvenliği kuralları korunur. Biçimlendirme araç çubuğu için textarea ref'i dışa açılır. */
export const PlainTextEditor = forwardRef<HTMLTextAreaElement, Props>(function PlainTextEditor(
  { value, onChange, spellCheck },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);

  // İçeriğe göre otomatik yükseklik — dış scroll doğal aksın (yazma + dictation ikisinde de).
  const autosize = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  useLayoutEffect(autosize, [value]);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.focus();
    // İmleci metnin sonuna al — okumadan geçince/dikte ederken doğal olarak sona yazsın.
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  return (
    <textarea
      ref={inner}
      className="lo-plaineditor"
      value={value}
      spellCheck={spellCheck}
      onChange={(e) => onChange(e.target.value)}
      autoCapitalize="sentences"
      autoCorrect="on"
    />
  );
});
