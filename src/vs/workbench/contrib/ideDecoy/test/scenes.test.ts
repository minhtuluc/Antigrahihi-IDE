import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayTerminal, DECOY_ACTIONS, getScene } from '../common/scenes.ts';
test('terminal replay is bounded local data and never interprets shell input', () => {
    let lines: string[] = [];
    for (let i = 0; i < 200; i++)
        lines = replayTerminal(lines, 'rm -rf /; $(curl secret)');
    assert.ok(lines.length <= 100);
    assert.ok(lines.join('\n').includes('Scene input recorded'));
    assert.ok(replayTerminal([], 'x'.repeat(5000)).every(x => x.length < 1100));
});
test('each controlled action names a finite local scene', () => {
    assert.equal(Object.keys(DECOY_ACTIONS).length, 8);
    for (const scene of Object.values(DECOY_ACTIONS))
        assert.ok(getScene(scene).length > 0);
    assert.throws(() => getScene('unknown' as any));
});
import { sceneDocument } from '../common/scenes.ts';
test('selecting scene source or diff returns read-only fixture source with neutral labels', () => {
    assert.equal(sceneDocument('scm', 'M  src/config.ts').name, 'config.ts');
    assert.ok(sceneDocument('scm', 'M  src/config.ts').source.includes('export const'));
    assert.ok(sceneDocument('testing', 'accepts valid records').source.includes('describe('));
});
