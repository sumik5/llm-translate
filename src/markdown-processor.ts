// ==================== Markdown Processing ====================
import type { 
    ProcessingResult, 
    MarkdownProcessor as IMarkdownProcessor,
    MarkdownAST
    // MarkdownNode // Unused
} from './types/processors.js';
import type { SupportedFileType, FileInfo } from './types/core.js';
import { MarkdownFormatter } from './markdown-formatter.js';

// Global marked library type declarations
declare global {
    const marked: {
        Renderer: typeof MarkedRenderer;
        setOptions: (options: MarkedOptions) => void;
        parse: (src: string) => string;
    };
    
    const Prism: {
        languages: { [key: string]: any };
        highlight: (code: string, grammar: any, language: string) => string;
    } | undefined;
}

interface MarkedOptions {
    renderer?: MarkedRenderer;
    breaks?: boolean;
    gfm?: boolean;
    pedantic?: boolean;
    headerIds?: boolean;
    mangle?: boolean;
    sanitize?: boolean;
    smartLists?: boolean;
    smartypants?: boolean;
    xhtml?: boolean;
    highlight?: (code: string, lang?: string) => string;
}

class MarkedRenderer {
    image(_href: string | null, _title: string | null, _text: string): string {
        return '';
    }
}

/**
 * Markdown形式のファイルを処理し、HTMLに変換するプロセッサー
 * marked.jsライブラリを使用してMarkdownをHTMLレンダリングする
 */
class MarkdownProcessor implements IMarkdownProcessor {
    readonly supportedTypes: readonly SupportedFileType[] = ['md'];

    constructor() {
        this.initializeMarked();
    }

    /**
     * ファイルタイプをサポートしているかチェック
     * @param fileType - チェック対象のファイルタイプ
     */
    supportsType(fileType: SupportedFileType): boolean {
        return this.supportedTypes.includes(fileType);
    }

    /**
     * Markdownファイルを解析してHTMLに変換
     * @param arrayBuffer - Markdownファイルのバイナリデータ
     * @param fileInfo - ファイル情報（オプション）
     * @returns 処理結果
     */
    async parse(arrayBuffer: ArrayBuffer, fileInfo?: FileInfo): Promise<ProcessingResult> {
        const decoder = new TextDecoder('utf-8');
        const content = decoder.decode(arrayBuffer);
        
        return this.createProcessingResult(content, fileInfo);
    }

    /**
     * マークダウンをパース（AST構造には対応していない簡易版）
     * @param content - マークダウンテキスト
     */
    parseMarkdown(content: string): MarkdownAST {
        // 簡易的なAST構造を返す（実装は最小限）
        return {
            type: 'root',
            children: [{
                type: 'text',
                value: content
            }]
        };
    }

    /**
     * マークダウンを正規化
     * @param content - 正規化対象のマークダウン
     */
    normalizeMarkdown(content: string): string {
        const sanitized = MarkdownFormatter.sanitizeForMarked(content);
        return MarkdownFormatter.ensureProperSpacing(sanitized);
    }

    private initializeMarked(): void {
        const renderer = new marked.Renderer();
        
        renderer.image = (href: string | null, title: string | null, text: string): string => {
            if (href && href.startsWith('data:image/')) {
                const alt = text ? ` alt="${MarkdownFormatter.escapeHtml(text)}"` : '';
                const titleAttr = title ? ` title="${MarkdownFormatter.escapeHtml(title)}"` : '';
                return `<img src="${href}"${alt}${titleAttr} style="max-width: 100%; height: auto;">`;
            }
            const alt = text ? ` alt="${MarkdownFormatter.escapeHtml(text)}"` : '';
            const titleAttr = title ? ` title="${MarkdownFormatter.escapeHtml(title)}"` : '';
            return `<img src="${href || ''}"${alt}${titleAttr} style="max-width: 100%; height: auto;">`;
        };
        
        marked.setOptions?.({
            renderer: renderer,
            breaks: true,
            gfm: true,
            pedantic: false,
            headerIds: false,
            mangle: false,
            sanitize: false,
            smartLists: true,
            smartypants: false,
            xhtml: false,
            highlight: (code: string, lang?: string): string => {
                if (!lang) return code;
                
                if (typeof Prism !== 'undefined' && Prism.languages[lang]) {
                    try {
                        return Prism.highlight(code, Prism.languages[lang], lang);
                    } catch (e) {
                        return code;
                    }
                }
                return code;
            }
        });
    }
    

    /**
     * MarkdownをHTMLに変換
     * @param markdown - 変換対象のMarkdown
     * @returns HTML文字列
     */
    toHtml(markdown: string): string {
        return MarkdownFormatter.toHtml(markdown);
    }


    private createProcessingResult(content: string, fileInfo?: FileInfo): ProcessingResult {
        const characterCount = content.length;
        
        return {
            content,
            metadata: {
                originalName: fileInfo?.name || 'unknown.md',
                fileType: 'md',
                size: fileInfo?.size || 0,
                characterCount,
                processingTime: 0
            }
        };
    }
}

export default MarkdownProcessor;