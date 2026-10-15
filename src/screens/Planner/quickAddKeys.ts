// Hızlı ekleme kutusunun tuş kuralı — saf, React/DOM'a bağlı değil (node testinde koşar).
// Masaüstü ve mobil aynı kuralı izler: Enter ya da ekran klavyesinin onay tuşu görevi ekler.

export interface QuickAddKeyInput {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
}

export function isQuickAddSubmitKey({ key, keyCode, isComposing }: QuickAddKeyInput): boolean {
  // IME (Türkçe/Arapça klavye, mobil öneri çubuğu) yazımı sürerken Enter görev eklemesin.
  if (isComposing || keyCode === 229) return false;
  return key === "Enter" || keyCode === 13;
}
