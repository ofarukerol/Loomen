---
name: LOM-76 — Adsız notun dosya adı başlıktan otomatik gelsin
description: Elle ad verilmemiş (Adsız) notun dosya adı, nota yazılan ilk başlıktan otomatik üretilir; elle verilmiş adlara dokunulmaz, not içeriği değişmez, açık not aynı içerikle açık kalır.
type: project
proje: loomen
kaynak: kart LOM-76 · dal fix/LOM-76 · Loomen@e7eae4d113fc7a99f08f54af7248278728eaddb0 · test koşusu a168e9f3-86c3-45ff-b359-bae045b22fe1 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-76 — Adsız notun dosya adı başlıktan otomatik gelsin

## Ne yapıldı

Elle ad verilmemiş (Adsız) notun dosya adı, nota yazılan ilk başlıktan otomatik üretilir; elle verilmiş adlara dokunulmaz, not içeriği değişmez, açık not aynı içerikle açık kalır.

## Adımlar

- Yeni saf modül src/core/markdown/autoTitle.ts: AUTO_NAME_BASE='Adsız' ve isAutoName(name) (/^Adsız( \d+)?$/); firstHeading(content) → {text,line}|null (YAML frontmatter ve ``` kod bloklarını atlar, ilk #..###### satırı, kapanış #'ları atılır); headingFileName(text) → [[a|b]]→b, [[a]]→a, [t](u)→t, vurgu işaretleri (* _ ~ `) kaldırılır, / \ : * ? " < > | ve kontrol karakterleri silinir, boşluklar tekleştirilir, baş/son nokta kırpılır, 80 karakterde kesilir; autoNameTarget(currentName, content) → temizlenmiş başlık, boşsa ya da currentName ile aynıysa null; freeName(base, taken) → base, 'base 2', 'base 3'… ilk boş ad.
- useAppStore.ts: modül düzeyinde `const autoNamed = new Set<string>()` (elle ad verilmemiş not yolları). newNote ve newFolder oluşturduğu notun yolunu kümeye ekler. reopenVault'ta backend değişirken küme temizlenir (başka kasanın yolları karışmasın).
- useAppStore.ts renameNote(path, newName, opts?: { auto?: boolean }) → Promise<string|null> (başarıda yeni yol, aksi halde null; AppState tipi 542. satırda güncellenir, mevcut `void renameNote(...)` çağrıları bozulmaz). opts.auto yokken (gezginden elle ad) başta autoNamed.delete(path). Çakışmada auto ise notifyError gösterilmez, sessiz null. Başarıda auto ise autoNamed.delete(path); autoNamed.add(to). renameFolder'daki map ile kümedeki yollar da taşınır.
- useAppStore.ts yeni eylem autoNameNote(path): Promise<string|null>: not listede ve kind==='note' değilse null; uygun değilse (autoNamed.has(path) || isAutoName(note.name) değilse) null; path==draftPath iken draft !== noteContents[path] (kaydedilmemiş taslak) ya da draftConflict?.path===path ise null (içeriğe dokunmadan bekler); içerik noteContents[path]; autoNameTarget(note.name, content) null ise null; freeName ile listeye (aynı klasör, .md) göre boş ad seçilir, seçilen için backend.exists kontrolü yapılır, doluysa dışlanıp döngü sürer (en çok 50); sonuç currentName ile aynıysa null; renameNote(path, name, { auto: true }) sonucunu döndürür.
- EditorScreen.tsx: caretRestore = useRef<{path,pos,focus}|null>. [draft, editing, activeNote] etkisine 1500 ms zamanlayıcı: editing ve activeNote yoksa çık; view=viewRef.current; h=firstHeading(draft); view odaklıysa ve (isMobile || imlecin satır indeksi === h.line) ise çık (başlık hâlâ yazılıyor / mobilde klavye düşmesin); pos ve hadFocus alınır; to = await autoNameNote(activeNote); to geldiyse caretRestore={path:to,pos,focus:hadFocus}. Zamanlayıcı cleanup'ta temizlenir.
- EditorScreen.tsx: nottan ayrılırken de dene: [activeNote] etkisinin cleanup'ı eski yolu ve o anki vaultPath'i kapatır; kasa aynıysa void autoNameNote(eskiYol) (taslak zaten leaveDraft ile yazılmış; aktif olmayan notta editör yeniden kurulmaz). toggleMode'da editing→okuma geçişinde `await saveNote()` sonrası `void autoNameNote(activeNote)`.
- EditorScreen.tsx / CodeMirrorEditor.tsx: initialCaret = caretRestore.current?.path===activeNote ? pos : (isDaily ? firstSectionCaret(draft) : undefined); CodeMirrorEditor'a `focusOnMount?: boolean` (varsayılan true) eklenir, restore kaydı varsa focus değeri geçilir; CodeMirrorEditor'da initialCaret'in yalnız kaydırma değil seçim (selection anchor) olarak da uygulandığı doğrulanır, değilse eklenir. Restore kaydı kurulumdan sonra ([activeNote] etkisinde) sıfırlanır.
- Test: src/core/__test__/autoTitleTest.ts (mevcut tableWrapTest.ts biçiminde check/ran/fails): frontmatter ve kod bloğu atlanır; '# Linkler' → 'Linkler'; kapanış #'ları, vurgu ve bağlantı sözdizimi temizlenir; yasak karakterler silinir; 80 karakter kesimi; başlıksız içerik → null; currentName ile aynı → null; isAutoName('Adsız'), 'Adsız 3' true, 'Linkler' false; freeName çakışmada 'Linkler 2'. Kaynak metin kontrolleri: newNote/newFolder autoNamed.add çağırır; renameNote `auto` seçeneğini tanır ve auto'da notifyError çağrısı atlanır; autoNameNote draftConflict ve kaydedilmemiş taslakta null döner; EditorScreen autoNameNote'u 1500 ms ve ayrılışta çağırır, başlık satırındayken ve mobilde odaklıyken atlar; CodeMirrorEditor focusOnMount'u uygular. scripts/run-tests.mjs listesine eklenir.
- npm test ve npm run typecheck koşulur; LoomenWiki/modules/mimari.md'de not/düzenleyici bölümü varsa 2-3 satırla otomatik adlandırma kuralı (Adsız deseni + elle ad verilince biter) yazılır.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/autoTitle.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/core/__test__/autoTitleTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. Tam test takımı (37 dosya) geçti, autoTitleTest 64/64 geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-76`
- Commit: `Loomen@e7eae4d113fc7a99f08f54af7248278728eaddb0`
- Test koşusu: `a168e9f3-86c3-45ff-b359-bae045b22fe1` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.
