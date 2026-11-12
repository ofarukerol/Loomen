import type { IntakeBook, ReleasePolicy } from './contracts.ts';

export function secureUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/** Dağıtım kararları varsayılan olarak kapalıdır; bu iş hukuki izin üretmez. */
export function classifyRights(book: IntakeBook, policy?: ReleasePolicy): {
  status: 'prepared' | 'private' | 'held'; reason: string;
} {
  if (book.source === 'shamela') return { status: 'private', reason: 'Şamile yalnız kapalı arşivde tutulur.' };
  const r = book.rights;
  if (!r || !r.license.trim() || !secureUrl(r.evidenceUrl) || !r.verifiedBy.trim() ||
      !Number.isFinite(Date.parse(r.verifiedAt)) || r.editionId !== book.editionId ||
      !r.redistribution || !r.territories.length) {
    return { status: 'held', reason: 'Bu baskının dağıtım izni doğrulanmadı.' };
  }
  if (!policy?.approvedBy.trim() || !policy.territories.length ||
      !policy.licenses.includes(r.license) ||
      !policy.territories.every(t => r.territories.includes(t))) {
    return { status: 'held', reason: 'Lisans ve dağıtım ülkeleri için yayın onayı bekleniyor.' };
  }
  return { status: 'prepared', reason: 'Baskı izni ve yayın kapsamı doğrulandı.' };
}
