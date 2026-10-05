import type { ReaderBlock, ReaderMark, ReaderAsset } from '../../../../platform/novelReader/common/reader.js';
export interface BookRun {
    text: string;
    start: number;
    marks: ReaderMark[];
}
export function runsForBlock(block: ReaderBlock): BookRun[] {
    const marks = (block.marks ?? []).filter(m => m.end > m.start);
    const bounds = [...new Set([0, block.text.length, ...marks.flatMap(m => [Math.max(0, Math.min(block.text.length, m.start)), Math.max(0, Math.min(block.text.length, m.end))])])].sort((a, b) => a - b);
    return bounds.slice(0, -1).map((start, i) => ({ text: block.text.slice(start, bounds[i + 1]), start: block.start + start, marks: marks.filter(m => m.start <= start && m.end >= bounds[i + 1]) }));
}
export function safeAssetUrl(asset: ReaderAsset | undefined): string | undefined {
    if (!asset || !/^image\/(png|jpeg|gif|webp|avif)$/.test(asset.mime) || !/^[A-Za-z0-9+/=\s]*$/.test(asset.data))
        return undefined;
    return `data:${asset.mime};base64,${asset.data}`;
}
export function internalTarget(href: string): string | undefined {
    if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//') || href.includes('..') || href.includes('\\'))
        return undefined;
    return href.startsWith('#') ? href.slice(1) : href;
}
export function annotatedRuns(block: ReaderBlock, annotations: import('../../../../platform/novelReader/common/reader.js').ReaderAnnotation[]): (BookRun & {
    highlight?: string;
})[] {
    const highlights = annotations.filter(a => a.kind === 'highlight' && a.anchor.offset < block.end && (a.endOffset ?? a.anchor.offset) > block.start);
    const result: (BookRun & {
        highlight?: string;
    })[] = [];
    for (const run of runsForBlock(block)) {
        const end = run.start + run.text.length;
        const bounds = [...new Set([run.start, end, ...highlights.flatMap(a => [Math.max(run.start, a.anchor.offset), Math.min(end, a.endOffset ?? a.anchor.offset)]).filter(p => p > run.start && p < end)])].sort((a, b) => a - b);
        for (let i = 0; i < bounds.length - 1; i++) {
            const start = bounds[i], stop = bounds[i + 1];
            const highlight = highlights.find(a => a.anchor.offset <= start && (a.endOffset ?? a.anchor.offset) >= stop);
            result.push({ text: run.text.slice(start - run.start, stop - run.start), start, marks: run.marks, highlight: highlight ? highlight.color ?? 'yellow' : undefined });
        }
    }
    return result;
}
