/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
let boundary: any;
try {
	boundary = await import('../readerIpc.ts');
}
catch { }
test('reader boundary rejects reflected methods and malformed anchors', () => {
	assert.ok(boundary, 'typed reader boundary is implemented');
	assert.throws(() => boundary.validateReaderRequest({ method: 'constructor', args: [] }));
	assert.throws(() => boundary.validateReaderRequest({ method: 'savePosition', args: [{ bookId: 'b', versionId: 'v', chapterId: 'c', offset: -1 }] }));
	assert.deepEqual(boundary.validateReaderRequest({ method: 'listBooks', args: [] }), { method: 'listBooks', args: [] });
});
test('reader boundary rejects unknown fields, NaN typography and byte budget excess', () => {
	assert.throws(() => boundary.validateReaderRequest({ method: 'updateBook', args: ['b', { execute: 'shell' }] }));
	assert.throws(() => boundary.validateReaderRequest({ method: 'savePreferences', args: [{ lineHeight: NaN }] }));
	assert.throws(() => boundary.validateReaderRequest({ method: 'importBook', args: [new Uint8Array(64 * 1024 * 1024 + 1), 'b.txt'] }));
	assert.throws(() => boundary.validateReaderRequest({ method: 'getSession', args: [], execute: 'shell' }));
});
