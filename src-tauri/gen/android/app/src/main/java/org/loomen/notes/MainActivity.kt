package org.loomen.notes

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

// ELLE DUZENLENIR, depoda izlenir (.gitignore istisnasi). `tauri android init`
// bu dosyayi yeniden uretirse asagidaki Paylas alimi kaybolur; geri al.
//
// Paylas menusu (LOM-96): baska uygulamadan gelen ACTION_SEND text/plain istegi
// deep-link eklentisinin tanidigi bir ACTION_VIEW istegine cevrilir:
//   loomen://share?text=<metin>&subject=<konu>&app=<gonderen paket>
// Eklenti (tauri-plugin-deep-link 2.6, DeepLinkPlugin.kt) soguk acilista
// load() icinde `activity.intent`i, acikken gelende onNewIntent(intent)'i okur.
// Bu yuzden onCreate'te super'den ONCE setIntent, onNewIntent'te super'e
// cevrilmis istek verilir. Yeni istekte ek (extras) yok: WryActivity kimligi
// extras'tan okudugu icin ek tasimak kimligi 0 yapardi.
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    shareToView(intent)?.let { setIntent(it) }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    val next = shareToView(intent) ?: intent
    setIntent(next)
    super.onNewIntent(next)
  }

  private fun shareToView(source: Intent?): Intent? {
    if (source == null || source.action != Intent.ACTION_SEND) return null
    val type = source.type ?: return null
    if (!type.startsWith("text/")) return null
    val text = source.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()
    if (text.isNullOrEmpty()) return null
    val builder = Uri.Builder().scheme("loomen").authority("share")
      .appendQueryParameter("text", text)
    val subject = source.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()
    if (!subject.isNullOrEmpty()) builder.appendQueryParameter("subject", subject)
    val app = try { referrer?.host } catch (_: Exception) { null }
    if (!app.isNullOrEmpty()) builder.appendQueryParameter("app", app)
    return Intent(Intent.ACTION_VIEW, builder.build())
  }
}
