import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectChapter, copyCanonical, canonicalToDisplay, displayToCanonical } from '../common/codeProjection.ts';
import { reducePresentation, sameAnchorIdentity } from '../common/presentation.ts';
const text = 'quote " slash \\ line\nemoji 😀 dấu a\u0301';
test('copy original Unicode and escaped text across strings without scaffolding', () => {
    const p = projectChapter(text, 4);
    assert.ok(p.text.includes('export const module0004'));
    assert.ok(p.text.includes('\\"'));
    assert.equal(copyCanonical(p, 0, p.text.length), text);
    assert.equal(copyCanonical(p, 0, 10), '');
});
test('every UTF-16 boundary maps round trip including escape pairs and emoji', () => {
    const p = projectChapter(text, 4);
    for (let i = 0; i <= text.length; i++)
        assert.equal(displayToCanonical(p, canonicalToDisplay(p, i)), i);
    const start = canonicalToDisplay(p, text.indexOf('"'));
    assert.equal(copyCanonical(p, start, start + 2), '"');
});
test('cover and mode changes restore immutable canonical version identity', () => {
    const anchor = { bookId: 'a', versionId: 'v1', chapterId: 'c', offset: 14 };
    const before = { anchor, mode: 'book' as const, covered: false };
    const covered = reducePresentation(before, { type: 'cover' });
    assert.equal(covered.mode, 'code');
    assert.deepEqual(covered.anchor, anchor);
    assert.deepEqual(reducePresentation(covered, { type: 'uncover' }), before);
    assert.equal(sameAnchorIdentity(anchor, { ...anchor, versionId: 'v2' }), false);
    assert.deepEqual(reducePresentation(before, { type: 'mode', mode: 'code' }).anchor, anchor);
});
