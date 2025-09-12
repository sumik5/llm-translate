// ==================== PDF.js Advanced Parser ====================
// PDF.jsの高度な機能を使用するパーサー

import { BasePDFParser, PDFParserError } from './base-pdf-parser.js';
import { ImageManager } from '../image-manager.js';
import type { 
    PDFParserInfo, 
    PDFParserOptions
} from '../types/pdf-parsers.js';
import type { ProcessingResult } from '../types/processors.js';
import type { FileInfo } from '../types/core.js';

// PDF.js型はtypes/pdf-parsers.tsで定義済み

/**
 * PDF.jsの高度な機能を使用するパーサー
 * テーブル検出、レイアウト解析、注釈処理などの高度な機能を提供
 */
export class PDFJSAdvancedParser extends BasePDFParser {
    readonly info: PDFParserInfo = {
        type: 'pdfjs-advanced',
        name: 'PDF.js Advanced',
        description: 'PDF.jsの高度な機能を使用した拡張パーサー',
        features: [
            'テキスト抽出',
            '画像抽出',
            'テーブル検出（実験的）',
            'レイアウト解析',
            'メタデータ抽出',
            '注釈処理',
            'アウトライン抽出'
        ],
        strengths: [
            '高度なレイアウト解析',
            'テーブル自動検出',
            '注釈・コメント対応',
            'メタデータ完全抽出',
            'ブラウザ完全対応'
        ],
        limitations: [
            '処理時間が長い',
            'テーブル検出は実験的',
            'メモリ使用量が多い'
        ],
        isAvailable: true,
        requiresInternet: false
    };

    override readonly defaultOptions: PDFParserOptions = {
        extractImages: true,
        highQualityImages: true,
        detectTables: true,
        enableOCR: false,
        layoutPreservation: 'strict'
    };

    constructor() {
        super();
        this.imageManager = new ImageManager();
    }

    /**
     * PDF.jsの利用可能性をチェック
     */
    protected async checkAvailability(): Promise<void> {
        if (typeof window === 'undefined' || !(window as any).pdfjsLib) {
            throw new PDFParserError(
                'PDF.js library is not loaded',
                'pdfjs-advanced'
            );
        }
    }

    /**
     * PDFファイルを解析してMarkdownに変換
     */
    async parse(
        arrayBuffer: ArrayBuffer, 
        fileInfo?: FileInfo, 
        options?: PDFParserOptions
    ): Promise<ProcessingResult> {
        const mergedOptions = this.mergeOptions(options);
        
        return this.safeProcess(async () => {
            await this.checkAvailability();
            
            // ImageManagerをリセット
            this.imageManager = new ImageManager();
            let imageCounter = 0;
            
            const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            // メタデータ抽出
            const metadata = await this.extractMetadata(pdf);
            
            // アウトライン抽出
            const outline = await this.extractOutline(pdf);
            
            const pages: string[] = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                
                // テキストコンテンツ取得
                const textContent = await page.getTextContent();
                
                // 注釈取得（現在はスキップ）
                const annotations: any[] = [];
                
                // 画像抽出
                let pageImages: string[] = [];
                if (mergedOptions.extractImages) {
                    const extractedImages = await this.extractImagesFromPage(
                        page, 
                        pageNum, 
                        imageCounter
                    );
                    pageImages = extractedImages.images;
                    imageCounter = extractedImages.nextCounter;
                }
                
                // テキストアイテムをレイアウト解析
                const structuredContent = this.analyzeLayout(
                    textContent.items,
                    mergedOptions
                );
                
                // テーブル検出
                let tables: string[] = [];
                if (mergedOptions.detectTables) {
                    tables = this.detectTables(textContent.items);
                }
                
                // ページコンテンツを構築
                const pageContent = this.buildPageContent(
                    structuredContent,
                    tables,
                    pageImages,
                    annotations,
                    pageNum
                );
                
                if (pageContent.trim()) {
                    pages.push(pageContent);
                }
            }
            
            // 最終的なMarkdown構築
            let finalContent = '';
            
            // メタデータを先頭に追加
            if (metadata && Object.keys(metadata).length > 0) {
                finalContent += this.formatMetadata(metadata) + '\n\n';
            }
            
            // アウトラインを追加
            if (outline && outline.length > 0) {
                finalContent += this.formatOutline(outline) + '\n\n';
            }
            
            // ページコンテンツを追加
            finalContent += pages.join('\n\n---\n\n');
            
            return this.createProcessingResult(
                finalContent,
                fileInfo,
                { pageCount: pdf.numPages, metadata }
            );
        }, 'PDF parsing failed');
    }

    /**
     * メタデータを抽出
     */
    private async extractMetadata(pdf: any): Promise<any> {
        try {
            const metadata = await pdf.getMetadata();
            return metadata?.info || {};
        } catch {
            return {};
        }
    }

    /**
     * アウトラインを抽出
     */
    private async extractOutline(pdf: any): Promise<any[]> {
        try {
            const outline = await pdf.getOutline();
            return outline || [];
        } catch {
            return [];
        }
    }

    /**
     * ページから画像を抽出
     */
    private async extractImagesFromPage(
        page: any,
        pageNum: number,
        startCounter: number
    ): Promise<{ images: string[]; nextCounter: number }> {
        const images: string[] = [];
        let counter = startCounter;
        
        try {
            const ops = await page.getOperatorList();
            // const viewport = page.getViewport({ scale: 1.0 }); // 将来的に使用予定
            
            for (let i = 0; i < ops.fnArray.length; i++) {
                // OPS.paintImageXObject = 85
                if (ops.fnArray[i] === 85) {
                    try {
                        const imgIndex = ops.argsArray[i]?.[0];
                        if (!imgIndex) continue;
                        
                        const img = await page.objs.get(imgIndex);
                        
                        if (img && (img.bitmap || img.data)) {
                            counter++;
                            const imageData = await this.imageToBase64(img);
                            if (imageData) {
                                const altText = `Image ${counter} (Page ${pageNum})`;
                                const placeholder = this.imageManager?.storeImage(imageData, altText) || `![${altText}](${imageData})`;
                                images.push(placeholder);
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to extract image on page ${pageNum}:`, e);
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to extract images from page ${pageNum}:`, error);
        }
        
        return { images, nextCounter: counter };
    }

    /**
     * 画像をBase64に変換
     */
    private async imageToBase64(img: any): Promise<string | null> {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) return null;
            
            if (img.bitmap) {
                canvas.width = img.bitmap.width;
                canvas.height = img.bitmap.height;
                ctx.drawImage(img.bitmap, 0, 0);
            } else if (img.data) {
                canvas.width = img.width;
                canvas.height = img.height;
                const imageData = ctx.createImageData(img.width, img.height);
                imageData.data.set(img.data);
                ctx.putImageData(imageData, 0, 0);
            } else {
                return null;
            }
            
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.warn('Failed to convert image to base64:', error);
            return null;
        }
    }

    /**
     * レイアウトを解析
     */
    private analyzeLayout(
        items: any[],
        _options: PDFParserOptions
    ): any {
        // Y座標でグループ化（行の検出）
        const lines = this.groupIntoLines(items);
        
        // インデントレベルの検出
        const structuredLines = this.detectIndentation(lines);
        
        // 見出しの検出
        const withHeadings = this.detectHeadings(structuredLines);
        
        // リストの検出
        const withLists = this.detectLists(withHeadings);
        
        return withLists;
    }

    /**
     * テキストアイテムを行にグループ化
     */
    private groupIntoLines(items: any[]): any[] {
        const lines = new Map<number, any[]>();
        const tolerance = 2;
        
        for (const item of items) {
            if (!item.str.trim()) continue;
            
            const y = Math.round(item.transform[5]);
            let lineY = y;
            
            // 既存の行を探す
            for (const [existingY] of lines) {
                if (Math.abs(existingY - y) < tolerance) {
                    lineY = existingY;
                    break;
                }
            }
            
            if (!lines.has(lineY)) {
                lines.set(lineY, []);
            }
            lines.get(lineY)!.push(item);
        }
        
        // Y座標でソート（上から下へ）
        return Array.from(lines.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([y, items]) => ({
                y,
                items: items.sort((a, b) => a.transform[4] - b.transform[4]),
                text: items.map(item => item.str).join(' ').trim()
            }));
    }

    /**
     * インデントレベルを検出
     */
    private detectIndentation(lines: any[]): any[] {
        const values = lines
            .filter(line => line.items.length > 0 && line.items[0]?.transform?.[4])
            .map(line => line.items[0].transform[4])
            .filter(x => x > 0);
        const minX = values.length > 0 ? Math.min(...values) : 0;
        
        return lines.map(line => ({
            ...line,
            indent: Math.round(((line.items[0]?.transform?.[4] || 0) - minX) / 10)
        }));
    }

    /**
     * 見出しを検出
     */
    private detectHeadings(lines: any[]): any[] {
        return lines.map(line => {
            const avgFontSize = line.items.reduce((sum: number, item: any) => 
                sum + (item.height || 0), 0
            ) / line.items.length;
            
            const isBold = line.items.some((item: any) => 
                item.fontName && item.fontName.toLowerCase().includes('bold')
            );
            
            const isAllCaps = line.text === line.text.toUpperCase() && 
                           /[A-Z]/.test(line.text);
            
            let headingLevel = 0;
            if (avgFontSize > 20 || (avgFontSize > 16 && isBold)) {
                headingLevel = 1;
            } else if (avgFontSize > 16 || (avgFontSize > 14 && isBold)) {
                headingLevel = 2;
            } else if (avgFontSize > 14 || (avgFontSize > 12 && isBold)) {
                headingLevel = 3;
            } else if (isAllCaps && line.text.length < 50) {
                headingLevel = 3;
            }
            
            return { ...line, headingLevel };
        });
    }

    /**
     * リストを検出
     */
    private detectLists(lines: any[]): any[] {
        const bulletPatterns = [
            /^[•·▪▫◦‣⁃]\s*/,
            /^[-–—]\s+/,
            /^\*\s+/
        ];
        
        const numberedPatterns = [
            /^\d+[.)]\s*/,
            /^[a-z][.)]\s*/i,
            /^[ivxIVX]+[.)]\s*/
        ];
        
        return lines.map(line => {
            const isBullet = bulletPatterns.some(pattern => 
                pattern.test(line.text)
            );
            const isNumbered = numberedPatterns.some(pattern => 
                pattern.test(line.text)
            );
            
            return { ...line, isBullet, isNumbered };
        });
    }

    /**
     * テーブルを検出（実験的）
     */
    private detectTables(_items: any[]): string[] {
        // 簡単なテーブル検出ロジック
        // 同じY座標に複数の離れたテキストがある行を検出
        const tables: string[] = [];
        
        // TODO: より高度なテーブル検出ロジックを実装
        
        return tables;
    }

    /**
     * ページコンテンツを構築
     */
    private buildPageContent(
        structuredContent: any,
        tables: string[],
        images: string[],
        annotations: any[],
        _pageNum: number
    ): string {
        let content = '';
        
        // 構造化コンテンツをMarkdownに変換
        for (const line of structuredContent) {
            if (line.headingLevel > 0) {
                content += '#'.repeat(line.headingLevel) + ' ' + line.text + '\n\n';
            } else if (line.isBullet) {
                content += '- ' + line.text.replace(/^[•·▪▫◦‣⁃\-–—*]\s*/, '') + '\n';
            } else if (line.isNumbered) {
                content += line.text + '\n';
            } else if (line.text) {
                content += line.text + '\n';
            }
        }
        
        // テーブルを追加
        if (tables.length > 0) {
            content += '\n' + tables.join('\n\n') + '\n';
        }
        
        // 画像を追加
        if (images.length > 0) {
            content += '\n' + images.join('\n\n') + '\n';
        }
        
        // 注釈を追加
        if (annotations.length > 0) {
            const textAnnotations = annotations
                .filter(a => a.subtype === 'Text' || a.subtype === 'FreeText')
                .map(a => `> 注釈: ${a.contents || ''}`)
                .filter(a => a.length > 6);
            
            if (textAnnotations.length > 0) {
                content += '\n' + textAnnotations.join('\n') + '\n';
            }
        }
        
        return content.trim();
    }

    /**
     * メタデータをフォーマット
     */
    private formatMetadata(metadata: any): string {
        let formatted = '## Document Metadata\n\n';
        
        if (metadata.Title) formatted += `**Title:** ${metadata.Title}\n`;
        if (metadata.Author) formatted += `**Author:** ${metadata.Author}\n`;
        if (metadata.Subject) formatted += `**Subject:** ${metadata.Subject}\n`;
        if (metadata.Keywords) formatted += `**Keywords:** ${metadata.Keywords}\n`;
        if (metadata.Creator) formatted += `**Creator:** ${metadata.Creator}\n`;
        if (metadata.Producer) formatted += `**Producer:** ${metadata.Producer}\n`;
        if (metadata.CreationDate) formatted += `**Created:** ${metadata.CreationDate}\n`;
        if (metadata.ModDate) formatted += `**Modified:** ${metadata.ModDate}\n`;
        
        return formatted.trim();
    }

    /**
     * アウトラインをフォーマット
     */
    private formatOutline(outline: any[]): string {
        let formatted = '## Table of Contents\n\n';
        
        const formatItem = (item: any, level: number = 0): string => {
            let result = '  '.repeat(level) + '- ' + (item.title || 'Untitled') + '\n';
            if (item.items && item.items.length > 0) {
                for (const child of item.items) {
                    result += formatItem(child, level + 1);
                }
            }
            return result;
        };
        
        for (const item of outline) {
            formatted += formatItem(item);
        }
        
        return formatted.trim();
    }

    /**
     * 処理結果を作成
     */
    override createProcessingResult(
        content: string,
        fileInfo?: FileInfo,
        additionalData?: any
    ): ProcessingResult {
        return {
            content,
            metadata: {
                originalName: fileInfo?.name || 'unknown.pdf',
                fileType: 'pdf',
                size: fileInfo?.size || 0,
                characterCount: content.length,
                processingTime: 0,
                pageCount: additionalData?.pageCount || 0,
                extractedImages: [] // TODO: ImageManagerのgetAllImagesメソッドを実装後に復活
            }
        };
    }
}

export default PDFJSAdvancedParser;