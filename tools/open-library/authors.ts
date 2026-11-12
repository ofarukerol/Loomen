/** İnsan tarafından doğrulanmış kayıtlar dışarıdan verilir; ada bakarak kişi tahmini yapılmaz. */
export interface Approval {
  approvedBy: string;
  approvedAt: string;
  evidence: string;
}
export function isApproved(value?: Approval): boolean {
  return !!value?.approvedBy.trim() && !!value.evidence.trim()
    && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value.approvedAt)
    && Number.isFinite(Date.parse(value.approvedAt));
}
export interface AuthorAuthority {
  wikidataId: string;
  name: string;
  aliases: string[];
  approval?: Approval;
}
export type AuthorResolution =
  | { status: 'verified'; wikidataId: string; name: string }
  | { status: 'pending'; input: string; candidates: string[]; reason: string };

/** Noktalama, hareke ve aksanlar korunur: benzer ad, aynı kişi demek değildir. */
export function normalizeLabel(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('tr');
}
export function resolveAuthor(input: string, authorities: readonly AuthorAuthority[]): AuthorResolution {
  const label = normalizeLabel(input);
  const matches = label ? authorities.filter(a => /^Q[1-9]\d*$/.test(a.wikidataId)
    && [a.name, ...a.aliases].some(alias => normalizeLabel(alias) === label)) : [];
  const candidates = [...new Set(matches.map(a => a.wikidataId))].sort();
  // Çelişen, henüz doğrulanmamış bir kayıt bile otomatik birleşmeyi engeller.
  const verified = matches.find(a => isApproved(a.approval));
  if (candidates.length === 1 && verified) {
    return { status: 'verified', wikidataId: verified.wikidataId, name: verified.name };
  }
  return { status: 'pending', input, candidates,
    reason: candidates.length > 1 ? 'Aynı ad birden fazla kişiyi gösteriyor.' : 'Yazar eşleşmesi insan onayı bekliyor.' };
}
