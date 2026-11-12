import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthor } from './authors.ts';
import type { Approval, AuthorAuthority } from './authors.ts';
import { categoryTree, classifyBook, classificationCoverage } from './classification.ts';
import type { CategoryPolicy, ClassificationInput } from './classification.ts';

// Kurgusal kişi ve onaylar; gerçek Vikiveri eşleşmesi iddia edilmez.
const approval: Approval = { approvedBy: 'örnek inceleyen', approvedAt: '2026-11-12', evidence: 'örnek kaynak kaydı' };
const authors: AuthorAuthority[] = [{ wikidataId: 'Q123', name: 'Örnek Yazar', aliases: ['Example Author', 'مؤلف تجريبي'], approval }];
const policy: CategoryPolicy = { treeApproval: approval, mappings: [
  { source: 'openiti', tag: 'Hadith', categoryId: 'islam.hadis', approval },
] };
const input: ClassificationInput = { bookKey: 'openiti:örnek:1', source: 'openiti', author: 'Example Author', tags: ['Hadith'] };

test('Doğrulanmış farklı dillerdeki yazar adları tek kişiye bağlanır', () => {
  for (const name of ['Örnek Yazar', '  Example   Author ', 'مؤلف تجريبي']) {
    assert.deepEqual(resolveAuthor(name, authors), { status: 'verified', wikidataId: 'Q123', name: 'Örnek Yazar' });
  }
});
test('Belirsiz, onaysız ve geçersiz kişi kayıtları birleştirilmez', () => {
  assert.equal(resolveAuthor('Example Author', [{ ...authors[0], approval: undefined }]).status, 'pending');
  assert.equal(resolveAuthor('Example Author', [...authors, { ...authors[0], wikidataId: 'Q456', approval: undefined }]).status, 'pending');
  assert.equal(resolveAuthor('Example Author', [{ ...authors[0], wikidataId: 'x' }]).status, 'pending');
  assert.equal(resolveAuthor('Ornek Yazar', authors).status, 'pending');
  assert.equal(resolveAuthor('', authors).status, 'pending');
});
test('Onay kaydı boşsa veya tarihi geçersizse kabul edilmez', () => {
  for (const value of [{ ...approval, approvedBy: ' ' }, { ...approval, evidence: '' }, { ...approval, approvedAt: 'dün' }]) {
    assert.equal(resolveAuthor('Example Author', [{ ...authors[0], approval: value }]).status, 'pending');
  }
});
test('Kategori ağacında kimlikler, üst başlıklar ve kaynak önerileri tutarlı', () => {
  const ids = new Set(categoryTree.categories.map(c => c.id));
  assert.equal(ids.size, categoryTree.categories.length);
  for (const category of categoryTree.categories) {
    assert.ok(category.label.trim());
    assert.ok(category.parentId === null || ids.has(category.parentId));
    const seen = new Set([category.id]);
    let parent = category.parentId;
    while (parent) {
      assert.ok(!seen.has(parent)); seen.add(parent);
      parent = categoryTree.categories.find(c => c.id === parent)!.parentId;
    }
  }
  for (const mapping of categoryTree.mappings) assert.ok(ids.has(mapping.categoryId));
  assert.ok(categoryTree.mappings.some(m => m.source === 'shamela' && m.categoryId === 'islam.hadis'));
});
test('Kaynağa özel onaylı kategori eşlemesi kullanılır', () => {
  const result = classifyBook(input, authors, policy);
  assert.deepEqual(result.categoryIds, ['islam.hadis']); assert.ok(result.complete);
  assert.equal(classifyBook({ ...input, source: 'gutenberg' }, authors, policy).complete, false);
  assert.equal(classifyBook({ ...input, tags: ['Hadith-ish'] }, authors, policy).complete, false);
});
test('Ağaç ve eşleme ayrı onay ister; taslak eşlemeler doluluğa girmez', () => {
  for (const p of [
    { mappings: policy.mappings },
    { treeApproval: approval, mappings: [{ ...policy.mappings[0], approval: undefined }] },
    { treeApproval: approval, mappings: [{ ...policy.mappings[0], categoryId: 'yok' }] },
  ]) {
    const result = classifyBook(input, authors, p);
    assert.deepEqual(result.categoryIds, []); assert.equal(result.complete, false); assert.equal(result.pending[0].status, 'pending');
  }
});
test('Öneriler ayrı bekler; yazar veya kategori alanını doldurmaz', () => {
  const result = classifyBook({ ...input, tags: [], suggestions: { authorIds: ['Q123'], categoryIds: ['islam.hadis'] } }, [], policy);
  assert.equal(result.author.status, 'pending'); assert.deepEqual(result.categoryIds, []);
  assert.equal(result.pending.filter(p => p.origin === 'ai').length, 2);
  assert.ok(result.pending.every(p => p.bookKey === input.bookKey && p.status === 'pending'));
  assert.equal(classificationCoverage([result]).complete, 0);
});
test('Yüzde 90 hesabında eksik adaylar paydada kalır; boş kitaplık geçmez', () => {
  const full = classifyBook(input, authors, policy);
  const missing = classifyBook({ ...input, bookKey: 'missing', tags: [] }, authors, policy);
  const books = Array.from({ length: 9 }, (_, n) => ({ ...full, bookKey: String(n) }));
  assert.deepEqual(classificationCoverage([...books, missing]), { total: 10, complete: 9, ratio: 0.9, meetsTarget: true });
  assert.equal(classificationCoverage([...books.slice(1), missing]).meetsTarget, false);
  assert.equal(classificationCoverage([]).meetsTarget, false);
  assert.throws(() => classificationCoverage([full, full]), /iki kez/);
});
