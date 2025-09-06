// ==================== UnPDF Parser ====================
// unpdfライブラリを使用したPDFパーサー

import { BasePDFParser, PDFParserError } from './base-pdf-parser.js';
import { ImageManager } from '../image-manager.js';
import type { 
    PDFParserInfo, 
    PDFParserOptions
} from '../types/pdf-parsers.js';
import type { ProcessingResult } from '../types/processors.js';
import type { FileInfo } from '../types/core.js';

// unpdfのインポート
import { 
    extractText, 
    getMeta,
    getDocumentProxy
} from 'unpdf';

/**
 * unpdfライブラリを使用するPDFパーサー
 * 軽量で高速、ブラウザ完全対応
 */
export class UnPDFParser extends BasePDFParser {
    readonly info: PDFParserInfo = {
        type: 'unpdf',
        name: 'UnPDF',
        description: '軽量・高速なブラウザ対応PDFパーサー',
        features: [
            'テキスト抽出',
            'メタデータ取得',
            'ページ別処理',
            '高速処理',
            'AI向け最適化'
        ],
        strengths: [
            '軽量（ゼロ依存）',
            '高速処理',
            'ブラウザ完全対応',
            'シンプルなAPI',
            'モダンなコード'
        ],
        limitations: [
            '画像抽出未対応',
            'テーブル検出は基本的',
            '複雑なレイアウトの制限',
            'OCR未対応'
        ],
        isAvailable: true,
        requiresInternet: false
    };

    override readonly defaultOptions: PDFParserOptions = {
        extractImages: true,
        highQualityImages: false,
        detectTables: false,
        enableOCR: false,
        layoutPreservation: 'moderate'
    };

    constructor() {
        super();
        this.imageManager = new ImageManager();
    }

    /**
     * unpdfの利用可能性をチェック
     */
    protected async checkAvailability(): Promise<void> {
        try {
            // unpdfモジュールが利用可能かチェック
            if (!extractText || !getDocumentProxy) {
                throw new PDFParserError(
                    'UnPDF library is not available',
                    'unpdf'
                );
            }
        } catch (error) {
            throw new PDFParserError(
                'UnPDF library is not loaded properly',
                'unpdf',
                error instanceof Error ? error : undefined
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
            
            // PDFドキュメントを取得
            const pdfData = new Uint8Array(arrayBuffer);
            const pdf = await getDocumentProxy(pdfData);
            
            // メタデータ取得
            const metadata = await this.extractMetadata(pdf);
            
            // テキスト抽出（ページ別）
            const { text: pageTexts, totalPages } = await extractText(pdf, { 
                mergePages: false 
            });
            
            // 画像抽出（オプション）
            let images: string[] = [];
            if (mergedOptions.extractImages) {
                images = await this.extractImagesFromPDF(pdf);
            }
            
            // 各ページのテキストをMarkdownに変換
            const markdownPages: string[] = [];
            if (Array.isArray(pageTexts)) {
                for (let i = 0; i < pageTexts.length; i++) {
                    const pageText = pageTexts[i];
                    if (pageText) {
                        const pageContent = this.convertToMarkdown(
                            pageText, 
                            i + 1,
                            mergedOptions
                        );
                        if (pageContent.trim()) {
                            markdownPages.push(pageContent);
                        }
                    }
                }
            }
            
            // 最終的なMarkdownを構築
            let finalContent = '';
            
            // メタデータを追加
            if (metadata && Object.keys(metadata).length > 0) {
                finalContent += this.formatMetadata(metadata) + '\n\n';
            }
            
            // ページコンテンツを追加
            finalContent += markdownPages.join('\n\n---\n\n');
            
            // 画像を追加
            if (images.length > 0) {
                finalContent += '\n\n## Extracted Images\n\n';
                finalContent += images.join('\n\n');
            }
            
            return this.createProcessingResult(
                finalContent,
                fileInfo,
                { pageCount: totalPages, metadata }
            );
        }, 'UnPDF parsing failed');
    }

    /**
     * メタデータを抽出
     */
    private async extractMetadata(pdf: any): Promise<any> {
        try {
            const meta = await getMeta(pdf);
            return meta || {};
        } catch (error) {
            console.warn('Failed to extract metadata:', error);
            return {};
        }
    }

    /**
     * PDFから画像を抽出
     */
    private async extractImagesFromPDF(_pdf: any): Promise<string[]> {
        // unpdfでは画像抽出APIが現在利用できないため、空配列を返す
        // 将来のバージョンで対応予定
        return [];
    }


    /**
     * テキストをMarkdownに変換
     */
    private convertToMarkdown(
        text: string | undefined, 
        pageNum: number,
        options: PDFParserOptions
    ): string {
        if (!text || !text.trim()) return '';
        
        let markdown = `## Page ${pageNum}\n\n`;
        
        // 基本的なテキスト処理
        const lines = text.split('\n');
        const processedLines: string[] = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                processedLines.push('');
                continue;
            }
            
            // 見出しの検出（大文字で始まり短い行）
            if (this.isLikelyHeading(trimmedLine)) {
                processedLines.push(`### ${trimmedLine}`);
            }
            // リストアイテムの検出
            else if (this.isLikelyListItem(trimmedLine)) {
                processedLines.push(`- ${trimmedLine.replace(/^[•·▪▫◦‣⁃\-*]\s*/, '')}`);
            }
            // 番号付きリストの検出
            else if (/^\d+[.)]\s/.test(trimmedLine)) {
                processedLines.push(trimmedLine);
            }
            // 通常のテキスト
            else {
                processedLines.push(trimmedLine);
            }
        }
        
        // 連続する空行を削減
        markdown += processedLines.join('\n').replace(/\n{3,}/g, '\n\n');
        
        // レイアウト保持オプションに応じた処理
        if (options.layoutPreservation === 'strict') {
            // 厳密なレイアウト保持（改行をそのまま維持）
            return markdown;
        } else if (options.layoutPreservation === 'loose') {
            // 緩いレイアウト保持（段落を結合）
            return this.mergeParagraphs(markdown);
        } else {
            // 中程度のレイアウト保持
            return this.cleanNormalizedMarkdown(markdown);
        }
    }

    /**
     * 見出しの可能性があるかチェック
     */
    private isLikelyHeading(text: string): boolean {
        // 短くて、全て大文字、または数字で始まる
        return (
            text.length < 60 &&
            (text === text.toUpperCase() && /[A-Z]/.test(text)) ||
            /^\d+\.\d+/.test(text) ||
            /^(Chapter|Section|Part)\s+\d+/i.test(text)
        );
    }

    /**
     * リストアイテムの可能性があるかチェック
     */
    private isLikelyListItem(text: string): boolean {
        const bulletPatterns = [
            /^[•·▪▫◦‣⁃]\s*/,
            /^[-–—]\s+/,
            /^\*\s+/
        ];
        
        return bulletPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Markdownを正規化
     */
    private cleanNormalizedMarkdown(markdown: string): string {
        // 連続する空行を削減
        let cleaned = markdown.replace(/\n{3,}/g, '\n\n');
        // 過剰な空白を削除
        cleaned = cleaned.replace(/[ \t]+/g, ' ');
        // 行末の空白を削除
        cleaned = cleaned.replace(/[ \t]+$/gm, '');
        return cleaned.trim();
    }

    /**
     * 段落を結合
     */
    private mergeParagraphs(markdown: string): string {
        const lines = markdown.split('\n');
        const merged: string[] = [];
        let currentParagraph: string[] = [];
        
        for (const line of lines) {
            if (line.startsWith('#') || line.startsWith('-') || /^\d+[.)]\s/.test(line) || !line.trim()) {
                if (currentParagraph.length > 0) {
                    merged.push(currentParagraph.join(' '));
                    currentParagraph = [];
                }
                merged.push(line);
            } else {
                currentParagraph.push(line);
            }
        }
        
        if (currentParagraph.length > 0) {
            merged.push(currentParagraph.join(' '));
        }
        
        return merged.join('\n');
    }

    /**
     * メタデータをフォーマット
     */
    private formatMetadata(metadata: any): string {
        let formatted = '## Document Information\n\n';
        
        if (metadata.info) {
            const info = metadata.info;
            if (info.Title) formatted += `**Title:** ${info.Title}\n`;
            if (info.Author) formatted += `**Author:** ${info.Author}\n`;
            if (info.Subject) formatted += `**Subject:** ${info.Subject}\n`;
            if (info.Keywords) formatted += `**Keywords:** ${info.Keywords}\n`;
            if (info.Creator) formatted += `**Creator:** ${info.Creator}\n`;
            if (info.Producer) formatted += `**Producer:** ${info.Producer}\n`;
            if (info.CreationDate) formatted += `**Created:** ${info.CreationDate}\n`;
            if (info.ModDate) formatted += `**Modified:** ${info.ModDate}\n`;
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
                extractedImages: [] // TODO: ImageManagerから取得
            }
        };
    }
}

export default UnPDFParser;