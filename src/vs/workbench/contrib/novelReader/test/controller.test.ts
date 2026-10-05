import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReaderController } from '../common/readerController.ts';
test('cover closes owned transients synchronously without persistence and restores anchor', () => {
    let closed = false;
    let writes = 0;
    const api = { setWindowTitle: () => { }, saveSession: () => { writes++; return new Promise(() => { }); } } as any;
    const c = new ReaderController(api);
    c.state = { mode: 'book', covered: false, anchor: { bookId: 'a', versionId: 'v', chapterId: 'c', offset: 4 } };
    c.registerTransient(() => closed = true);
    c.cover();
    assert.equal(closed, true);
    assert.equal(c.state.covered, true);
    assert.equal(c.state.mode, 'code');
    assert.equal(writes, 1);
    c.uncover();
    assert.equal(c.state.mode, 'book');
    assert.equal(c.state.anchor?.offset, 4);
});
test('startup never restores book mode or cover onto a stale version', async () => {
    const api = { getSession: async () => ({ mode: 'book', covered: true, anchor: { bookId: 'a', versionId: 'v', chapterId: 'c', offset: 2 } }), getPreferences: async () => ({}), getBookManifest: async () => ({ id: 'a', versionId: 'v', alias: 'inventory', chapters: [{ id: 'c' }] }), getChapter: async () => ({ id: 'c', text: 'abcd', blocks: [] }), setWindowTitle: () => { }, listAnnotations: async () => [] } as any;
    const c = new ReaderController(api);
    await c.initialize();
    assert.equal(c.state.mode, 'code');
    assert.equal(c.state.covered, false);
    assert.equal(c.chapter?.text, 'abcd');
});
test('normal navigation reads manifest and one chapter without fetching whole book or assets', async () => {
    let whole = 0, assets = 0;
    const api = { getBook: async () => { whole++; throw new Error('full book prohibited'); }, getBookManifest: async () => ({ id: 'a', versionId: 'v', alias: 'project', title: 'Private', chapters: [{ id: 'c' }], assets: [{ id: 'image', mime: 'image/png' }], coverAssetId: 'image' }), getChapter: async () => ({ id: 'c', ordinal: 0, text: 'abc', blocks: [{ id: 'b', kind: 'image', assetId: 'image' }] }), getAsset: async () => { assets++; return { data: 'a' }; }, listAnnotations: async () => [], savePosition: async () => { }, saveSession: async () => { }, setWindowTitle: () => { } } as any;
    const c = new ReaderController(api);
    await c.navigate({ bookId: 'a', versionId: 'v', chapterId: 'c', offset: 1 });
    assert.equal(whole, 0);
    assert.equal(assets, 0);
    assert.equal(c.chapter?.text, 'abc');
});
test('canonical selection survives typography, mode and cover transitions', () => {
    const api = { setWindowTitle: () => { }, saveSession: async () => { } } as any;
    const c = new ReaderController(api);
    c.state = { mode: 'code', covered: false, anchor: { bookId: 'a', versionId: 'v', chapterId: 'c', offset: 2 } };
    c.select(2, 9);
    c.mode('book');
    c.cover();
    c.uncover();
    assert.deepEqual(c.selectedRange, { start: 2, end: 9, versionId: 'v', chapterId: 'c' });
});
test('continuous reading checkpoints within five seconds and records latest canonical offset',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const positions:number[]=[];const api={saveSession:async()=>{},savePosition:async(a:any)=>{positions.push(a.offset);}} as any;
 const c=new ReaderController(api);c.state={mode:'code',covered:false,anchor:{bookId:'a',versionId:'v',chapterId:'c',offset:0}};
 for(let i=0;i<6;i++){c.position(i+1);t.mock.timers.tick(1000);}
 assert.ok(positions.length>=1);assert.ok(positions[0]>=4);c.dispose();
});
