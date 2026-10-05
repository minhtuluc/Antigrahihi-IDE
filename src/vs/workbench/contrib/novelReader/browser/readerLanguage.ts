import { ModesRegistry } from '../../../../editor/common/languages/modesRegistry.js';
import { TokenizationRegistry, TokenizationResult, EncodedTokenizationResult, Token } from '../../../../editor/common/languages.js';
import { NullState } from '../../../../editor/common/languages/nullTokenize.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
export const READER_LANGUAGE = 'novel-script';
ModesRegistry.registerLanguage({ id: READER_LANGUAGE, aliases: ['TypeScript (Workspace)'], extensions: [] });
export function registerReaderTokenizer(language: ILanguageService, theme: IThemeService): {
    dispose(): void;
} {
    const scan = (line: string) => { const tokens: {
        offset: number;
        type: string;
    }[] = [{ offset: 0, type: '' }]; const regex = /"(?:\\.|[^"\\])*"|\b(?:export|const)\b|\b\d+\b|[{}\[\]:;,]/g; let m: RegExpExecArray | null; while ((m = regex.exec(line))) {
        tokens.push({ offset: m.index, type: m[0][0] === '"' ? 'string' : /^\d/.test(m[0]) ? 'number' : /^(export|const)$/.test(m[0]) ? 'keyword' : 'delimiter' });
        tokens.push({ offset: m.index + m[0].length, type: '' });
    } return tokens.sort((a, b) => a.offset - b.offset); };
    return TokenizationRegistry.register(READER_LANGUAGE, {
        getInitialState: () => NullState,
        tokenize: (line) => new TokenizationResult(scan(line).map(t => new Token(t.offset, t.type, READER_LANGUAGE)), NullState),
        tokenizeEncoded: (line) => { const id = language.languageIdCodec.encodeLanguageId(READER_LANGUAGE); const tokens: number[] = []; for (const token of scan(line)) {
            const color = theme.getColorTheme().getTokenStyleMetadata(token.type, [], READER_LANGUAGE)?.foreground ?? 1;
            tokens.push(token.offset, (id | (color << 15) | (2 << 24) | 1024) >>> 0);
        } return new EncodedTokenizationResult(new Uint32Array(tokens), [], NullState); }
    });
}
