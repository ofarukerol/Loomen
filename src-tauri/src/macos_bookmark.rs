//! macOS security-scoped bookmark desteği (Mac App Store / sandbox için).
//!
//! # Neden gerekli
//! Sandbox'ta uygulama diske serbestçe erişemez. Kullanıcı dosya seçiciyle bir klasör
//! seçtiğinde sandbox o klasöre erişimi **yalnızca o oturum için** verir. Uygulama kapanıp
//! açılınca erişim kaybolur. Kalıcı erişim için macOS "security-scoped bookmark" kullanır:
//! seçim anında klasör için bir anahtar üretilir, açılışta o anahtarla erişim geri alınır.
//!
//! Tauri'de yerleşik desteği yoktur (tauri-apps/tauri#3716), bu yüzden NSURL API'leri
//! objc2 ile doğrudan çağrılır.
//!
//! # Kaynak sızıntısı uyarısı
//! `startAccessingSecurityScopedResource` çağrılıp `stop...` çağrılmazsa çekirdek kaynağı
//! sızar ve uygulama sandbox dışına erişimini tamamen kaybeder. Bu yüzden başlatılan her
//! erişim [`ACTIVE`] kaydında tutulur; aynı yol iki kez başlatılmaz ve kasa değişiminde /
//! kapanışta serbest bırakılır.

use std::collections::HashMap;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD, Engine};
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_foundation::{NSData, NSString, NSURL};
use serde::Serialize;

/// Erişimi açılmış klasörler: yol → NSURL (stop çağrısı aynı örnek üzerinden yapılmalı).
///
/// `Retained<NSURL>` Send değildir; ancak burada yalnızca ObjC mesajı gönderiyoruz
/// (NSURL bu kullanım için iş parçacığı güvenlidir) ve işaretçiyi asla veriye çevirmiyoruz.
struct SendUrl(Retained<NSURL>);
unsafe impl Send for SendUrl {}

static ACTIVE: Mutex<Option<HashMap<String, SendUrl>>> = Mutex::new(None);

fn active_lock() -> std::sync::MutexGuard<'static, Option<HashMap<String, SendUrl>>> {
    let mut g = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
    if g.is_none() {
        *g = Some(HashMap::new());
    }
    g
}

/// Bookmark çözümünün sonucu.
#[derive(Serialize)]
pub struct Resolved {
    /// Klasörün diskteki güncel yolu (kullanıcı taşımış olabilir).
    pub path: String,
    /// Bookmark eskimişse true — çağıran taraf yenisini üretip saklamalıdır.
    pub stale: bool,
}

/// Verilen klasör için security-scoped bookmark üretir (base64 döner).
///
/// Kullanıcı klasörü dosya seçiciyle seçtikten hemen sonra çağrılmalıdır; o an erişim
/// vardır ve bookmark üretilebilir.
pub fn bookmark_create(path: String) -> Result<String, String> {
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
    // NSURLBookmarkCreationWithSecurityScope = 1 << 11
    let data: Retained<NSData> = url
        .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
            objc2_foundation::NSURLBookmarkCreationOptions(1 << 11),
            None,
            None,
        )
        .map_err(|e| format!("bookmark-create: {e}"))?;
    Ok(STANDARD.encode(unsafe { data.as_bytes_unchecked() }))
}

/// Bookmark'ı çözer ve klasöre erişimi **başlatır**.
///
/// Uygulama açılışında ve kasa değiştirilirken çağrılır. Aynı yol için ikinci kez
/// çağrılırsa erişim yeniden başlatılmaz (sızıntı önlemi).
pub fn bookmark_resolve(data: String) -> Result<Resolved, String> {
    let raw = STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("bookmark-decode: {e}"))?;
    let ns_data = NSData::with_bytes(&raw);

    let mut stale = Bool::NO;
    // NSURLBookmarkResolutionWithSecurityScope = 1 << 10
    let url: Retained<NSURL> = unsafe {
        NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
            &ns_data,
            objc2_foundation::NSURLBookmarkResolutionOptions(1 << 10),
            None,
            &mut stale,
        )
    }
    .map_err(|e| format!("bookmark-resolve: {e}"))?;

    let path = url.path()
        .ok_or("bookmark-resolve: yol okunamadı")?
        .to_string();

    let mut guard = active_lock();
    let map = guard.as_mut().expect("ACTIVE");
    if !map.contains_key(&path) {
        // Sandbox DIŞI derlemelerde (Developer ID ile dağıtım) bu çağrı false döner çünkü
        // güvenlik kapsamına gerek yoktur — erişim zaten vardır. Bu yüzden false HATA DEĞİLDİR;
        // yalnızca kayda alınmaz (bırakılacak bir şey yoktur).
        if unsafe { url.startAccessingSecurityScopedResource() } {
            map.insert(path.clone(), SendUrl(url));
        }
    }

    Ok(Resolved {
        path,
        stale: stale.as_bool(),
    })
}

/// Klasöre erişimi bırakır. Kasa değiştirilirken ve uygulama kapanırken çağrılmalıdır.
pub fn bookmark_release(path: String) -> Result<(), String> {
    let mut guard = active_lock();
    if let Some(SendUrl(url)) = guard.as_mut().expect("ACTIVE").remove(&path) {
        unsafe { url.stopAccessingSecurityScopedResource() };
    }
    Ok(())
}

/// Açık olan tüm erişimleri bırakır (uygulama kapanışı).
pub fn release_all() {
    let mut guard = active_lock();
    if let Some(map) = guard.as_mut() {
        for (_, SendUrl(url)) in map.drain() {
            unsafe { url.stopAccessingSecurityScopedResource() };
        }
    }
}
