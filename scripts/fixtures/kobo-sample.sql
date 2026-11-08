-- Kobo veritabanı örneği (LOM-95). Üretim:
--   rm -f src/core/__test__/fixtures/kobo-sample.sqlite
--   sqlite3 src/core/__test__/fixtures/kobo-sample.sqlite < scripts/fixtures/kobo-sample.sql
-- Kobo'nun KoboReader.sqlite şemasının Loomen'ın okuduğu sütunları + SQLite çözücü testi için
-- ek tablolar. Sayfa boyutu 1024: content tablosu iç sayfaya, uzun alıntı taşma sayfasına düşer.
PRAGMA page_size = 1024;
PRAGMA journal_mode = DELETE;

CREATE TABLE content (
  ContentID TEXT NOT NULL,
  ContentType TEXT NOT NULL,
  MimeType TEXT NOT NULL,
  BookID TEXT,
  BookTitle TEXT,
  Title TEXT COLLATE NOCASE,
  Attribution TEXT COLLATE NOCASE,
  VolumeIndex INTEGER,
  ___PercentRead INTEGER DEFAULT 0,
  PRIMARY KEY (ContentID)
);

CREATE TABLE Bookmark (
  BookmarkID TEXT NOT NULL,
  VolumeID TEXT NOT NULL,
  ContentID TEXT NOT NULL,
  StartContainerPath TEXT NOT NULL DEFAULT '',
  StartOffset INTEGER NOT NULL DEFAULT 0,
  Text TEXT,
  Annotation TEXT,
  ExtraAnnotationData BLOB,
  DateCreated TEXT,
  ChapterProgress REAL NOT NULL DEFAULT 0,
  Hidden BOOL NOT NULL DEFAULT 'false',
  DateModified TEXT,
  Type TEXT,
  Color INTEGER DEFAULT 0,
  PRIMARY KEY (BookmarkID)
);
CREATE INDEX bookmark_volume ON Bookmark (VolumeID);

-- Kitap 1 (content kaydı var) ve bölümleri
INSERT INTO content VALUES ('file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', '6', 'application/x-kobo-epub+zip', NULL, NULL, 'Kürk Mantolu Madonna', 'Sabahattin Ali', -1, 40);
INSERT INTO content VALUES ('file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', '899', 'application/xhtml+xml', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'Kürk Mantolu Madonna', 'Birinci Bölüm', NULL, 0, 0);
INSERT INTO content VALUES ('file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch2.xhtml-1', '9', 'application/xhtml+xml', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'Kürk Mantolu Madonna', 'İkinci Bölüm', NULL, 1, 0);
INSERT INTO content VALUES ('file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch3.xhtml', '899', 'application/xhtml+xml', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'Kürk Mantolu Madonna', NULL, NULL, 2, 0);

-- content tablosunu birden çok sayfaya taşıran dolgu bölümleri (çizimi olmayan kitap)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 120)
INSERT INTO content SELECT 'file:///mnt/onboard/dolgu.epub!OEBPS!bolum' || i || '.xhtml', '9', 'application/xhtml+xml',
  'file:///mnt/onboard/dolgu.epub', 'Dolgu', 'Dolgu bölümü numara ' || i || ' — biraz uzun bir başlık', NULL, i, 0 FROM n;

-- Kitap 1 çizimleri
INSERT INTO Bookmark (BookmarkID, VolumeID, ContentID, Text, Annotation, DateCreated, ChapterProgress, Hidden, Type, Color) VALUES
  ('b1', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch2.xhtml', 'Ne zaman bir insanı sevdiğimi anlasam, ondan korkardım.', NULL, '2024-03-10T12:30:45.000', 0.5, 'false', 'highlight', 0),
  ('b2', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', 'Hayatımda tesadüfler pek az oldu.', '  Çok güzel bir cümle.  ', '2024-03-09T08:00:00Z', 0.25, 'false', 'note', 1),
  ('b3', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', 'Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı. Uzun bir alıntı: Çiğdem, şu ağaçların gölgesinde öğle güneşi ışıldarken İstanbul''un üstünde ağır bir sis vardı.', '', '2024-03-09T09:00:00', 0.75, 'false', 'highlight', 2),
  ('b4', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch3.xhtml#part2', 'Üçüncü bölümden mavi çizim.', NULL, '2024-03-11T10:00:00+03:00', 0.1, 'false', 'highlight', 3),
  ('b5', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch2.xhtml', '  Ne zaman bir insanı   sevdiğimi anlasam, ondan korkardım. ', 'Tekrar notu', '2024-03-01T00:00:00', 0.5, 'false', 'note', 0),
  ('b6', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', '', NULL, '2024-03-09T10:00:00', 0.3, 'false', 'dogear', 0),
  ('b7', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', 'Gizlenmiş çizim', NULL, '2024-03-09T11:00:00', 0.4, 'true', 'highlight', 0),
  ('b8', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', '   ', NULL, '2024-03-09T12:00:00', 0.5, 'false', 'highlight', 0),
  ('b9', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub', 'file:///mnt/onboard/Yazarlar/Sabahattin Ali - Kürk Mantolu Madonna.kepub.epub!OEBPS!ch1.xhtml', NULL, NULL, '2024-03-09T13:00:00', 0.6, 'false', 'markup', 0);

-- Kitap 2 (content kaydı yok: başlık yoldan)
INSERT INTO Bookmark (BookmarkID, VolumeID, ContentID, Text, Annotation, DateCreated, ChapterProgress, Hidden, Type, Color) VALUES
  ('c1', 'file:///mnt/onboard/Downloads/The_Old_Man_and_the_Sea.epub', 'file:///mnt/onboard/Downloads/The_Old_Man_and_the_Sea.epub#(3)OEBPS/ch.html', 'He was an old man who fished alone.', NULL, 'dün', 0.42, 'false', 'highlight', 7),
  ('c2', 'file:///mnt/onboard/Downloads/The_Old_Man_and_the_Sea.epub', 'file:///mnt/onboard/Downloads/The_Old_Man_and_the_Sea.epub#(3)OEBPS/ch.html', 'The sea is very big.', NULL, NULL, 0.1, 'false', 'highlight', NULL);

-- Bookmark tablosunu da çok sayfaya taşıran dolgu yer imleri (hepsi atlanır)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 40)
INSERT INTO Bookmark (BookmarkID, VolumeID, ContentID, Text, DateCreated, ChapterProgress, Hidden, Type, Color)
  SELECT 'dolgu-' || i, 'file:///mnt/onboard/dolgu.epub', 'file:///mnt/onboard/dolgu.epub!OEBPS!bolum' || i || '.xhtml',
  NULL, '2024-01-01T00:00:00', 0, 'false', 'dogear', 0 FROM n;

-- SQLite çözücü testi: tipler, INTEGER PRIMARY KEY takma adı, sonradan eklenen sütun
CREATE TABLE loomen_types (id INTEGER PRIMARY KEY, label TEXT, i1 INTEGER, f REAL, b BLOB, n TEXT);
INSERT INTO loomen_types VALUES (1, 'bir bayt', 100, 3.25, X'00FF10', NULL);
INSERT INTO loomen_types VALUES (2, 'iki bayt', 1000, -0.5, X'', 'metin');
INSERT INTO loomen_types VALUES (3, 'üç bayt', 100000, 0, NULL, '');
INSERT INTO loomen_types VALUES (4, 'dört bayt', 100000000, NULL, NULL, NULL);
INSERT INTO loomen_types VALUES (5, 'altı bayt', 100000000000, NULL, NULL, NULL);
INSERT INTO loomen_types VALUES (6, 'sekiz bayt', 9007199254740991, NULL, NULL, NULL);
INSERT INTO loomen_types VALUES (7, 'eksi', -5, NULL, NULL, NULL);
INSERT INTO loomen_types VALUES (8, 'eksi üç bayt', -300000, NULL, NULL, NULL);
INSERT INTO loomen_types VALUES (9, 'sıfır', 0, NULL, NULL, NULL);
INSERT INTO loomen_types VALUES (1000, 'bir', 1, NULL, NULL, NULL);
ALTER TABLE loomen_types ADD COLUMN extra TEXT;
INSERT INTO loomen_types VALUES (1001, 'yeni sütun', -1, NULL, NULL, NULL, 'son');

CREATE TABLE "garip ad" ("sütun, virgüllü" TEXT, [köşeli] INTEGER, `ters` TEXT DEFAULT 'a,b', CONSTRAINT c1 CHECK (length("sütun, virgüllü") > 0));
INSERT INTO "garip ad" VALUES ('değer', 42, 'x');
