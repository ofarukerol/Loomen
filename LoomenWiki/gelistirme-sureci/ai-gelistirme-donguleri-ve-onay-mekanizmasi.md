# AI Destekli Geliştirmede Döngü (Loop) Mekanizmaları ve Onay Akışı

> **Tarih:** 2026-07-08
> **Kapsak notu:** Bu doküman Datha ekosistemi için yazılan aynı isimli rehberin Loomen'e uyarlanmış halidir. Loomen tek-kişilik, local-first bir proje olduğu için bazı bölümler (özellikle "DAT board") Datha'ya özgüdür ve burada sadece referans/gelecek fikir olarak durur.

---

## Ne İşe Yarar?

"AI destekli yazılım geliştirmede döngü (loop) kavramı nasıl kullanılır?" sorusuna verilen cevabın somutlaştırılmış hali. AI ajanları (Claude Code gibi) kodlama sürecinde 4 farklı döngü türü içinde çalışır — bunlardan hangileri Loomen'de zaten var, hangileri eksik, hangisi bu oturumda eklendi, aşağıda kayıtlı.

## Dört döngü türü

| # | Döngü | Ne demek | Loomen'de durumu |
|---|-------|----------|-------------------|
| 1 | **Ajan çalışma döngüsü** | Oturum içinde: gözlemle → düşün → araç çağır → doğrula → tekrar | Zaten var (her Claude Code oturumunda), ama otomatik doğrulama (CI) eksikti — **bu oturumda eklendi** (aşağıda) |
| 2 | **Zamanlanmış tekrar** | Bir görevi cron/schedule ile düzenli aralıklarla tekrar çalıştırmak | Loomen'de henüz yok — proje "Planlama (Faz 2)" aşamasında, henüz kod yazılmadığı için erken |
| 3 | **İnsan geri bildirim döngüsü** | Plan → onay → uygula → gerçek ortamda test → onayla/reddet | Loomen'de henüz informal (tek geliştirici, tek oturum akışı) — Datha'daki gibi ayrı bir "onay bekliyor" görsel takip sistemi yok çünkü Loomen'in henüz bir görev panosu (Datha'daki "DAT board" gibi) yok |
| 4 | **Geri bildirimin kalıcı kurala dönüşmesi** | Aynı düzeltme tekrar tekrar oluyorsa, kalıcı bir kurala (örn. `NOTE_SAFETY_RULES.md`) dönüştürmek | Loomen'de `NOTE_SAFETY_RULES.md` zaten var — bu mekanizmanın temeli mevcut, ama "hafızadaki tekrar eden feedback'i otomatik tespit et" adımı henüz kurulmadı |

## Bu oturumda Loomen'de somut olarak ne eklendi?

**CI kapısı** (`madde 1`in otomatik doğrulama kısmı): `.github/workflows/ci.yml` eklendi — `main`'e her push/PR'da otomatik olarak:
```
npm ci && npm run build   (tsc + vite build, typecheck dahil)
```
çalışır. Bu, projenin şu anki aşamasında (henüz kod yazılmaya yeni başlanmış) basit ama gerçek bir gate — derlenmeyen kod fark edilmeden ilerlemez. Eslint kurulu olmadığı için lint adımı eklenmedi (ayrı bir araç kararı, ileride istenirse eklenebilir).

**Not:** Bu workflow şu an main'e push'u **engellemiyor**, sadece GitHub'da yeşil/kırmızı gösteriyor. Gerçek bir "engelleme" (branch protection) istenirse ayrı bir onaylı adım olarak eklenebilir — Datha tarafında bunun için izlenen kademeli yaklaşım: önce CI'nin gerçekten yeşil çalıştığını görmek, sonra kilitlemek.

## Loomen'e özel: henüz eklenmeyenler (gelecek fikir olarak)

- **"Onay bekliyor" takibi:** Datha'da DathaMaster'ın Kanban panosuna yeni bir durum (`AWAITING_APPROVAL`) eklendi — bir işin "bitti" mi yoksa "kullanıcı testini mi bekliyor" ayrımını görünür kılmak için. Loomen'in henüz böyle bir pano/görev takip sistemi yok. İleride Loomen kendi görev takibini kurarsa (örn. bu `LoomenWiki` altında basit bir `gorevler.md` gibi), benzer bir "onay bekliyor" etiketi eklenebilir.
- **Zamanlanmış hatırlatma:** Datha'da `/devam` komutu her çalıştığında `ACTIVE_TASK.md`'deki unutulmuş "onay bekliyor" maddelerini otomatik tarayıp hatırlatıyor. Loomen'in henüz kendi `/devam`-benzeri bir oturum-devam komutu yok (proje planlama aşamasında olduğu için `/start-loomen` ile başlanıyor). İleride benzer bir tarama eklenmek istenirse, aynı mantık (belirli anahtar kelimeleri ara, kapanmamışsa öne çıkar) uygulanabilir.

## Neden bu şekilde kurgulandı?

Bulut tabanlı otomatik hatırlatma (zamanlanmış cloud ajanı) bilinçli olarak seçilmedi — çünkü hem proje dosyaları hem de geliştirme geçmişi tamamen yerel/local-first (Loomen'in kendi felsefesiyle de örtüşüyor: "tamamen lokal, sunucu/internet yok"). Yerel, altyapısız bir çözüm (CI dosyası + gelecekte eklenebilecek basit bir görev takibi) bu projenin doğasına daha uygun.
