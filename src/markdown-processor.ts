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

interface ImageMatch {
    placeholder: string;
    alt: string;
    src: string;
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
        const sanitized = this.sanitizeForMarked(content);
        return MarkdownFormatter.ensureProperSpacing(sanitized);
    }

    private initializeMarked(): void {
        const renderer = new marked.Renderer();
        
        renderer.image = (href: string | null, title: string | null, text: string): string => {
            if (href && href.startsWith('data:image/')) {
                const alt = text ? ` alt="${this.escapeHtml(text)}"` : '';
                const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : '';
                return `<img src="${href}"${alt}${titleAttr} style="max-width: 100%; height: auto;">`;
            }
            const alt = text ? ` alt="${this.escapeHtml(text)}"` : '';
            const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : '';
            return `<img src="${href || ''}"${alt}${titleAttr} style="max-width: 100%; height: auto;">`;
        };
        
        marked.setOptions({
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
    
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m] || m);
    }

    /**
     * MarkdownをHTMLに変換
     * @param markdown - 変換対象のMarkdown
     * @returns HTML文字列
     */
    toHtml(markdown: string): string {
        try {
            const sanitized = this.sanitizeForMarked(markdown);
            const preprocessed = this.preprocessCodeBlocks(sanitized);
            
            if (preprocessed.includes('data:image/') || preprocessed.includes('data:application/octet-stream')) {
                return this.convertBase64ImagesToHtml(preprocessed);
            }
            
            return marked.parse(preprocessed);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return this.fallbackToPlainText(markdown);
        }
    }
    
    private convertBase64ImagesToHtml(markdown: string): string {
        const imageMatches: ImageMatch[] = [];
        let imageCounter = 0;
        
        const processedMarkdown = markdown.replace(
            /!\[([^\]]*)\]\((data:(?:image\/[^;]+|application\/octet-stream);base64,[^)]+)\)/g,
            (_match, alt, src): string => {
                const placeholder = `<!--IMG_PLACEHOLDER_${imageCounter}-->`;
                imageMatches.push({
                    placeholder,
                    alt: alt || '',
                    src: src
                });
                imageCounter++;
                return placeholder;
            }
        );
        
        let html = marked.parse(processedMarkdown);
        
        imageMatches.forEach(({ placeholder, alt, src }) => {
            const escapedAlt = this.escapeHtml(alt);
            const imgTag = `<img src="${src}" alt="${escapedAlt}" style="max-width: 100%; height: auto; display: block; margin: 10px auto;" />`;
            html = html.replace(placeholder, imgTag);
        });
        
        return html;
    }
    
    private sanitizeForMarked(text: string): string {
        // まず画像プレースホルダーを一時的に保護
        const imagePlaceholders: string[] = [];
        const imageRegex = /\[\[IMG_\d+\]\]/g;
        let match: RegExpExecArray | null;
        while ((match = imageRegex.exec(text)) !== null) {
            imagePlaceholders.push(match[0]);
        }
        
        // 画像プレースホルダーを一時的なマーカーに置換
        let sanitized = text;
        imagePlaceholders.forEach((placeholder, index) => {
            sanitized = sanitized.replace(placeholder, `__IMAGE_PLACEHOLDER_${index}__`);
        });
        
        // lheadingのエラーを防ぐため、問題のあるパターンを事前に処理
        // 行が文字で始まり、次の行が=か-の連続の場合の処理
        sanitized = sanitized.replace(/^(.+)\n(={2,})\s*$/gm, (_match, p1, _p2) => {
            return `# ${p1}\n`;
        });
        sanitized = sanitized.replace(/^(.+)\n(-{2,})\s*$/gm, (_match, p1, _p2) => {
            return `## ${p1}\n`;
        });
        
        // 空行の連続を制限（最大2つまで）
        sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
        
        // 独立した = や - の行を水平線に変換
        sanitized = sanitized.replace(/^\s*(={3,})\s*$/gm, '\n---\n');
        sanitized = sanitized.replace(/^\s*(-{3,})\s*$/gm, '\n---\n');
        
        // 不正な文字を除去
        // eslint-disable-next-line no-control-regex
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // 行末の空白を削除
        sanitized = sanitized.replace(/[ \t]+$/gm, '');
        
        // 画像プレースホルダーを元に戻す
        imagePlaceholders.forEach((placeholder, index) => {
            sanitized = sanitized.replace(`__IMAGE_PLACEHOLDER_${index}__`, placeholder);
        });
        
        return sanitized;
    }
    
    private fallbackToPlainText(text: string): string {
        // プレーンテキストをHTMLに変換（改行を保持）
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        
        // 段落に分割して表示
        const paragraphs = escaped.split(/\n\n+/);
        return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
    }

    private preprocessCodeBlocks(markdown: string): string {
        const lines = markdown.split('\n');
        const processedLines: string[] = [];
        let inCodeBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                processedLines.push(line || '');
                
                if (!inCodeBlock && i < lines.length - 1 && lines[i + 1]?.trim() !== '') {
                    processedLines.push('');
                }
            } else {
                processedLines.push(line || '');
            }
        }
        
        return processedLines.join('\n');
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