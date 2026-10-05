/** UTF-16 offsets are canonical; synthetic source syntax never acquires a source offset. */
export interface ProjectionSegment {
    kind: 'source' | 'escape' | 'scaffold';
    displayStart: number;
    displayEnd: number;
    sourceStart?: number;
    sourceEnd?: number;
}
export interface CodeProjection {
    text: string;
    source: string;
    segments: ProjectionSegment[];
}
export function projectChapter(source: string, ordinal: number): CodeProjection {
    const segments: ProjectionSegment[] = [];
    const pieces: string[] = [];
    let length = 0;
    const append = (text: string, kind: ProjectionSegment['kind'], sourceStart?: number, sourceEnd?: number) => {
        if (!text.length)
            return;
        const last = segments[segments.length - 1];
        if (kind === 'source' && last?.kind === 'source' && last.sourceEnd === sourceStart) {
            last.displayEnd += text.length;
            last.sourceEnd = sourceEnd;
        }
        else
            segments.push({ kind, displayStart: length, displayEnd: length + text.length, sourceStart, sourceEnd });
        pieces.push(text);
        length += text.length;
    };
    append(`export const module${String(ordinal).padStart(4, '0')} = {\n  revision: ${ordinal},\n  records: [\n    "`, 'scaffold');
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const escaped = ch === '"' ? '\\"' : ch === '\\' ? '\\\\' : ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch.charCodeAt(0) < 32 ? `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}` : undefined;
        append(escaped ?? ch, escaped ? 'escape' : 'source', i, i + 1);
        if (ch === '\n' && i + 1 < source.length)
            append('",\n    "', 'scaffold');
    }
    append('"\n  ]\n};\n', 'scaffold');
    return { text: pieces.join(''), source, segments };
}
export function canonicalToDisplay(p: CodeProjection, offset: number): number {
    const bounded = Math.max(0, Math.min(p.source.length, offset));
    for (const s of p.segments)
        if (s.sourceStart !== undefined && s.sourceEnd !== undefined && bounded >= s.sourceStart && bounded < s.sourceEnd)
            return s.displayStart + (s.kind === 'source' ? bounded - s.sourceStart : 0);
    const last = [...p.segments].reverse().find(s => s.sourceEnd !== undefined);
    return last?.displayEnd ?? p.segments[0].displayEnd;
}
export function displayToCanonical(p: CodeProjection, offset: number): number | undefined {
    for (const s of p.segments)
        if (s.kind !== 'scaffold' && offset >= s.displayStart && offset < s.displayEnd)
            return s.sourceStart! + (s.kind === 'source' ? offset - s.displayStart : 0);
    const last = [...p.segments].reverse().find(s => s.sourceEnd !== undefined);
    if (last && offset === last.displayEnd)
        return last.sourceEnd;
    return undefined;
}
export function copyCanonical(p: CodeProjection, start: number, end: number): string {
    const a = Math.min(start, end), b = Math.max(start, end);
    let result = '';
    for (const s of p.segments) {
        if (s.kind === 'scaffold' || s.displayEnd <= a || s.displayStart >= b)
            continue;
        const from = s.sourceStart! + (s.kind === 'source' ? Math.max(0, a - s.displayStart) : 0);
        const to = s.sourceEnd! - (s.kind === 'source' ? Math.max(0, s.displayEnd - b) : 0);
        result += p.source.slice(from, to);
    }
    return result;
}
export function canonicalRangeToDisplay(p: CodeProjection, start: number, end: number): {
    start: number;
    end: number;
}[] {
    const result: {
        start: number;
        end: number;
    }[] = [];
    for (const s of p.segments)
        if (s.kind !== 'scaffold' && s.sourceEnd! > start && s.sourceStart! < end)
            result.push({ start: s.displayStart + (s.kind === 'source' ? Math.max(0, start - s.sourceStart!) : 0), end: s.displayEnd - (s.kind === 'source' ? Math.max(0, s.sourceEnd! - end) : 0) });
    return result;
}
