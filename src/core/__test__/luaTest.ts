// Lua tablo sabiti ayrıştırıcısının testi (LOM-94): kaçışlar, yorumlar, uzun dize, sayısal anahtar
// sırası, iç içe tablo, bozuk girdide hata.
import { LUA_MAX_DEPTH, LuaParseError, LuaTable, parseLua, parseLuaTable } from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function throwsParse(src: string): boolean {
  try {
    parseLua(src);
    return false;
  } catch (e) {
    return e instanceof LuaParseError;
  }
}
const T = (v: unknown) => v as LuaTable;

// ─── Basit değerler ───
check("dize", parseLua(`"abc"`) === "abc");
check("tek tırnak", parseLua(`'a"b'`) === 'a"b');
check("tamsayı", parseLua("42") === 42);
check("ondalık ve üs", parseLua("1.5") === 1.5 && parseLua("2e3") === 2000 && parseLua(".5") === 0.5 && parseLua("1E-2") === 0.01);
check("negatif", parseLua("-7") === -7 && parseLua("- 0.25") === -0.25);
check("onaltılık", parseLua("0x1F") === 31);
check("true/false/nil", parseLua("true") === true && parseLua("false") === false && parseLua("nil") === null);
check("sonsuz biçimleri", parseLua("math.huge") === Infinity && parseLua("-math.huge") === -Infinity && parseLua("1/0") === Infinity && Number.isNaN(parseLua("0/0") as number));

// ─── Kaçışlar ───
check("\\n \\t \\\\ \\\" kaçışları", parseLua(String.raw`"a\nb\tc\\d\"e\'f"`) === "a\nb\tc\\d\"e'f");
check("\\r \\a \\b \\f \\v", parseLua(String.raw`"\r\a\b\f\v"`) === "\r\x07\b\f\v");
check("ters bölü + satır sonu = satır sonu", parseLua('"ilk\\\nikinci"') === "ilk\nikinci");
check("ters bölü + CRLF tek satır sonu", parseLua('"ilk\\\r\nikinci"') === "ilk\nikinci");
check("\\ddd ondalık bayt", parseLua(String.raw`"\65\066\0067"`) === "AB\x067");
check("\\ddd UTF-8 baytları birleşir", parseLua(String.raw`"G\195\182z"`) === "Göz");
check("\\0 boş bayt", parseLua(String.raw`"a\0b"`) === "a\0b");
check("\\xXX", parseLua(String.raw`"\x41\xc3\xbc"`) === "Aü");
check("\\z boşluğu yutar", parseLua('"a\\z   \n  b"') === "ab");
check("\\u{...}", parseLua(String.raw`"\u{1F600}"`) === "😀");
check("Türkçe ham metin", parseLua(`"Şükrü ığdır ÇÖĞ"`) === "Şükrü ığdır ÇÖĞ");
check("geçersiz kaçış hata", throwsParse(String.raw`"\q"`));
check("\\256 hata", throwsParse(String.raw`"\256"`));
check("kapanmayan dize hata", throwsParse(`"abc`));
check("dizede kaçışsız satır sonu hata", throwsParse(`"a\nb"`));

// ─── Uzun dize ───
check("uzun dize", parseLua("[[a\\nb]]") === "a\\nb");
check("uzun dize baştaki satır sonu atlanır", parseLua("[[\nsatır1\nsatır2]]") === "satır1\nsatır2");
check("seviyeli uzun dize", parseLua("[==[ a ]] b ]=] ]==]") === " a ]] b ]=] ");
check("kapanmayan uzun dize hata", throwsParse("[==[ abc ]=]"));

// ─── Yorumlar ve return ───
const doc = `-- we can read Lua syntax here!
--[[ blok
yorum ]]
--[==[ seviyeli ]] blok ]==]
return { -- satır sonu yorumu
  ["a"] = 1, --[[ ara ]] b = 2;
}
-- son yorum
`;
const t1 = parseLua(doc);
check("yorumlar ve return atlanır", t1 instanceof LuaTable && T(t1).get("a") === 1 && T(t1).get("b") === 2);
check("BOM ve #! satırı", parseLua("﻿#!/usr/bin/lua\nreturn 5") === 5);
check("sonda ; olabilir", parseLua("return {};") instanceof LuaTable);
check("returned adı return değildir", throwsParse("returned"));

// ─── Tablolar ───
const t2 = T(parseLua(`{ "x", "y", [10] = "on", [3] = "üç", ["k"] = "v", n = 5, nil, "z", [2.5] = "kesir", [true] = "doğru", }`));
check("sıralı değerler 1'den", t2.get(1) === "x" && t2.get(2) === "y");
check("nil sırayı ilerletir, saklanmaz", !t2.map.has(3 as never) || t2.get(3) === "üç");
check("nil'den sonraki değer 4'te", t2.get(4) === "z");
check("dize ve ad anahtarları", t2.str("k") === "v" && t2.num("n") === 5);
check("kesirli ve mantıksal anahtar", t2.get(2.5) === "kesir" && t2.get(true) === "doğru");
check("sayısal girdiler anahtar sırasıyla", t2.numericEntries().map(([k]) => k).join(",") === "1,2,2.5,3,4,10");
check("list() sıralı değerler", (t2.list() as string[]).join(",") === "x,y,kesir,üç,z,on");
check("dize '1' ve sayı 1 ayrı", T(parseLua(`{ ["1"] = "s", [1] = "n" }`)).get("1") === "s" && T(parseLua(`{ ["1"] = "s", [1] = "n" }`)).get(1) === "n");
check("['a'] = nil saklanmaz", !T(parseLua(`{ a = 1, ["a"] = nil }`)).map.has("a"));
check("true değeri ad alanı sanılmaz", T(parseLua(`{ true, false }`)).get(1) === true && T(parseLua(`{ true, false }`)).get(2) === false);
check("== karşılaştırma alan değildir", throwsParse(`{ a == 1 }`));

const nested = T(parseLua(`return {
    ["annotations"] = {
        [1] = {
            ["pos0"] = { ["page"] = 12, ["x"] = 10.5, ["y"] = -3 },
            ["text"] = "Korku zihni öldürendir.\\
İkinci satır",
        },
    },
}`));
const ann = nested.table("annotations");
const a1 = ann?.table(1);
check("iç içe tablo", !!a1 && a1.table("pos0")?.num("page") === 12 && a1.table("pos0")?.num("y") === -3);
check("iç içe dize kaçışı", a1?.str("text") === "Korku zihni öldürendir.\nİkinci satır");
check("yanlış türde erişim undefined", nested.str("annotations") === undefined && nested.table("yok") === undefined && a1?.num("text") === undefined);
check("num() sonsuzu vermez", T(parseLua("{ a = math.huge }")).num("a") === undefined);

// ─── Bozuk girdiler ───
check("kapanmayan tablo hata", throwsParse("{ a = 1"));
check("virgülsüz alanlar hata", throwsParse("{ a = 1 b = 2 }"));
check("işlev çağrısı hata", throwsParse(`{ a = os.execute("rm") }`));
check("değişken hata", throwsParse("{ a = foo }"));
check("fazla içerik hata", throwsParse("return {} x"));
check("boş girdi hata", throwsParse("") && throwsParse("-- yalnız yorum"));
check("anahtarsız = hata", throwsParse("{ = 1 }"));
check("tablo anahtar olamaz", throwsParse("{ [{}] = 1 }"));
check("12abc sayı değildir", throwsParse("12abc"));
check("derinlik sınırı", throwsParse("{".repeat(LUA_MAX_DEPTH + 2) + "}".repeat(LUA_MAX_DEPTH + 2)));
check("sınır içindeki derinlik geçer", !throwsParse("{".repeat(50) + "}".repeat(50)));
check("parseLuaTable bozuk girdide null", parseLuaTable("{ a = ") === null && parseLuaTable("return 5") === null);
check("parseLuaTable tablo döner", parseLuaTable("return { 1 }")?.get(1) === 1);
{
  let msg = "";
  try {
    parseLua("{ a = ? }");
  } catch (e) {
    msg = e instanceof LuaParseError ? `${e.offset}` : "";
  }
  check("hata konum taşır", msg === "6", msg);
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nLua ayrıştırıcı: tüm kontroller geçti");
