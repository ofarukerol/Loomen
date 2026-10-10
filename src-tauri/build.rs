fn main() {
    // Google Play, Android 15+ için 16 KB bellek sayfası uyumunu şart koşuyor.
    // NDK 27 varsayılan olarak 4 KB hizalar; Tauri kendi RUSTFLAGS'ını kurduğundan
    // .cargo/config.toml işe yaramıyor, bayrağı bağlayıcıya buradan veriyoruz.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
