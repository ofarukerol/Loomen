// Süren yazmaların takibi (LOM-30).
//
// Bir boşaltma (flush) yalnız kendi başlattığı yazmayı beklerse, önceki boşaltmanın hâlâ
// süren yazması görünmez olur: ikinci çağrı "bekleyen yok" deyip hemen başarılı döner,
// kasa değişimi ya da kapanış o yazma bitmeden ilerler. Bu takipçi başlamış bütün yazmaları
// tutar; `settle` hepsi bitene kadar bekler ve biri bile başarısızsa false döner.
// Saf modül: node testinde koşar (bkz __test__/inFlightTest.ts).

export interface InFlight {
  /** Yazmayı başlatır ve takibe alır; sonucu aynen döner. */
  track(write: Promise<boolean>): Promise<boolean>;
  /** Şu an süren bütün yazmalar bitene kadar bekler; hepsi başarılıysa true. */
  settle(): Promise<boolean>;
  /** Süren yazma sayısı. */
  readonly size: number;
}

export function createInFlight(): InFlight {
  const running = new Set<Promise<boolean>>();
  return {
    track(write) {
      // Hata fırlatan yazma başarısız sayılır; settle hiçbir zaman reddedilmez.
      const w = write.catch(() => false);
      running.add(w);
      void w.then(() => running.delete(w));
      return w;
    },
    async settle() {
      const results = await Promise.all([...running]);
      return results.every(Boolean);
    },
    get size() {
      return running.size;
    },
  };
}
