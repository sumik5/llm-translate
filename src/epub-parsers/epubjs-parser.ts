// ==================== epub.js Parser ====================
// epub.js + turndownを使用したEPUBパーサー（ブラウザ対応）

import { BaseEPUBParser } from './base-epub-parser.js';
import type { 
    EPUBParserType,
    EPUBParserOptions,
    EPUBParseResult,
    EPUBMetadata
} from '../types/epub-parsers.js';

// Dynamic import types for browser-compatible libraries
type EPUBJSModule = {
    default: (data: Blob | ArrayBuffer | string) => EPUBBook;
};

type TurndownModule = {
    default: new (options?: any) => TurndownService;
};

interface TurndownService {
    turndown(html: string): string;
    addRule(key: string, rule: any): void;
}

interface EPUBBook {
    ready?: Promise<any>;
    opened?: Promise<any>;
    spine?: any;
    sections?: any;
    packaging?: {
        metadata: EPUBBookMetadata;
    };
    load?(url: string): Promise<any>;
    archive?: {
        getUrl?(path: string): Promise<string>;
    };
    resources?: {
        get?(path: string): any;
    };
}


interface EPUBBookMetadata {
    title?: string;
    creator?: string;
    publisher?: string;
    language?: string;
    description?: string;
    identifier?: string;
    pubdate?: string;
}

/**
 * epub.js + turndown パーサー（ブラウザ対応版）
 * EPUB表示に特化したライブラリでコンテンツ抽出
 */
export default class EPUBJSParser extends BaseEPUBParser {
    readonly type: EPUBParserType = 'epubjs';
    readonly name = 'epub.js + Turndown';
    readonly description = 'EPUB表示特化ライブラリ（ブラウザ対応）';
    
    private ePub: EPUBJSModule['default'] | null = null;
    private TurndownService: TurndownModule['default'] | null = null;
    
    /**
     * パーサーが利用可能かチェック
     */
    async isAvailable(): Promise<boolean> {
        try {
            if (this.ePub && this.TurndownService) return true;
            
            // Dynamic import with error handling
            const [epubModule, turndownModule] = await Promise.all([
                import('epubjs').catch(() => null) as Promise<EPUBJSModule | null>,
                import('turndown').catch(() => null) as Promise<TurndownModule | null>
            ]);
            
            if (epubModule && epubModule.default && 
                turndownModule && turndownModule.default) {
                this.ePub = epubModule.default;
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
        
        if (!this.ePub || !this.TurndownService) {
            const available = await this.isAvailable();
            if (!available) {
                throw new Error('epub.js + Turndown libraries are not available');
            }
        }
        
        try {
            const mergedOptions = this.mergeOptions(options);
            
            // 画像マネージャーを初期化
            if (mergedOptions.extractImages) {
                this.createImageManager();
            }
            
            // ArrayBufferをBlobに変換してepub.jsでEPUBを開く
            const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
            const book = this.ePub!(blob as any);
            
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
            
            // epub.jsのready/openedを待つ
            await book.ready || await book.opened;
            
            // メタデータを取得
            let metadata: EPUBMetadata | undefined;
            if (mergedOptions.includeMetadata && book.packaging) {
                metadata = this.normalizeEPUBJSMetadata(book.packaging.metadata);
            }
            
            // スパインからセクションを取得
            const spine = book.spine || book.sections;
            if (!spine) {
                throw new Error('No spine or sections found in EPUB');
            }
            
            const processedSections: string[] = [];
            
            // 各セクションを処理
            const sections = spine.items || spine.spineItems || [];
            for (let i = 0; i < sections.length; i++) {
                const item = sections[i];
                if (!item) continue;
                
                try {
                    // セクションの内容を取得
                    let htmlContent = '';
                    
                    // epub.jsの異なるAPIパターンに対応
                    if (item.document) {
                        // すでにロード済みの場合
                        htmlContent = item.document.documentElement?.innerHTML || '';
                    } else if (item.load && typeof item.load === 'function') {
                        // loadメソッドがある場合
                        const doc = await item.load();
                        htmlContent = doc?.documentElement?.innerHTML || '';
                    } else if (item.href || item.url) {
                        // hrefやurlがある場合は、book.loadを使用
                        const href = item.href || item.url;
                        if (book.load && typeof book.load === 'function') {
                            const doc = await book.load(href);
                            htmlContent = doc?.documentElement?.innerHTML || '';
                        }
                    }
                    
                    if (!htmlContent) continue;
                    
                    // スタイル要素を除去
                    htmlContent = this.removeStyleElements(htmlContent);
                    
                    // 画像を処理するために、HTML内のimgタグをdata URLに変換
                    // 一旦コメントアウトして別の方法を試す
                    // if (mergedOptions.extractImages) {
                    //     htmlContent = await this.processImagesInHtml(htmlContent, book);
                    // }
                    
                    // HTMLをMarkdownに変換
                    let markdown = turndownService.turndown(htmlContent);
                    
                    // 画像を処理（epub.jsでは画像リソースの直接取得が困難なため基本処理のみ）
                    if (mergedOptions.extractImages && this.imageManager) {
                        markdown = await this.processSimpleImagesInMarkdown(markdown);
                    }
                    
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
                    console.warn(`Failed to process chapter ${i}:`, chapterError);
                    // チャプターの処理に失敗しても続行
                    continue;
                }
            }
            
            let content = processedSections.join('\n\n');
            
            // 保留中の画像を処理
            if (mergedOptions.extractImages && (turndownService as any).pendingImages) {
                const pendingImages = (turndownService as any).pendingImages as Array<{ placeholder: string; src: string; alt: string }>;
                for (const pendingImage of pendingImages) {
                    try {
                        let imageData = pendingImage.src;
                        
                        // blob URLやdata URLの場合はそのまま使用
                        if (pendingImage.src.startsWith('data:') || pendingImage.src.startsWith('blob:')) {
                            // すでにBase64またはblob URLの場合はそのまま使用
                            imageData = pendingImage.src;
                        } else {
                            // 相対パスの場合、プレースホルダー画像を生成
                            const canvas = document.createElement('canvas');
                            canvas.width = 200;
                            canvas.height = 100;
                            const ctx = canvas.getContext('2d');
                            
                            if (ctx) {
                                // 背景を薄いグレーで塗りつぶし
                                ctx.fillStyle = '#f0f0f0';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                
                                // 枠を描画
                                ctx.strokeStyle = '#cccccc';
                                ctx.strokeRect(0, 0, canvas.width, canvas.height);
                                
                                // テキストを描画
                                ctx.fillStyle = '#666666';
                                ctx.font = '14px sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                
                                const text = pendingImage.alt || 'Image';
                                const maxWidth = canvas.width - 20;
                                
                                // テキストが長い場合は切り詰め
                                let displayText = text;
                                if (ctx.measureText(text).width > maxWidth) {
                                    displayText = text.substring(0, 20) + '...';
                                }
                                
                                ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);
                                
                                // 画像パスも小さく表示
                                ctx.font = '10px sans-serif';
                                ctx.fillStyle = '#999999';
                                const pathText = pendingImage.src.split('/').pop() || pendingImage.src;
                                ctx.fillText(pathText, canvas.width / 2, canvas.height - 10);
                                
                                imageData = canvas.toDataURL('image/png');
                            } else {
                                // canvasが使えない場合は最小限のPNG画像
                                imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
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
                content: this.normalizeMarkdown(content),
                processingTime,
                warnings: mergedOptions.extractImages ? 
                    ['epub.jsでは実際の画像データの取得が制限されるため、プレースホルダー画像を使用しています'] : []
            };
            
            if (metadata) {
                parseResult.metadata = metadata;
            }
            
            return parseResult;
            
        } catch (error) {
            this.handleError(error, 'epub.js + Turndown conversion failed');
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
                    // 一時的なプレースホルダーを生成（後で処理）
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
     * epub.jsメタデータを正規化
     */
    private normalizeEPUBJSMetadata(rawMetadata: EPUBBookMetadata): EPUBMetadata {
        const result: EPUBMetadata = {};
        
        if (rawMetadata.title) result.title = rawMetadata.title;
        if (rawMetadata.creator) result.author = rawMetadata.creator;
        if (rawMetadata.publisher) result.publisher = rawMetadata.publisher;
        if (rawMetadata.language) result.language = rawMetadata.language;
        if (rawMetadata.description) result.description = rawMetadata.description;
        if (rawMetadata.identifier) result.isbn = rawMetadata.identifier;
        if (rawMetadata.pubdate) result.publishDate = rawMetadata.pubdate;
        
        return result;
    }
    
    /**
     * 簡易画像処理（epub.jsでは制限あり）
     */
    private async processSimpleImagesInMarkdown(markdown: string): Promise<string> {
        // epub.jsでは画像リソースへの直接アクセスが制限されるため、
        // 基本的なMarkdown形式を維持し、警告を追加する程度に留める
        return markdown;
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
    
    /**
     * HTML内のスタイル要素を除去
     */
    private removeStyleElements(html: string): string {
        // DOMパーサーを使用してHTMLを解析
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // <style>要素を全て削除
        const styleElements = doc.querySelectorAll('style');
        styleElements.forEach(style => style.remove());
        
        // style属性を持つ要素からstyle属性を削除（オプション）
        // const elementsWithStyle = doc.querySelectorAll('[style]');
        // elementsWithStyle.forEach(elem => elem.removeAttribute('style'));
        
        // <link rel="stylesheet">も削除
        const linkElements = doc.querySelectorAll('link[rel="stylesheet"]');
        linkElements.forEach(link => link.remove());
        
        return doc.documentElement.innerHTML;
    }
    
    /**
     * Markdownを正規化
     */
    private normalizeMarkdown(content: string): string {
        return content
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+$/gm, '')
            .trim();
    }
}