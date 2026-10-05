import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ReaderController } from '../common/readerController.js';
import type { ReaderFacade } from '../../../../platform/novelReader/common/reader.js';
export const IReaderService = createDecorator<IReaderService>('workspaceReaderService');
export interface IReaderService extends ReaderController {
    readonly _serviceBrand: undefined;
}
export class ReaderService extends ReaderController implements IReaderService {
    declare readonly _serviceBrand: undefined;
    constructor() { const api = (globalThis as typeof globalThis & {
        workspaceReader?: ReaderFacade;
    }).workspaceReader; if (!api)
        throw new Error('Workspace Reader bridge unavailable'); super(api); }
}
