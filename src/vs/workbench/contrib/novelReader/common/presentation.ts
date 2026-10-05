import type { ReaderAnchor, PresentationMode } from '../../../../platform/novelReader/common/reader.js';
export interface Presentation {
    anchor?: ReaderAnchor;
    mode: PresentationMode;
    covered: boolean;
    beforeCoveredMode?: PresentationMode;
}
export type PresentationAction = {
    type: 'mode';
    mode: PresentationMode;
} | {
    type: 'cover';
} | {
    type: 'uncover';
} | {
    type: 'anchor';
    anchor: ReaderAnchor;
};
export function sameAnchorIdentity(a: ReaderAnchor, b: ReaderAnchor): boolean { return a.bookId === b.bookId && a.versionId === b.versionId && a.chapterId === b.chapterId; }
export function reducePresentation(state: Presentation, action: PresentationAction): Presentation {
    switch (action.type) {
        case 'cover': return state.covered ? state : { ...state, mode: 'code', covered: true, beforeCoveredMode: state.mode };
        case 'uncover': {
            const { beforeCoveredMode, ...rest } = state;
            return { ...rest, mode: beforeCoveredMode ?? 'code', covered: false };
        }
        case 'mode': return { ...state, mode: action.mode, covered: false };
        case 'anchor': return { ...state, anchor: action.anchor };
    }
}
