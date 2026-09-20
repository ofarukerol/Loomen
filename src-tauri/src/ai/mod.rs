//! AI asistanı — sağlayıcı köprüsü, anahtar deposu ve (sonraki fazlarda) yerel gömme/STT.
//!
//! Modül **tamamen opsiyoneldir**: kullanıcı ayarlardan açmadıkça buradaki hiçbir kod ağa
//! çıkmaz, model indirmez, dosya yazmaz. Uygulamanın çekirdek işlevleri (not, planlayıcı,
//! Pomodoro) bu modülden bağımsız çalışmaya devam eder.

pub mod keys;
pub mod llm;
pub mod stt;
