import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runsForBlock, safeAssetUrl, internalTarget } from '../common/bookRendering.ts';
test('block mark runs preserve text with overlaps and canonical source offsets', () => {
    const b = { id: 'b', kind: 'paragraph' as const, text: 'abcde', start: 20, end: 25, marks: [{ start: 1, end: 4, kind: 'strong' as const }, { start: 2, end: 5, kind: 'emphasis' as const }] };
    const runs = runsForBlock(b);
    assert.equal(runs.map(x => x.text).join(''), 'abcde');
    assert.deepEqual(runs.map(x => x.start), [20, 21, 22, 24]);
    assert.deepEqual(runs[2].marks.map(x => x.kind), ['strong', 'emphasis']);
});
test('book resources cannot load scripts or remote network and links remain internal', () => {
    assert.equal(safeAssetUrl({ id: 'a', mime: 'image/svg+xml', data: 'PHNjcmlwdD4=' }), undefined);
    assert.equal(safeAssetUrl({ id: 'a', mime: 'image/png', data: 'aGVsbG8=' }), 'data:image/png;base64,aGVsbG8=');
    assert.equal(internalTarget('https://example.org'), undefined);
    assert.equal(internalTarget('#footnote'), 'footnote');
    assert.equal(internalTarget('chapter-2#note'), 'chapter-2#note');
});
import { annotatedRuns } from '../common/bookRendering.ts';
test('highlight splits at canonical range without coloring unrelated text', () => {
    const runs = annotatedRuns({ id: 'b', kind: 'paragraph', text: 'abcde', start: 20, end: 25 }, [{ id: 'n', kind: 'highlight', anchor: { bookId: 'b', versionId: 'v', chapterId: 'c', offset: 21 }, endOffset: 23, color: 'blue', createdAt: 1 }]);
    assert.deepEqual(runs.map(r => [r.text, r.highlight]), [['a', undefined], ['bc', 'blue'], ['de', undefined]]);
});
