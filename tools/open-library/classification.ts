import tree from './categories.tr.json' with { type: 'json' };
import { isApproved, normalizeLabel, resolveAuthor } from './authors.ts';
import type { Approval, AuthorAuthority, AuthorResolution } from './authors.ts';
import type { SourceId } from './contracts.ts';

export interface CategoryMapping {
  source: SourceId;
  tag: string;
  categoryId: string;
  approval?: Approval;
}
export interface CategoryPolicy {
  /** Ağaç ve eşleme onayları ayrıdır; ikisi de gereklidir. */
  treeApproval?: Approval;
  mappings: readonly CategoryMapping[];
}
export const categoryTree = tree;
export interface PendingSuggestion {
  bookKey: string;
  kind: 'author' | 'category';
  status: 'pending';
  origin: 'unmatched' | 'ai';
  input: string;
  candidates: string[];
  reason: string;
}
export interface ClassificationInput {
  bookKey: string;
  source: SourceId;
  author: string;
  tags: string[];
  /** Öneri, karar değildir; yalnız bekleme kaydına yazılır. */
  suggestions?: { authorIds?: string[]; categoryIds?: string[] };
}
export interface BookClassification {
  bookKey: string;
  author: AuthorResolution;
  categoryIds: string[];
  pending: PendingSuggestion[];
  complete: boolean;
}
const categoryIds = new Set(tree.categories.map(c => c.id));

export function classifyBook(input: ClassificationInput, authorities: readonly AuthorAuthority[], policy: CategoryPolicy): BookClassification {
  const author = resolveAuthor(input.author, authorities);
  const pending: PendingSuggestion[] = [];
  if (author.status === 'pending') pending.push({ bookKey: input.bookKey, kind: 'author', status: 'pending',
    origin: 'unmatched', input: input.author, candidates: author.candidates, reason: author.reason });
  const approved = new Set<string>();
  // Boş etiket listesi de eksik sınıflandırma olarak görünür.
  for (const tag of input.tags.length ? input.tags : ['']) {
    const matches = normalizeLabel(tag) ? policy.mappings.filter(m => m.source === input.source
      && normalizeLabel(m.tag) === normalizeLabel(tag) && categoryIds.has(m.categoryId)) : [];
    const accepted = isApproved(policy.treeApproval) ? matches.filter(m => isApproved(m.approval)) : [];
    for (const match of accepted) approved.add(match.categoryId);
    if (!accepted.length) pending.push({ bookKey: input.bookKey, kind: 'category', status: 'pending', origin: 'unmatched',
      input: tag, candidates: [...new Set(matches.map(m => m.categoryId))].sort(), reason: 'Kategori eşleşmesi insan onayı bekliyor.' });
  }
  for (const [kind, candidates] of [['author', input.suggestions?.authorIds], ['category', input.suggestions?.categoryIds]] as const) {
    if (candidates?.length) pending.push({ bookKey: input.bookKey, kind, status: 'pending', origin: 'ai',
      input: kind === 'author' ? input.author : input.tags.join(' | '), candidates: [...new Set(candidates)].sort(),
      reason: 'Öneri henüz insan tarafından onaylanmadı.' });
  }
  return { bookKey: input.bookKey, author, categoryIds: [...approved].sort(), pending,
    complete: author.status === 'verified' && approved.size > 0 };
}

/** Payda tüm adaylardır: eksik kayıtları süzerek yüzdeyi yükseltme. Yayın/lisans izni vermez. */
export function classificationCoverage(books: readonly BookClassification[]) {
  if (new Set(books.map(b => b.bookKey)).size !== books.length) throw new Error('Doluluğa aynı kitap iki kez verilemez.');
  const complete = books.filter(b => b.author.status === 'verified' && b.categoryIds.length > 0).length;
  const total = books.length;
  return { total, complete, ratio: total ? complete / total : 0, meetsTarget: total > 0 && complete * 10 >= total * 9 };
}
