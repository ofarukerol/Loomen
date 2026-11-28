// Kasa başına GitHub senkron temeli (LOM-114). `npm test` bu dosyayı scripts/run-tests.mjs'ten alır.

import { getVaultBase, withVaultBase, type VaultBaseFields } from "../sync/vaultBase";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const REPO = "o/r";
const A = "/vaults/A";
const B = "/vaults/B";
const fresh = (): VaultBaseFields[] => [{ path: A }, { path: B }];

// Senaryo: A ve B aynı depoda; A senkron olup C1'i kaydeder, B'ye geçilince C1 taşınmamalı.
let v = fresh();
v = withVaultBase(v, A, REPO, "C1");
check("A kendi temelini okur", getVaultBase(v, A, REPO) === "C1");
check("B, A'nın temelini görmez (LOM-114)", getVaultBase(v, B, REPO) === null);
v = withVaultBase(v, B, REPO, "C2");
check("B yazımı A'yı bozmaz", getVaultBase(v, A, REPO) === "C1" && getVaultBase(v, B, REPO) === "C2");
check("yazım girdiyi değiştirmez", fresh()[0].baseSha === undefined);

check("temel başka depoya aitse yok sayılır", getVaultBase(v, A, "o/baska") === null);
check("depo yoksa temel yok", getVaultBase(v, A, null) === null);
check("kasa yoksa temel yok", getVaultBase(v, null, REPO) === null);
check("listede olmayan kasa temelsiz", getVaultBase(v, "/yok", REPO) === null);
check("eski kayıt (alan yok) temelsiz", getVaultBase([{ path: A }], A, REPO) === null);

const cleared = withVaultBase(v, A, null, null);
check("sıfırlama yalnız o kasayı siler", getVaultBase(cleared, A, REPO) === null && getVaultBase(cleared, B, REPO) === "C2");
check("sha null → repo da temizlenir", cleared[0].baseRepo === null);
check("repo null ile sha yazılmaz", getVaultBase(withVaultBase(fresh(), A, null, "C9"), A, REPO) === null);

console.log(`\n${ran - fails}/${ran} geçti`);
if (fails > 0) process.exit(1);
