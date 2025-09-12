// ==================== Base EPUB Parser ====================
// 全EPUBパーサーの基底クラス

import type {
    IEPUBParser,
    EPUBParserType,
    EPUBParserOptions,
    EPUBParseResult,
    EPUBMetadata,
    EPUBParserError
} from '../types/epub-parsers.js';
import { ImageManager } from '../image-manager.js';
import { isHtmlContentCode } from '../utils/code-detection.js';
import { postProcessMarkdown } from '../utils/markdown-post-processor.js';

/**
 * EPUBパーサーの基底抽象クラス
 * 全てのEPUBパーサー実装の共通機能を提供
 */
export abstract class BaseEPUBParser implements IEPUBParser {
    protected imageManager: ImageManager | null = null;
    protected disposed = false;
    
    abstract readonly type: EPUBParserType;
    abstract readonly name: string;
    abstract readonly description: string;
    
    /**
     * パーサーが利用可能かチェック
     */
    abstract isAvailable(): Promise<boolean>;
    
    /**
     * EPUBファイルを解析してMarkdownに変換
     */
    abstract parse(
        arrayBuffer: ArrayBuffer,
        options?: EPUBParserOptions
    ): Promise<EPUBParseResult>;
    
    /**
     * 画像マネージャーを取得
     */
    getImageManager(): ImageManager | null {
        return this.imageManager;
    }
    
    /**
     * 新しい画像マネージャーを作成
     */
    protected createImageManager(): ImageManager {
        this.imageManager = new ImageManager();
        return this.imageManager;
    }
    
    /**
     * リソースをクリーンアップ
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        
        this.imageManager = null;
        this.disposed = true;
    }
    
    /**
     * デフォルトのパーサーオプションを取得
     */
    protected getDefaultOptions(): EPUBParserOptions {
        return {
            extractImages: true,
            includeChapterNumbers: true,
            includeMetadata: false,  // デフォルトでOFF
            sectionSeparator: 'none',  // デフォルトでなし
            footnoteStyle: 'reference',
            preserveStyles: false
        };
    }
    
    /**
     * オプションをマージ
     */
    protected mergeOptions(options?: EPUBParserOptions): EPUBParserOptions {
        return {
            ...this.getDefaultOptions(),
            ...options
        };
    }
    
    /**
     * メタデータセクションを生成
     */
    protected generateMetadataSection(metadata: EPUBMetadata): string {
        const lines: string[] = ['---'];
        
        if (metadata.title) {
            lines.push(`title: ${metadata.title}`);
        }
        if (metadata.author) {
            lines.push(`author: ${metadata.author}`);
        }
        if (metadata.publisher) {
            lines.push(`publisher: ${metadata.publisher}`);
        }
        if (metadata.language) {
            lines.push(`language: ${metadata.language}`);
        }
        if (metadata.isbn) {
            lines.push(`isbn: ${metadata.isbn}`);
        }
        if (metadata.publishDate) {
            lines.push(`date: ${metadata.publishDate}`);
        }
        
        lines.push('---\n');
        return lines.join('\n');
    }
    
    /**
     * セクション区切りを生成
     */
    protected generateSectionSeparator(
        style: 'hr' | 'heading' | 'none',
        chapterNumber?: number,
        chapterTitle?: string
    ): string {
        switch (style) {
            case 'hr':
                return '\n---\n';
            case 'heading':
                if (chapterNumber && chapterTitle) {
                    return `\n## Chapter ${chapterNumber}: ${chapterTitle}\n`;
                } else if (chapterTitle) {
                    return `\n## ${chapterTitle}\n`;
                }
                return '\n## * * *\n';
            case 'none':
            default:
                return '\n\n';
        }
    }
    
    /**
     * 画像プレースホルダーを生成
     */
    protected createImagePlaceholder(
        imageData: string | ArrayBuffer,
        altText?: string,
        _index?: number
    ): string {
        if (!this.imageManager) {
            this.createImageManager();
        }
        
        // ArrayBufferの場合は文字列に変換
        const dataString = typeof imageData === 'string' ? imageData : 
                          `data:application/octet-stream;base64,${this.arrayBufferToBase64String(imageData)}`;
        
        // ImageManagerを使って画像を保存し、プレースホルダーを取得
        const placeholder = this.imageManager!.storeImage(dataString, altText);
        return placeholder;
    }
    
    /**
     * ArrayBufferをBase64文字列に変換
     */
    protected arrayBufferToBase64String(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]!);
        }
        return btoa(binary);
    }
    
    /**
     * HTMLをMarkdownに変換（基本実装）
     */
    protected htmlToMarkdown(html: string): string {
        // 簡易的な変換（各パーサーでより高度な実装に置き換え可能）
        let markdown = html;
        
        // 見出し
        markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
        markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
        markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
        markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
        markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n');
        markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n');
        
        // 段落
        markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
        
        // 改行
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
        
        // 強調
        markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
        markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
        markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
        markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
        
        // リスト
        markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_match, content) => {
            return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
        });
        markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_match, content) => {
            let counter = 1;
            return content.replace(/<li[^>]*>(.*?)<\/li>/gi, (_itemMatch: string) => {
                return `${counter++}. $1\n`;
            }) + '\n';
        });
        
        // リンク
        markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
        
        // 画像
        markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
        markdown = markdown.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');
        markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)');
        
        // コード（改善版）
        markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
        markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gis, (_match, content) => {
            // <pre>タグの内容がコードかどうかを判定
            if (isHtmlContentCode(content)) {
                return '```\n' + content + '\n```';
            } else {
                // コードではない場合は通常のテキストとして扱う
                return content;
            }
        });
        
        // 引用
        markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_match, content) => {
            return content.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n';
        });
        
        // 水平線
        markdown = markdown.replace(/<hr\s*\/?>/gi, '\n---\n');
        
        // 残りのHTMLタグを削除
        markdown = markdown.replace(/<[^>]+>/g, '');
        
        // HTMLエンティティをデコード
        markdown = this.decodeHtmlEntities(markdown);
        
        // 過剰な空白を正規化
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.trim();
        
        // Markdown後処理を適用
        markdown = postProcessMarkdown(markdown, {
            codeThreshold: 0.4,
            autoDetectLanguage: true,
            removeEmptyCodeBlocks: true  // 空のコードブロックを除去
        });
        
        return markdown;
    }
    
    /**
     * Markdownコンテンツを正規化
     */
    protected normalizeMarkdown(markdown: string, applyPostProcessing: boolean = true): string {
        if (applyPostProcessing) {
            return postProcessMarkdown(markdown, {
                codeThreshold: 0.4,
                autoDetectLanguage: true,
                removeEmptyCodeBlocks: true  // 空のコードブロックを除去
            });
        }
        
        // 基本的な正規化のみ
        return markdown.replace(/\n{3,}/g, '\n\n').trim();
    }
    
    /**
     * HTMLエンティティをデコード
     */
    protected decodeHtmlEntities(text: string): string {
        const entities: Record<string, string> = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': '\'',
            '&nbsp;': ' ',
            '&mdash;': '—',
            '&ndash;': '–',
            '&hellip;': '…',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™'
        };
        
        return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
    }
    
    /**
     * エラーハンドリング
     */
    protected handleError(error: unknown, context: string): never {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${this.name} - ${context}: ${message}`) as EPUBParserError;
    }
}

/**
 * EPUBパーサーが利用不可エラー
 */
export class EPUBParserUnavailableError extends Error {
    constructor(
        public readonly parserType: EPUBParserType,
        message: string
    ) {
        super(`Parser '${parserType}' is unavailable: ${message}`);
        this.name = 'EPUBParserUnavailableError';
    }
}