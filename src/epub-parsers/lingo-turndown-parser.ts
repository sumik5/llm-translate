// ==================== Lingo + Turndown Parser ====================
// @lingo-reader/epub-parser + turndownを使用したEPUBパーサー（ブラウザ対応）

import { BaseEPUBParser } from './base-epub-parser.js';
import { isHtmlContentCode } from '../utils/code-detection.js';
import type { 
    EPUBParserType,
    EPUBParserOptions,
    EPUBParseResult,
    EPUBMetadata
} from '../types/epub-parsers.js';

// Dynamic import types for browser-compatible libraries
type LingoEPUBModule = {
    initEpubFile: (data: Blob | ArrayBuffer | File) => Promise<LingoEPUBBook>;
};

type TurndownModule = {
    default: new (options?: any) => TurndownService;
};

interface TurndownService {
    turndown(html: string): string;
    addRule(key: string, rule: any): void;
}

interface LingoEPUBBook {
    getMetadata(): LingoMetadata;
    getSpine(): LingoSpineItem[];
    loadChapter(id: string): Promise<{ html: string; css?: string }> | { html: string; css?: string };
    getResources?(): Map<string, ArrayBuffer>;
    resources?: Map<string, ArrayBuffer>;
}

interface LingoMetadata {
    title?: string;
    creators?: Array<{ name: string; role?: string }>;
    publisher?: string;
    language?: string;
    description?: string;
    identifier?: Array<{ value: string; scheme?: string }>;
    date?: string;
    cover?: string;
}

interface LingoSpineItem {
    id: string;
    href: string;
    mediaType?: string;
    properties?: string[];
}

/**
 * @lingo-reader/epub-parser + turndown パーサー（ブラウザ対応版）
 * 最新のEPUB仕様対応とTypeScript型安全性を重視
 */
export default class LingoTurndownParser extends BaseEPUBParser {
    readonly type: EPUBParserType = 'lingo-turndown';
    readonly name = 'Lingo + Turndown';
    readonly description = '最新EPUB仕様対応の高度なパーサー（ブラウザ対応）';
    
    private initEpubFile: LingoEPUBModule['initEpubFile'] | null = null;
    private TurndownService: TurndownModule['default'] | null = null;
    
    /**
     * パーサーが利用可能かチェック
     */
    async isAvailable(): Promise<boolean> {
        try {
            if (this.initEpubFile && this.TurndownService) return true;
            
            // Dynamic import with error handling
            const [lingoModule, turndownModule] = await Promise.all([
                import('@lingo-reader/epub-parser').catch(() => null) as Promise<LingoEPUBModule | null>,
                import('turndown').catch(() => null) as Promise<TurndownModule | null>
            ]);
            
            if (lingoModule && lingoModule.initEpubFile && 
                turndownModule && turndownModule.default) {
                this.initEpubFile = lingoModule.initEpubFile;
                this.TurndownService = turndownModule.default;
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }
    
    /**
     * EPUBファイルを解析してMarkdownに変換
     */
    async parse(
        arrayBuffer: ArrayBuffer,
        options?: EPUBParserOptions
    ): Promise<EPUBParseResult> {
        const startTime = performance.now();
        
        if (!this.initEpubFile || !this.TurndownService) {
            const available = await this.isAvailable();
            if (!available) {
                throw new Error('Lingo + Turndown libraries are not available');
            }
        }
        
        try {
            const mergedOptions = this.mergeOptions(options);
            
            // 画像マネージャーを初期化
            if (mergedOptions.extractImages) {
                this.createImageManager();
            }
            
            // ArrayBufferをBlobに変換してEPUBをパース
            const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
            
            // Lingo EPUBパーサーの警告メッセージを抑制
            const originalConsoleLog = console.log;
            const originalConsoleWarn = console.warn;
            console.log = (...args: any[]) => {
                // Lingoの内部メッセージをフィルタリング
                const message = args.join(' ');
                if (message.includes('No element with id') || 
                    message.includes('file was not exit in') ||
                    message.includes('return an empty uint8 array')) {
                    return; // これらのメッセージは無視
                }
                originalConsoleLog(...args);
            };
            console.warn = (...args: any[]) => {
                const message = args.join(' ');
                if (message.includes('No element with id') || 
                    message.includes('file was not exit in')) {
                    return;
                }
                originalConsoleWarn(...args);
            };
            
            let epub;
            try {
                epub = await this.initEpubFile!(blob as any);
            } finally {
                // コンソールメソッドを復元
                console.log = originalConsoleLog;
                console.warn = originalConsoleWarn;
            }
            
            // Turndownサービスを設定
            const turndownService = new this.TurndownService!({
                headingStyle: 'atx',
                hr: '---',
                bulletListMarker: '-',
                codeBlockStyle: 'fenced',
                fence: '```',
                emDelimiter: '*',
                strongDelimiter: '**',
                linkStyle: 'inlined'
            });
            
            // カスタムルールを追加
            this.addCustomTurndownRules(turndownService, mergedOptions);
            
            // メタデータを処理
            let metadata: EPUBMetadata | undefined;
            if (mergedOptions.includeMetadata) {
                metadata = this.normalizeLingoMetadata(epub.getMetadata());
            }
            
            // 各チャプターを処理
            const spine = epub.getSpine();
            const processedSections: string[] = [];
            
            for (let i = 0; i < spine.length; i++) {
                const spineItem = spine[i];
                if (!spineItem) continue;
                
                try {
                    // チャプターを読み込み（非同期の場合も対応）
                    let chapterData = epub.loadChapter(spineItem.id);
                    if (chapterData && typeof (chapterData as any).then === 'function') {
                        chapterData = await chapterData;
                    }
                    if (!chapterData || !(chapterData as any).html) continue;
                    
                    // HTMLをMarkdownに変換
                    const markdown = turndownService.turndown((chapterData as any).html);
                    
                    // セクション区切りを追加
                    if (mergedOptions.includeChapterNumbers) {
                        const separator = this.generateSectionSeparator(
                            mergedOptions.sectionSeparator || 'hr',
                            i + 1,
                            `Chapter ${i + 1}`
                        );
                        processedSections.push(separator + markdown);
                    } else {
                        processedSections.push(markdown);
                    }
                    
                } catch (chapterError) {
                    console.warn(`Failed to process chapter ${spineItem.id}:`, chapterError);
                    // チャプターの処理に失敗しても続行
                    continue;
                }
            }
            
            let content = processedSections.join('\n\n');
            
            // 保留中の画像を処理（blob URLから画像データを取得）
            if (mergedOptions.extractImages && (turndownService as any).pendingImages) {
                const pendingImages = (turndownService as any).pendingImages as Array<{ placeholder: string; src: string; alt: string }>;
                for (const pendingImage of pendingImages) {
                    try {
                        let imageData = pendingImage.src;
                        
                        // blob URLの場合は画像データを取得
                        if (pendingImage.src.startsWith('blob:')) {
                            try {
                                const response = await fetch(pendingImage.src);
                                const blob = await response.blob();
                                imageData = await this.blobToBase64(blob);
                            } catch (error) {
                                console.warn('Failed to fetch blob image:', error);
                                // blob取得に失敗した場合はURLをそのまま使用
                            }
                        }
                        
                        // ImageManagerに保存してプレースホルダーを取得
                        const realPlaceholder = this.imageManager!.storeImage(imageData, pendingImage.alt);
                        // 一時プレースホルダーを実際のプレースホルダーに置換
                        content = content.replace(pendingImage.placeholder, realPlaceholder);
                    } catch (error) {
                        console.warn('Failed to process image:', error);
                        // エラーの場合は画像をそのまま残す
                        content = content.replace(pendingImage.placeholder, `![${pendingImage.alt}](${pendingImage.src})`);
                    }
                }
            }
            
            // メタデータセクションを追加
            if (mergedOptions.includeMetadata && metadata) {
                const metadataSection = this.generateMetadataSection(metadata);
                content = metadataSection + content;
            }
            
            // 脚注を処理
            if (mergedOptions.footnoteStyle !== 'ignore') {
                content = this.processFootnotes(content, mergedOptions.footnoteStyle || 'reference');
            }
            
            const processingTime = performance.now() - startTime;
            
            const parseResult: EPUBParseResult = {
                content: this.normalizeMarkdown(content, true),
                processingTime,
                warnings: []
            };
            
            if (metadata) {
                parseResult.metadata = metadata;
            }
            
            return parseResult;
            
        } catch (error) {
            this.handleError(error, 'Lingo + Turndown conversion failed');
        }
    }
    
    /**
     * カスタムTurndownルールを追加
     */
    private addCustomTurndownRules(turndownService: TurndownService, options: EPUBParserOptions): void {
        // 画像の処理ルール
        if (options.extractImages && this.imageManager) {
            const pendingImages: Array<{ placeholder: string; src: string; alt: string }> = [];
            turndownService.addRule('images', {
                filter: 'img',
                replacement: (_content: string, node: Element) => {
                    const src = node.getAttribute('src') || '';
                    const alt = node.getAttribute('alt') || '';
                    // 一時的なプレースホルダーを生成（後でBase64に変換）
                    const tempPlaceholder = `[[TEMP_IMG_${pendingImages.length}]]`;
                    pendingImages.push({ placeholder: tempPlaceholder, src, alt });
                    return tempPlaceholder;
                }
            });
            // 後でpendingImagesを処理するためのプロパティとして保存
            (turndownService as any).pendingImages = pendingImages;
        } else if (options.extractImages) {
            turndownService.addRule('images', {
                filter: 'img',
                replacement: (_content: string, node: Element) => {
                    const src = node.getAttribute('src') || '';
                    const alt = node.getAttribute('alt') || '';
                    return `![${alt}](${src})`;
                }
            });
        }
        
        // PRE要素のコード判定ルール
        turndownService.addRule('smartPre', {
            filter: 'pre',
            replacement: (content: string) => {
                // PRE要素の内容がコードかどうかを判定
                if (isHtmlContentCode(content)) {
                    return '\n\n```\n' + content + '\n```\n\n';
                } else {
                    // コードではない場合は通常のテキストとして扱う
                    return '\n\n' + content + '\n\n';
                }
            }
        });
        
        // 脚注の処理ルール
        if (options.footnoteStyle === 'inline') {
            turndownService.addRule('footnotes', {
                filter: (node: Element) => {
                    return node.nodeName === 'A' && 
                           (node.getAttribute('epub:type') === 'noteref' || 
                            node.className.includes('footnote'));
                },
                replacement: (content: string, node: Element) => {
                    const href = node.getAttribute('href') || '';
                    if (href.startsWith('#')) {
                        return ` ^[${content}] `;
                    }
                    return `[${content}](${href})`;
                }
            });
        }
        
        // スタイル保持ルール
        if (options.preserveStyles) {
            turndownService.addRule('styled-spans', {
                filter: 'span',
                replacement: (content: string, node: Element) => {
                    const style = node.getAttribute('style') || '';
                    const className = node.getAttribute('class') || '';
                    
                    if (style.includes('font-weight: bold') || className.includes('bold')) {
                        return `**${content}**`;
                    } else if (style.includes('font-style: italic') || className.includes('italic')) {
                        return `*${content}*`;
                    } else if (style.includes('text-decoration: underline')) {
                        return `<u>${content}</u>`;
                    }
                    return content;
                }
            });
        }
        
        // テーブル強化ルール
        turndownService.addRule('tables', {
            filter: 'table',
            replacement: (_content: string, node: Element) => {
                const table = this.parseTable(node);
                return this.formatMarkdownTable(table);
            }
        });
    }
    
    /**
     * Lingoメタデータを正規化
     */
    private normalizeLingoMetadata(rawMetadata: LingoMetadata): EPUBMetadata {
        const result: EPUBMetadata = {};
        
        if (rawMetadata.title) result.title = rawMetadata.title;
        
        const creator = rawMetadata.creators?.[0];
        if (creator) result.author = creator.name;
        
        if (rawMetadata.publisher) result.publisher = rawMetadata.publisher;
        if (rawMetadata.language) result.language = rawMetadata.language;
        if (rawMetadata.description) result.description = rawMetadata.description;
        
        const isbn = rawMetadata.identifier?.find(id => 
            id.scheme === 'ISBN' || id.scheme?.toLowerCase() === 'isbn'
        );
        if (isbn) result.isbn = isbn.value;
        
        if (rawMetadata.date) result.publishDate = rawMetadata.date;
        if (rawMetadata.cover) result.coverImage = rawMetadata.cover;
        
        return result;
    }
    
    /**
     * BlobをBase64に変換
     */
    private async blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    /**
     * テーブルを解析
     */
    private parseTable(tableElement: Element): string[][] {
        const rows: string[][] = [];
        const tableRows = tableElement.querySelectorAll('tr');
        
        tableRows.forEach(row => {
            const cells: string[] = [];
            const cellElements = row.querySelectorAll('td, th');
            
            cellElements.forEach(cell => {
                cells.push(cell.textContent?.trim() || '');
            });
            
            if (cells.length > 0) {
                rows.push(cells);
            }
        });
        
        return rows;
    }
    
    /**
     * Markdownテーブルをフォーマット
     */
    private formatMarkdownTable(table: string[][]): string {
        if (table.length === 0) return '';
        
        const maxCols = Math.max(...table.map(row => row.length));
        const normalizedTable = table.map(row => {
            const normalizedRow = [...row];
            while (normalizedRow.length < maxCols) {
                normalizedRow.push('');
            }
            return normalizedRow;
        });
        
        let markdown = '';
        
        // ヘッダー行
        if (normalizedTable.length > 0) {
            const headerRow = normalizedTable[0];
            if (headerRow) {
                markdown += '| ' + headerRow.join(' | ') + ' |\n';
                markdown += '|' + ' --- |'.repeat(maxCols) + '\n';
            }
        }
        
        // データ行
        for (let i = 1; i < normalizedTable.length; i++) {
            const row = normalizedTable[i];
            if (row) {
                markdown += '| ' + row.join(' | ') + ' |\n';
            }
        }
        
        return markdown;
    }
    
    /**
     * 脚注を処理
     */
    private processFootnotes(content: string, style: 'inline' | 'reference'): string {
        if (style === 'inline') {
            // インライン形式はTurndownルールで処理済み
            return content;
        }
        
        // 参照形式の処理
        const footnoteRegex = /\^(\d+)\s*\^\s*/g;
        const footnotes: string[] = [];
        let footnoteIndex = 1;
        
        const processedContent = content.replace(footnoteRegex, (_match, num) => {
            const footnoteRef = `[^${footnoteIndex}]`;
            footnotes.push(`[^${footnoteIndex}]: 脚注${num}`);
            footnoteIndex++;
            return footnoteRef;
        });
        
        if (footnotes.length > 0) {
            return processedContent + '\n\n' + footnotes.join('\n');
        }
        
        return processedContent;
    }
    
}