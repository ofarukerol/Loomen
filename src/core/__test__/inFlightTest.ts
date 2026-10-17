// Süren yazma takibi: ikinci boşaltma, ilk yazma bitmeden başarılı dönmemeli (LOM-30).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { createInFlight } from "../vault/inFlight";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

function deferred() {
  let resolve!: (v: boolean) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<boolean>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Promise'in şu an bitip bitmediğini (ve sonucunu) öğren. */
function watch<T>(p: Promise<T>) {
  const s: { done: boolean; value?: T } = { done: false };
  void p.then((v) => {
    s.done = true;
    s.value = v;
  });
  return s;
}

{
  const f = createInFlight();
  check("hiç yazma yokken settle → true", await f.settle());
}

{
  // Kartın senaryosu: ilk boşaltmanın yazması sürüyor, ikinci boşaltmada bekleyen kayıt yok.
  const f = createInFlight();
  const w = deferred();
  void f.track(w.promise);
  const second = watch(f.settle());
  await tick();
  check("ilk yazma sürerken ikinci boşaltma bitmez", !second.done);
  w.resolve(false);
  await tick();
  check("ilk yazma bitince ikinci boşaltma da biter", second.done);
  check("ilk yazma başarısızsa ikinci boşaltma false döner", second.value === false);
  check("biten yazma takipten düşer", f.size === 0);
  check("sonraki boşaltma eski başarısızlığı taşımaz", await f.settle());
}

{
  const f = createInFlight();
  const a = deferred();
  const b = deferred();
  void f.track(a.promise);
  void f.track(b.promise);
  const s = watch(f.settle());
  a.resolve(true);
  await tick();
  check("iki yazmadan biri sürerken settle bitmez", !s.done);
  b.resolve(true);
  await tick();
  check("ikisi de başarılı → true", s.value === true);
}

{
  const f = createInFlight();
  const a = deferred();
  const tracked = f.track(a.promise);
  a.reject(new Error("os error 5"));
  check("hata fırlatan yazma false sayılır", (await tracked) === false);
  check("settle reddedilmez", (await f.settle()) === true);
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);
