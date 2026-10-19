// GitHub senkronunun ortak birleştirme mantığı (LOM-51). Saf Rust: ağ, git ya da disk yok;
// masaüstü (github_git.rs) ve mobil (github_api.rs) aynı kuralları buradan kullanır.
//
// Kurallar:
// 1. Metin notlar satır bazlı 3-yönlü birleşir (base = son senkronlanan sürüm). İki tarafın
//    ayrık değişiklikleri birlikte kalır.
// 2. Aynı base bölgesini iki taraf farklı değiştirdiyse (örtüşen parça) zaman damgası YENİ olan
//    taraf kazanır; kaybeden tarafın dosyası tam olarak yedek klasörüne yazılır (hiçbir şey silinmez).
// 3. İki taraf aynı yere satır EKLEDİYSE (ör. günlük notun sonu) bu değiştirme değil ekleme
//    çakışmasıdır: ikisi de korunur, eski tarafın satırları önce, yeni tarafınkiler sonra.
// 4. base yoksa/boşsa (dosya iki tarafta da yeni), ikili dosyada ve .excalidraw/.json gibi
//    satır birleştirmesi güvenli olmayan dosyalarda tüm dosya: yeni taraf kazanır, eski yedeklenir.
// 5. Dosyaya hiçbir zaman çakışma işareti yazılmaz. CRLF ve sondaki satır sonu korunur.

use std::collections::HashMap;

/// Yedeklerin kasa içindeki kökü (gizli klasör: not listesine girmez, ama senkronlanır).
pub const BACKUP_DIR: &str = ".loomen/cakisma-gecmisi";

/// Satır bazlı birleştirme için ayrılan en çok DP hücresi; aşılırsa tüm dosya kuralı uygulanır.
const MAX_DP_CELLS: usize = 9_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Local,
    Remote,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// İki taraf özdeş.
    Identical,
    /// Satır bazlı birleşti (en az bir taraf diğerinin değişikliğini aldı).
    LineMerged,
    /// Tüm dosya: kazanan taraf (yeni olan) aldı.
    WholeFile(Side),
}

#[derive(Debug, PartialEq)]
pub struct Resolution {
    pub content: Vec<u8>,
    /// Kaybeden tarafın TAM dosyası; yalnız bir metin parçası/dosya gerçekten düştüyse dolu.
    pub backup: Option<Vec<u8>>,
    pub mode: Mode,
}

/// Hangi taraf daha yeni? Eşitlikte yerel (kullanıcının elindeki dosya) kazanır.
pub fn newer_side(local_time: i64, remote_time: i64) -> Side {
    if remote_time > local_time {
        Side::Remote
    } else {
        Side::Local
    }
}

pub fn line_mergeable_path(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    match name.rfind('.') {
        Some(i) if i > 0 => {
            let ext = name[i + 1..].to_lowercase();
            matches!(
                ext.as_str(),
                "md" | "markdown" | "txt" | "text" | "csv" | "tsv" | "log" | "org" | "rst"
                    | "yml" | "yaml" | "toml" | "ini" | "tex"
            )
        }
        _ => true, // uzantısız dosya: içerik metinse satır bazlı
    }
}

fn is_text(bytes: &[u8]) -> bool {
    !bytes.contains(&0) && std::str::from_utf8(bytes).is_ok()
}

/// Tek dosyanın iki sürümünü birleştirir. `base` = son senkronlanan sürüm (yoksa None).
pub fn merge_file(
    path: &str,
    base: Option<&[u8]>,
    local: &[u8],
    remote: &[u8],
    local_time: i64,
    remote_time: i64,
) -> Resolution {
    if local == remote {
        return Resolution { content: local.to_vec(), backup: None, mode: Mode::Identical };
    }
    let winner = newer_side(local_time, remote_time);
    let whole = |winner: Side| {
        let (win, lose) = if winner == Side::Local { (local, remote) } else { (remote, local) };
        Resolution { content: win.to_vec(), backup: Some(lose.to_vec()), mode: Mode::WholeFile(winner) }
    };
    let Some(base) = base.filter(|b| !b.is_empty()) else { return whole(winner) };
    if !line_mergeable_path(path) || !is_text(base) || !is_text(local) || !is_text(remote) {
        return whole(winner);
    }
    // Yalnız bir taraf değişmişse çakışma yok (çağıran normalde buraya gelmez).
    if base == local {
        return Resolution { content: remote.to_vec(), backup: None, mode: Mode::LineMerged };
    }
    if base == remote {
        return Resolution { content: local.to_vec(), backup: None, mode: Mode::LineMerged };
    }
    // utf8 olduğu yukarıda doğrulandı.
    let (b, l, r) = (
        std::str::from_utf8(base).unwrap(),
        std::str::from_utf8(local).unwrap(),
        std::str::from_utf8(remote).unwrap(),
    );
    match merge_text(b, l, r, winner) {
        Some((text, lost)) => {
            let loser = if winner == Side::Local { remote } else { local };
            Resolution {
                content: text.into_bytes(),
                backup: if lost { Some(loser.to_vec()) } else { None },
                mode: Mode::LineMerged,
            }
        }
        None => whole(winner),
    }
}

/// Sonu "\n" ile bitmeyen metne "\n" ekler; (metin, orijinalde sonda satır sonu var mıydı).
fn normalize(s: &str) -> (String, bool) {
    if s.is_empty() || s.ends_with('\n') {
        (s.to_string(), true)
    } else {
        (format!("{s}\n"), false)
    }
}

/// (birleşmiş metin, bir taraftan metin düştü mü). None = dosya çok büyük, satır birleştirmesi yapılamaz.
fn merge_text(base: &str, local: &str, remote: &str, winner: Side) -> Option<(String, bool)> {
    let (nb, fb) = normalize(base);
    let (nl, fl) = normalize(local);
    let (nr, fr) = normalize(remote);
    // Sondaki satır sonu bayrağı: yerel/uzak ayrışıyorsa base'ten farklı olan değişikliği taşır.
    let final_nl = if fl == fr {
        fl
    } else if fl == fb {
        fr
    } else {
        fl
    };

    let mut ids: HashMap<String, u32> = HashMap::new();
    let tb: Vec<&str> = nb.split_inclusive('\n').collect();
    let tl: Vec<&str> = nl.split_inclusive('\n').collect();
    let tr: Vec<&str> = nr.split_inclusive('\n').collect();
    let mut intern = |toks: &[&str]| -> Vec<u32> {
        toks.iter()
            .map(|s| match ids.get(*s) {
                Some(n) => *n,
                None => {
                    let n = ids.len() as u32;
                    ids.insert(s.to_string(), n);
                    n
                }
            })
            .collect()
    };
    let ib = intern(&tb);
    let il = intern(&tl);
    let ir = intern(&tr);

    let ma = lcs_matches(&ib, &il)?;
    let mb = lcs_matches(&ib, &ir)?;

    let mut out = String::with_capacity(nl.len() + nr.len());
    let mut lost = false;
    let (mut b0, mut l0, mut r0) = (0usize, 0usize, 0usize);
    let region = |b: (usize, usize), l: (usize, usize), r: (usize, usize), out: &mut String, lost: &mut bool| {
        let (bs, ls, rs) = (&ib[b.0..b.1], &il[l.0..l.1], &ir[r.0..r.1]);
        if ls == bs {
            out.extend(tr[r.0..r.1].iter().copied());
        } else if rs == bs || ls == rs {
            out.extend(tl[l.0..l.1].iter().copied());
        } else if bs.is_empty() {
            // İki taraf aynı yere farklı satır ekledi: ikisi de kalır, eski olan önce.
            if winner == Side::Local {
                out.extend(tr[r.0..r.1].iter().copied());
                out.extend(tl[l.0..l.1].iter().copied());
            } else {
                out.extend(tl[l.0..l.1].iter().copied());
                out.extend(tr[r.0..r.1].iter().copied());
            }
        } else {
            // Örtüşen parça: yeni taraf kazanır, kaybedenin metni yedeğe gider.
            *lost = true;
            if winner == Side::Local {
                out.extend(tl[l.0..l.1].iter().copied());
            } else {
                out.extend(tr[r.0..r.1].iter().copied());
            }
        }
    };
    for i in 0..tb.len() {
        if let (Some(l), Some(r)) = (ma[i], mb[i]) {
            region((b0, i), (l0, l), (r0, r), &mut out, &mut lost);
            out.push_str(tb[i]);
            b0 = i + 1;
            l0 = l + 1;
            r0 = r + 1;
        }
    }
    region((b0, tb.len()), (l0, tl.len()), (r0, tr.len()), &mut out, &mut lost);

    let mut text = out;
    if !final_nl && text.ends_with('\n') {
        text.pop();
    }
    Some((text, lost))
}

/// a'nın her satırı için b'deki eşleşen (LCS) satır; ortak baş/son atılır, ortası DP ile.
fn lcs_matches(a: &[u32], b: &[u32]) -> Option<Vec<Option<usize>>> {
    let mut m = vec![None; a.len()];
    let mut pre = 0;
    while pre < a.len() && pre < b.len() && a[pre] == b[pre] {
        m[pre] = Some(pre);
        pre += 1;
    }
    let mut suf = 0;
    while suf < a.len() - pre && suf < b.len() - pre && a[a.len() - 1 - suf] == b[b.len() - 1 - suf] {
        m[a.len() - 1 - suf] = Some(b.len() - 1 - suf);
        suf += 1;
    }
    let (am, bm) = (&a[pre..a.len() - suf], &b[pre..b.len() - suf]);
    let (n, k) = (am.len(), bm.len());
    if n == 0 || k == 0 {
        return Some(m);
    }
    if (n + 1).checked_mul(k + 1)? > MAX_DP_CELLS {
        return None;
    }
    // t[i][j] = am[i..] ile bm[j..] arasındaki LCS uzunluğu (min(n,k) <= 3000 → u16 yeter).
    let w = k + 1;
    let mut t = vec![0u16; (n + 1) * w];
    for i in (0..n).rev() {
        for j in (0..k).rev() {
            t[i * w + j] = if am[i] == bm[j] {
                t[(i + 1) * w + j + 1] + 1
            } else {
                t[(i + 1) * w + j].max(t[i * w + j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < n && j < k {
        if am[i] == bm[j] {
            m[pre + i] = Some(pre + j);
            i += 1;
            j += 1;
        } else if t[(i + 1) * w + j] >= t[i * w + j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
    Some(m)
}

// ---------- Zaman yardımcıları (bağımlılıksız) ----------

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = (if m > 2 { m - 3 } else { m + 9 }) as i64;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Epoch saniyesi → "YYYY-MM-DD_HHMMSS" (UTC).
pub fn format_stamp(epoch: i64) -> String {
    let (days, secs) = (epoch.div_euclid(86_400), epoch.rem_euclid(86_400));
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}_{:02}{:02}{:02}", secs / 3600, secs % 3600 / 60, secs % 60)
}

/// "2026-10-19T10:20:30Z" (GitHub API) → epoch saniyesi. Saat dilimi farkı (+03:00) işlenir.
pub fn parse_iso8601(s: &str) -> Option<i64> {
    let (date, rest) = s.split_once('T')?;
    let mut dp = date.split('-');
    let (y, mo, d): (i64, u32, u32) = (dp.next()?.parse().ok()?, dp.next()?.parse().ok()?, dp.next()?.parse().ok()?);
    let (time, off) = if let Some(t) = rest.strip_suffix('Z') {
        (t, 0i64)
    } else if let Some(i) = rest.rfind(['+', '-']) {
        let (t, o) = rest.split_at(i);
        let sign = if o.starts_with('-') { -1 } else { 1 };
        let (oh, om) = o[1..].split_once(':')?;
        (t, sign * (oh.parse::<i64>().ok()? * 3600 + om.parse::<i64>().ok()? * 60))
    } else {
        return None;
    };
    let mut tp = time.split(':');
    let (h, mi): (i64, i64) = (tp.next()?.parse().ok()?, tp.next()?.parse().ok()?);
    let sec: i64 = tp.next()?.split('.').next()?.parse().ok()?;
    Some(days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + sec - off)
}

/// Yedek dosyasının kasa içi yolu: ".loomen/cakisma-gecmisi/<damga>/<özgün yol>".
/// `taken` doluysa damganın sonuna -2, -3... eklenir (aynı saniyede tekrar senkron).
pub fn backup_path(stamp: &str, rel: &str, taken: impl Fn(&str) -> bool) -> String {
    for i in 1.. {
        let st = if i == 1 { stamp.to_string() } else { format!("{stamp}-{i}") };
        let cand = format!("{BACKUP_DIR}/{st}/{rel}");
        if !taken(&cand) {
            return cand;
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OLD: i64 = 1_000;
    const NEW: i64 = 2_000;

    fn mf(base: &str, local: &str, remote: &str, lt: i64, rt: i64) -> Resolution {
        merge_file("Not.md", Some(base.as_bytes()), local.as_bytes(), remote.as_bytes(), lt, rt)
    }
    fn txt(r: &Resolution) -> String {
        String::from_utf8(r.content.clone()).unwrap()
    }

    #[test]
    fn ayrik_satir_degisiklikleri_ikisi_de_kalir() {
        let r = mf("1\n2\n3\n4\n5\n6\n", "1 yerel\n2\n3\n4\n5\n6\n", "1\n2\n3\n4\n5\n6 uzak\n", OLD, NEW);
        assert_eq!(txt(&r), "1 yerel\n2\n3\n4\n5\n6 uzak\n");
        assert!(r.backup.is_none());
        assert_eq!(r.mode, Mode::LineMerged);
    }

    #[test]
    fn ayni_satir_yeni_taraf_kazanir_kaybeden_yedeklenir() {
        let base = "a\nb\nc\n";
        let (l, r) = ("a\nb yerel\nc\n", "a\nb uzak\nc\n");
        let uzak_yeni = mf(base, l, r, OLD, NEW);
        assert_eq!(txt(&uzak_yeni), r);
        assert_eq!(uzak_yeni.backup.as_deref(), Some(l.as_bytes()));
        let yerel_yeni = mf(base, l, r, NEW, OLD);
        assert_eq!(txt(&yerel_yeni), l);
        assert_eq!(yerel_yeni.backup.as_deref(), Some(r.as_bytes()));
    }

    #[test]
    fn ayni_satir_degisip_baska_yerde_ayrik_degisiklik_de_alinir() {
        let base = "a\nb\nc\nd\ne\n";
        let r = mf(base, "a\nb yerel\nc\nd\ne\n", "a\nb uzak\nc\nd\ne uzak\n", OLD, NEW);
        assert_eq!(txt(&r), "a\nb uzak\nc\nd\ne uzak\n");
        assert_eq!(r.backup.as_deref(), Some("a\nb yerel\nc\nd\ne\n".as_bytes()));
    }

    #[test]
    fn iki_taraf_sona_ekledi_ikisi_de_kalir_eski_once() {
        let base = "- [ ] a\n";
        let (l, r) = ("- [ ] a\n- [ ] yerel\n", "- [ ] a\n- [ ] uzak\n");
        let uzak_yeni = mf(base, l, r, OLD, NEW);
        assert_eq!(txt(&uzak_yeni), "- [ ] a\n- [ ] yerel\n- [ ] uzak\n");
        assert!(uzak_yeni.backup.is_none(), "ekleme çakışmasında hiçbir şey düşmez");
        let yerel_yeni = mf(base, l, r, NEW, OLD);
        assert_eq!(txt(&yerel_yeni), "- [ ] a\n- [ ] uzak\n- [ ] yerel\n");
        assert!(yerel_yeni.backup.is_none());
    }

    #[test]
    fn sonda_satir_sonu_yoksa_da_ekleme_birlesir() {
        let r = mf("a\nb", "a\nb\nyerel", "a\nb\nuzak", OLD, NEW);
        assert_eq!(txt(&r), "a\nb\nyerel\nuzak");
        assert!(r.backup.is_none());
    }

    #[test]
    fn ortaya_ayni_yere_ekleme_ikisi_de_kalir() {
        let r = mf("a\nc\n", "a\nx\nc\n", "a\ny\nc\n", OLD, NEW);
        assert_eq!(txt(&r), "a\nx\ny\nc\n");
        assert!(r.backup.is_none());
    }

    #[test]
    fn ayni_degisiklik_cakisma_degil() {
        let r = mf("a\nb\n", "a\nB\n", "a\nB\n", OLD, NEW);
        assert_eq!(r.mode, Mode::Identical);
        assert!(r.backup.is_none());
        // Aynı satırı iki taraf aynı yapıp başka yerlerde ayrıldıysa da düşmez.
        let r = mf("a\nx\nb\nx\nc\n", "A\nx\nB\nx\nc\n", "a\nx\nB\nx\nC\n", OLD, NEW);
        assert_eq!(txt(&r), "A\nx\nB\nx\nC\n");
        assert!(r.backup.is_none());
    }

    #[test]
    fn crlf_korunur() {
        let r = mf("a\r\nb\r\nc\r\nd\r\n", "a\r\nb yerel\r\nc\r\nd\r\n", "a\r\nb\r\nc\r\nd uzak\r\n", OLD, NEW);
        assert_eq!(txt(&r), "a\r\nb yerel\r\nc\r\nd uzak\r\n");
    }

    #[test]
    fn sondaki_satir_sonu_korunur() {
        // Yerel sonuna satır sonu eklemiş, uzak başka satırı değiştirmiş.
        let r = mf("a\nb", "a\nb\n", "a uzak\nb", OLD, NEW);
        assert_eq!(txt(&r), "a uzak\nb\n");
        // İkisi de sonda satır sonu olmadan bitiyor.
        let r = mf("a\nb\nc", "a yerel\nb\nc", "a\nb\nc uzak", OLD, NEW);
        assert_eq!(txt(&r), "a yerel\nb\nc uzak");
    }

    #[test]
    fn base_yoksa_ya_da_bossa_tum_dosya_yeni_kazanir() {
        let r = merge_file("N.md", None, b"yerel\n", b"uzak\n", OLD, NEW);
        assert_eq!(r.content, b"uzak\n");
        assert_eq!(r.backup.as_deref(), Some(&b"yerel\n"[..]));
        assert_eq!(r.mode, Mode::WholeFile(Side::Remote));
        let r = merge_file("N.md", Some(b""), b"yerel\n", b"uzak\n", NEW, OLD);
        assert_eq!(r.content, b"yerel\n");
        assert_eq!(r.backup.as_deref(), Some(&b"uzak\n"[..]));
    }

    #[test]
    fn ikili_ve_excalidraw_tum_dosya() {
        let r = merge_file("r.png", Some(&[0, 1, 2]), &[0, 1, 3], &[0, 1, 4], OLD, NEW);
        assert_eq!(r.content, vec![0, 1, 4]);
        assert_eq!(r.backup, Some(vec![0, 1, 3]));
        let r = merge_file("Çizim.excalidraw", Some(b"{\n\"a\":1\n}\n"), b"{\n\"a\":2\n}\n", b"{\n\"a\":1,\n\"b\":2\n}\n", NEW, OLD);
        assert_eq!(r.content, b"{\n\"a\":2\n}\n");
        assert!(r.backup.is_some());
        assert_eq!(r.mode, Mode::WholeFile(Side::Local));
        // UTF-8 olmayan "metin" dosyası da satır birleşmez.
        let r = merge_file("x.md", Some(&[0xff, b'\n']), &[0xff, b'a', b'\n'], &[0xff, b'b', b'\n'], OLD, NEW);
        assert!(matches!(r.mode, Mode::WholeFile(_)));
    }

    #[test]
    fn eslik_esitse_yerel_kazanir() {
        assert_eq!(newer_side(5, 5), Side::Local);
        assert_eq!(newer_side(5, 6), Side::Remote);
    }

    #[test]
    fn buyuk_dosyada_satir_birlestirme_yerine_tum_dosya() {
        let big: String = (0..4000).map(|i| format!("satir {i}\n")).collect();
        let l: String = (0..4000).map(|i| format!("yerel {i}\n")).collect();
        let r: String = (0..4000).map(|i| format!("uzak {i}\n")).collect();
        let res = mf(&big, &l, &r, OLD, NEW);
        assert_eq!(res.mode, Mode::WholeFile(Side::Remote));
        assert_eq!(res.backup.as_deref(), Some(l.as_bytes()));
    }

    #[test]
    fn uzun_dosyada_ayrik_degisiklikler_birlesir() {
        let base: String = (0..500).map(|i| format!("satir {i}\n")).collect();
        let l = base.replace("satir 10\n", "satir 10 yerel\n");
        let r = base.replace("satir 400\n", "satir 400 uzak\n");
        let res = mf(&base, &l, &r, OLD, NEW);
        let t = txt(&res);
        assert!(t.contains("satir 10 yerel\n") && t.contains("satir 400 uzak\n"));
        assert!(res.backup.is_none());
    }

    #[test]
    fn silme_ile_baska_yerde_degisiklik() {
        let r = mf("a\nb\nc\nd\n", "a\nc\nd\n", "a\nb\nc\nD\n", OLD, NEW);
        assert_eq!(txt(&r), "a\nc\nD\n");
        assert!(r.backup.is_none());
    }

    #[test]
    fn zaman_bicimi_ve_ayristirma() {
        assert_eq!(format_stamp(0), "1970-01-01_000000");
        assert_eq!(format_stamp(1_760_868_030), "2025-10-19_100030");
        assert_eq!(parse_iso8601("2025-10-19T10:00:30Z"), Some(1_760_868_030));
        assert_eq!(parse_iso8601("2025-10-19T13:00:30+03:00"), Some(1_760_868_030));
        assert_eq!(parse_iso8601("2025-10-19T10:00:30.123Z"), Some(1_760_868_030));
        assert_eq!(parse_iso8601("saçma"), None);
        assert_eq!(format_stamp(parse_iso8601("2024-02-29T23:59:59Z").unwrap()), "2024-02-29_235959");
    }

    #[test]
    fn yedek_yolu_benzersiz() {
        assert_eq!(backup_path("S", "A/N.md", |_| false), ".loomen/cakisma-gecmisi/S/A/N.md");
        let var = [".loomen/cakisma-gecmisi/S/A/N.md"];
        assert_eq!(backup_path("S", "A/N.md", |c| var.contains(&c)), ".loomen/cakisma-gecmisi/S-2/A/N.md");
    }
}
