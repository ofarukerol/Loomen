// Örnek kasa verisi — prototipteki state'ten alındı.
// İleride bu, vault'taki .md dosyalarından parse edilen görevlerle değiştirilecek (bkz docs 03 §3).

export type GroupKind = "today" | "overdue" | "upcoming";

export interface Task {
  id: string;
  text: string;
  done: boolean;
  overdue: boolean;
  /** Göreli tarih etiketi — şimdilik sabit; ileride date-fns ile hesaplanacak. */
  rel: string;
  /** Görevin geldiği kaynak not. */
  source: string;
  /** #etiket / 🎯 */
  tag: string;
  /** Tamamlanan Pomodoro turu (Karar A: satıra 🍅×N yazılır). */
  pomos: number;
}

export interface TaskGroup {
  id: string;
  label: string;
  /** Grup rozeti metni: Bugün / Geciken / Yaklaşan */
  sub: string;
  kind: GroupKind;
  tasks: Task[];
}

export const sampleGroups: TaskGroup[] = [
  {
    id: "g13",
    label: "Cumartesi, 13 Haz",
    sub: "Bugün",
    kind: "today",
    tasks: [
      { id: "t1", text: "Tasarımı bitir", done: false, overdue: false, rel: "bugün", source: "2026-06-13-Cumartesi", tag: "Yapılacaklar", pomos: 3 },
      { id: "t2", text: "Toplantı notlarını yaz", done: false, overdue: false, rel: "bugün", source: "Proje X", tag: "İş", pomos: 1 },
      { id: "t3", text: "Spor salonu üyeliğini yenile", done: false, overdue: false, rel: "bugün", source: "2026-06-10-Salı", tag: "Kişisel", pomos: 0 },
    ],
  },
  {
    id: "g12",
    label: "Cuma, 12 Haz",
    sub: "Geciken",
    kind: "overdue",
    tasks: [
      { id: "t4", text: "Kredi kartı ekstresi · 2.450,00 ₺", done: false, overdue: true, rel: "bir gün önce", source: "2026-06-12-Cuma", tag: "Ödemeler", pomos: 0 },
      { id: "t5", text: "Elektrik faturası öde · 640,00 ₺", done: true, overdue: true, rel: "bir gün önce", source: "2026-06-12-Cuma", tag: "Ödemeler", pomos: 0 },
    ],
  },
  {
    id: "g08",
    label: "Pazartesi, 8 Haz",
    sub: "Geciken",
    kind: "overdue",
    tasks: [
      { id: "t6", text: "Su faturası · 280,00 ₺", done: false, overdue: true, rel: "5 gün önce", source: "2026-06-08-Pazartesi", tag: "Ödemeler", pomos: 0 },
      { id: "t7", text: "Ekibe dönüş yap", done: true, overdue: true, rel: "5 gün önce", source: "Toplantı Notları", tag: "İş", pomos: 0 },
    ],
  },
  {
    id: "g14",
    label: "Pazar, 14 Haz",
    sub: "Yaklaşan",
    kind: "upcoming",
    tasks: [
      { id: "t8", text: "Ders notlarını gözden geçir", done: false, overdue: false, rel: "bir gün sonra", source: "Fikirler", tag: "Okul", pomos: 0 },
    ],
  },
  {
    id: "g19",
    label: "Cuma, 19 Haz",
    sub: "Yaklaşan",
    kind: "upcoming",
    tasks: [
      { id: "t9", text: "Kira ödemesi · 12.000 ₺", done: false, overdue: false, rel: "6 gün sonra", source: "2026-06-19-Cuma", tag: "Ödemeler", pomos: 0 },
    ],
  },
  {
    id: "g11t",
    label: "Cumartesi, 11 Tem",
    sub: "Yaklaşan",
    kind: "upcoming",
    tasks: [
      { id: "t10", text: "Sunum hazırlığı", done: false, overdue: false, rel: "bir ay sonra", source: "Proje X", tag: "Yapılacaklar", pomos: 0 },
    ],
  },
];

/** Takvimde görevi olan günler (Haziran 2026). */
export const taskDays = new Set<number>([8, 10, 12, 13, 14, 19]);
