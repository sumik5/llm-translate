// ==================== PDF.js Parser ====================
// PDF.jsライブラリを使用するPDFパーサー

import { BasePDFParser, PDFParserError } from './base-pdf-parser.js';
import { ImageManager } from '../image-manager.js';
import { isIndentedCode } from '../utils/code-detection.js';
import { postProcessMarkdown } from '../utils/markdown-post-processor.js';
import type { 
    PDFParserInfo, 
    PDFParserOptions,
    PDFPage,
    TextItem,
    LineItem,
    LineType,
    PDFViewport
} from '../types/pdf-parsers.js';
import type { ProcessingResult } from '../types/processors.js';
import type { FileInfo } from '../types/core.js';

/**
 * PDF.jsを使用するPDFパーサー
 * 既存のPDFProcessorの機能をそのまま移植
 */
export class PDFJSParser extends BasePDFParser {
    private imageCounter: number = 0;

    readonly info: PDFParserInfo = {
        type: 'pdfjs-dist',
        name: 'PDF.js',
        description: 'Mozilla PDF.jsライブラリを使用した標準パーサー',
        features: [
            'テキスト抽出',
            '画像抽出', 
            'レイアウト保持',
            'フォント情報取得',
            '高速処理'
        ],
        strengths: [
            '安定した動作',
            '幅広いPDF対応',
            'ブラウザ標準',
            '軽量'
        ],
        limitations: [
            'OCR未対応',
            'テーブル認識が基本的',
            '複雑なレイアウトで制限'
        ],
        isAvailable: true,
        requiresInternet: false
    };

    constructor() {
        super();
        this.imageManager = new ImageManager();
    }

    /**
     * PDF.jsの利用可能性をチェック
     */
    protected async checkAvailability(): Promise<void> {
        if (typeof window === 'undefined' || !window.pdfjsLib) {
            throw new PDFParserError(
                'PDF.js is not available. Make sure pdfjsLib is loaded.',
                'pdfjs-dist'
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
            const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pages: string[] = [];
            
            // 画像カウンターとImageManagerをリセット
            this.imageCounter = 0;
            this.imageManager = new ImageManager();
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // 画像抽出
                let pageImages: string[] = [];
                if (mergedOptions.extractImages) {
                    pageImages = await this.extractImagesFromPage(page, pageNum);
                }
                
                // テキスト処理
                const lines = this.groupTextByLines(textContent.items);
                let pageMarkdown = this.convertLinesToMarkdown(lines);
                
                // 画像をマークダウンに追加
                if (pageImages.length > 0) {
                    pageMarkdown += '\n\n' + pageImages.join('\n\n');
                }
                
                if (pageMarkdown.trim()) {
                    const separator = pageNum > 1 ? '\n\n' : '';
                    pages.push(separator + pageMarkdown);
                }
            }
            
            let content = pages.join('');
            
            // Markdown後処理を適用
            content = postProcessMarkdown(content, {
                codeThreshold: 0.4,
                autoDetectLanguage: true,
                removeEmptyCodeBlocks: true  // 空のコードブロックを除去
            });
            
            return this.createProcessingResult(content, fileInfo, {
                pageCount: pdf.numPages
            });
        }, 'PDF.js parsing failed');
    }

    /**
     * ページから画像を抽出
     */
    private async extractImagesFromPage(page: PDFPage, pageNum: number): Promise<string[]> {
        const images: string[] = [];
        
        try {
            const ops = await page.getOperatorList();
            const viewport = page.getViewport({ scale: 1.0 });
            
            for (let i = 0; i < ops.fnArray.length; i++) {
                // OPS.paintImageXObject = 85
                if (ops.fnArray[i] === 85) {
                    try {
                        const imgIndex = ops.argsArray[i]?.[0];
                        if (!imgIndex) continue;
                        
                        const img = await page.objs.get(imgIndex);
                        
                        if (img && (img.bitmap || img.data)) {
                            this.imageCounter++;
                            const imageData = await this.imageToBase64(img, viewport);
                            if (imageData) {
                                const altText = `Image ${this.imageCounter}`;
                                const placeholder = this.imageManager!.storeImage(imageData, altText);
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
        
        return images;
    }

    /**
     * 画像をBase64形式に変換
     */
    private async imageToBase64(img: any, _viewport: PDFViewport): Promise<string | null> {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) return null;
            
            if (img.bitmap) {
                // ImageBitmap
                canvas.width = img.bitmap.width;
                canvas.height = img.bitmap.height;
                ctx.drawImage(img.bitmap, 0, 0);
            } else if (img.data) {
                // Raw image data
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
     * テキストアイテムを行単位でグループ化
     */
    private groupTextByLines(items: TextItem[]): LineItem[][] {
        if (!items || items.length === 0) return [];
        
        const lineMap = new Map<number, LineItem[]>();
        const tolerance = 1.5;
        
        for (const item of items) {
            if (!item.str) continue;
            
            const y = Math.round((item.transform[5] || 0) * 10) / 10;
            let lineY = y;
            
            // 既存の行内の許容範囲を検索
            for (const [existingY] of lineMap) {
                if (Math.abs(existingY - y) < tolerance) {
                    lineY = existingY;
                    break;
                }
            }
            
            if (!lineMap.has(lineY)) {
                lineMap.set(lineY, []);
            }
            
            const lineItems = lineMap.get(lineY);
            if (lineItems) {
                lineItems.push({
                    text: item.str,
                    x: item.transform[4] || 0,
                    y: y,
                    fontSize: item.height || 0,
                    fontName: item.fontName,
                    width: item.width || 0
                });
            }
        }
        
        // Y座標で行をソートし、各行内でX座標でアイテムをソート
        const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])  // PDF Y座標は下から上
            .map(([_y, items]) => {
                const sortedItems = items.sort((a, b) => a.x - b.x);
                return this.combineLineItems(sortedItems);
            });
        
        return sortedLines;
    }

    /**
     * 行内のアイテムを結合
     */
    private combineLineItems(items: LineItem[]): LineItem[] {
        if (!items || items.length === 0) return [];
        
        const combined: LineItem[] = [];
        let currentItem: LineItem | null = null;
        
        for (const item of items) {
            if (!currentItem) {
                currentItem = { ...item };
                combined.push(currentItem);
                continue;
            }
            
            // アイテム間のギャップを計算
            const gap = item.x - (currentItem.x + (currentItem.width || 0));
            
            if (gap < 10) {
                // ギャップが小さい場合は結合
                if (gap > 3) {
                    currentItem.text += ' ';
                }
                currentItem.text += item.text;
                currentItem.width = (item.x + (item.width || 0)) - currentItem.x;
            } else {
                // ギャップが大きい場合は新しいアイテム
                currentItem = { ...item };
                combined.push(currentItem);
            }
        }
        
        return combined;
    }

    /**
     * 行をMarkdownに変換
     */
    private convertLinesToMarkdown(lines: LineItem[][]): string {
        let markdown = '';
        let previousLineType: LineType | '' = '';
        let currentParagraph: string[] = [];
        let previousY: number | null = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            
            let lineText = line.map(item => item.text).join('').trim();
            lineText = this.cleanPdfText(lineText);
            
            if (!lineText) {
                // 空行は段落区切りとして処理
                if (currentParagraph.length > 0) {
                    markdown += currentParagraph.join(' ') + '\n\n';
                    currentParagraph = [];
                }
                continue;
            }
            
            // 行間ギャップの計算
            const currentY = line[0]?.y || 0;
            const lineGap = previousY ? Math.abs(previousY - currentY) : 0;
            previousY = currentY;
            
            // 行タイプの検出
            const lineType = this.detectLineType(line || [], lineText);
            
            // 大きなギャップがある場合は段落を終了
            if (lineGap > 15 && currentParagraph.length > 0) {
                markdown += currentParagraph.join(' ') + '\n\n';
                currentParagraph = [];
            }
            
            // 行タイプに応じた処理
            switch (lineType) {
                case 'heading1':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += '# ' + lineText + '\n\n';
                    break;
                case 'heading2':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += '## ' + lineText + '\n\n';
                    break;
                case 'heading3':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += '### ' + lineText + '\n\n';
                    break;
                case 'bullet': {
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    const cleanBullet = lineText.replace(/^[•·▪▫◦‣⁃➢➣→\-*]\s*/, '');
                    markdown += '- ' + cleanBullet + '\n';
                    break;
                }
                case 'numbered':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += lineText + '\n';
                    break;
                case 'code':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += '```\n' + lineText + '\n```\n\n';
                    break;
                default: {
                    // 段落の処理
                    const startsWithCapital = /^[A-Z]/.test(lineText);
                    
                    if (startsWithCapital && previousLineType === 'paragraph' && 
                        currentParagraph.length > 0 && 
                        /[.!?。！？]$/.test(currentParagraph[currentParagraph.length - 1] || '')) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [lineText];
                    } else {
                        currentParagraph.push(lineText);
                    }
                    break;
                }
            }
            
            previousLineType = lineType;
        }
        
        // 残りの段落を追加
        if (currentParagraph.length > 0) {
            markdown += currentParagraph.join(' ') + '\n\n';
        }
        
        return this.cleanupMarkdown(markdown);
    }

    /**
     * Markdownのクリーンアップ
     */
    private cleanupMarkdown(markdown: string): string {
        // 過剰な空白の除去
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.replace(/[ \t]+/g, ' ');
        
        // リストの整形
        markdown = markdown.replace(/\n- /g, '\n\n- ');
        markdown = markdown.replace(/\n\n\n- /g, '\n\n- ');
        
        // 見出しの整形
        markdown = markdown.replace(/\n#/g, '\n\n#');
        markdown = markdown.replace(/\n\n\n#/g, '\n\n#');
        
        markdown = this.cleanPdfText(markdown);
        
        return markdown.trim();
    }

    /**
     * PDFテキストのクリーンアップ
     */
    private cleanPdfText(text: string): string {
        // 制御文字の除去
        // eslint-disable-next-line no-control-regex
        let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // 不正な見出しマーカーの除去
        cleaned = cleaned.replace(/^[=-]{3,}\s*$/gm, '');
        
        // 文字化け文字の除去
        cleaned = cleaned.replace(/[�]/g, '');
        
        // 行末空白の除去
        cleaned = cleaned.replace(/[ \t]+$/gm, '');
        
        return cleaned;
    }

    /**
     * 行タイプの検出
     */
    private detectLineType(lineItems: LineItem[], lineText: string): LineType {
        if (!lineItems || lineItems.length === 0) return 'paragraph';
        
        const maxFontSize = Math.max(...lineItems.map(item => item.fontSize || 0));
        const isBold = lineItems.some(item => item.fontName && item.fontName.toLowerCase().includes('bold'));
        const isShort = lineText.length < 60;
        const isAllCaps = lineText === lineText.toUpperCase() && /[A-Z]/.test(lineText);
        
        // コードパターン（改善版）
        if (lineText.startsWith('    ') || lineText.startsWith('\t')) {
            // インデントがあってもコードかどうかを詳細に判定
            if (isIndentedCode(lineText)) {
                return 'code';
            }
            // インデントがあるが通常の文章と判定された場合はparagraphとして扱う
        }
        
        // 見出しの検出
        if (/^(Chapter|Section|Part)\s+\d+/i.test(lineText) || 
            /^\d+\.\d+(\.\d+)*\s+[A-Z]/.test(lineText)) {
            return 'heading2';
        }
        
        if (maxFontSize > 18 && isShort) return 'heading1';
        if (maxFontSize > 15 && isShort) return 'heading2';
        if ((maxFontSize > 13 || isBold) && isShort) return 'heading3';
        
        if (isAllCaps && isShort) {
            if (lineText.length < 20) return 'heading2';
            return 'heading3';
        }
        
        // リストの検出
        const BULLET_PATTERNS = [
            /^[•·▪▫◦‣⁃]\s*/,
            /^[➢➣→➤]\s*/,
            /^[-–—]\s+/,
            /^\*\s+/,
            /^[▸▹►▻]\s*/
        ];
        
        const NUMBERED_PATTERNS = [
            /^\d+[.)]\s*/,
            /^[a-z][.)]\s+/i,
            /^[ivxIVX]+[.)]\s+/,
            /^\(\d+\)\s*/,
            /^\[\d+\]\s*/
        ];
        
        if (BULLET_PATTERNS.some(pattern => lineText.match(pattern))) return 'bullet';
        if (NUMBERED_PATTERNS.some(pattern => lineText.match(pattern))) return 'numbered';
        
        // 目次パターン
        if (/\.\s*\.\s*\.\s*\d+$/.test(lineText) || /\s{2,}\d+$/.test(lineText)) {
            return 'toc';
        }
        
        return 'paragraph';
    }
}

export default PDFJSParser;