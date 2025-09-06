// ==================== Built-in PDF Parser ====================
// オリジナルのPDF.jsベース内蔵パーサー

import { BasePDFParser, PDFParserError } from './base-pdf-parser.js';
import { ImageManager } from '../image-manager.js';
import type { 
    PDFParserInfo, 
    PDFParserOptions
} from '../types/pdf-parsers.js';
import type { ProcessingResult } from '../types/processors.js';
import type { FileInfo } from '../types/core.js';

interface LineItem {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontName: string;
    width: number;
}

type LineType = 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'code' | 'toc' | 'paragraph';

/**
 * オリジナルのBuilt-in PDFパーサー
 * PDF.jsを使用した基本的なPDF処理
 */
export class BuiltInParser extends BasePDFParser {
    private imageCounter: number;
    
    readonly info: PDFParserInfo = {
        type: 'builtin',
        name: 'Built-in Parser',
        description: '標準内蔵PDFパーサー（安定版）',
        features: [
            'テキスト抽出',
            '画像抽出',
            'レイアウト保持',
            '見出し検出',
            'リスト検出'
        ],
        strengths: [
            '安定した動作',
            '画像処理対応',
            'バランスの取れた処理',
            '実績のある実装'
        ],
        limitations: [
            'OCR未対応',
            'テーブル検出は基本的'
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
        this.imageCounter = 0;
    }

    /**
     * PDF.jsの利用可能性をチェック
     */
    protected async checkAvailability(): Promise<void> {
        if (typeof window === 'undefined' || !(window as any).pdfjsLib) {
            throw new PDFParserError(
                'PDF.js is not available. Make sure pdfjsLib is loaded.',
                'builtin'
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
                
                // ページから画像を抽出
                let pageImages: string[] = [];
                if (mergedOptions.extractImages) {
                    pageImages = await this.extractImagesFromPage(page, pageNum);
                }
                
                // Y位置に基づいてテキストアイテムを行にグループ化
                const lines = this.groupTextByLines(textContent.items);
                
                // 行をマークダウンに変換
                let pageMarkdown = this.convertLinesToMarkdown(lines);
                
                // 画像をマークダウンに追加
                if (pageImages.length > 0) {
                    pageMarkdown += '\n\n';
                    pageMarkdown += pageImages.join('\n\n');
                }
                
                if (pageMarkdown.trim()) {
                    const separator = pageNum > 1 ? '\n\n' : '';
                    pages.push(separator + pageMarkdown);
                }
            }
            
            const content = pages.join('');
            return this.createProcessingResult(content, fileInfo, { pageCount: pdf.numPages });
        }, 'Built-in PDF parsing failed');
    }
    
    private async extractImagesFromPage(page: any, pageNum: number): Promise<string[]> {
        const images: string[] = [];
        try {
            const ops = await page.getOperatorList();
            
            for (let i = 0; i < ops.fnArray.length; i++) {
                // OPS.paintImageXObject = 85
                if (ops.fnArray[i] === 85) {
                    try {
                        const imgIndex = ops.argsArray[i]?.[0];
                        if (!imgIndex) continue;
                        const img = await page.objs.get(imgIndex);
                        
                        if (img && (img.bitmap || img.data)) {
                            this.imageCounter++;
                            const imageData = await this.imageToBase64(img);
                            if (imageData) {
                                const altText = `Image ${this.imageCounter}`;
                                // ImageManagerを使用してプレースホルダーを作成
                                const placeholder = this.imageManager?.storeImage(imageData, altText) || `[[IMG_${this.imageCounter}]]`;
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
    
    private groupTextByLines(items: any[]): LineItem[][] {
        if (!items || items.length === 0) return [];
        
        const lineMap = new Map<number, LineItem[]>();
        const tolerance = 1.5;
        
        for (const item of items) {
            if (!item.str) continue;
            
            const y = Math.round((item.transform[5] || 0) * 10) / 10;
            let lineY = y;
            
            // 既存の行を探す
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
        
        // Y位置でソート（上から下へ）
        const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])  // PDF Y座標は下から上
            .map(([_y, items]) => {
                // 各行のアイテムをX位置でソート
                const sortedItems = items.sort((a, b) => a.x - b.x);
                
                // 適切なスペーシングでアイテムを結合
                const combinedLine = this.combineLineItems(sortedItems);
                return combinedLine;
            });
        
        return sortedLines;
    }
    
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
            
            // ギャップが小さい場合はテキストを結合
            if (gap < 10) {
                // 適切なスペーシングを追加
                if (gap > 3) {
                    currentItem.text += ' ';
                }
                currentItem.text += item.text;
                currentItem.width = (item.x + (item.width || 0)) - currentItem.x;
            } else {
                // ギャップが大きい場合は新しいアイテムを開始
                currentItem = { ...item };
                combined.push(currentItem);
            }
        }
        
        return combined;
    }
    
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
                // 空行は段落の区切りを示す可能性がある
                if (currentParagraph.length > 0) {
                    markdown += currentParagraph.join(' ') + '\n\n';
                    currentParagraph = [];
                }
                continue;
            }
            
            // 段落検出のための行間ギャップを計算
            const currentY = line[0]?.y || 0;
            const lineGap = previousY ? Math.abs(previousY - currentY) : 0;
            previousY = currentY;
            
            // フォーマットに基づいて行タイプを検出
            const lineType = this.detectLineType(line || [], lineText);
            
            // 大きなギャップがある場合、現在の段落を終了
            if (lineGap > 15 && currentParagraph.length > 0) {
                markdown += currentParagraph.join(' ') + '\n\n';
                currentParagraph = [];
            }
            
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
                    // 箇条書きマーカーをクリーン
                    const cleanBullet = lineText.replace(/^[•·▪▫◦‣⁃➢➣→\-*]\s*/, '');
                    markdown += '- ' + cleanBullet + '\n';
                    break;
                }
                case 'numbered': {
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += lineText + '\n';
                    break;
                }
                case 'code':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    markdown += '```\n' + lineText + '\n```\n\n';
                    break;
                default: {
                    const startsWithCapital = /^[A-Z]/.test(lineText);
                    
                    // 句読点の後の大文字で始まる場合、新しい段落の可能性
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
        
        // マークダウンをクリーンアップ
        return this.cleanupMarkdown(markdown);
    }
    
    private cleanupMarkdown(markdown: string): string {
        // 過剰な空白を削除
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.replace(/[ \t]+/g, ' ');
        
        // リストフォーマットを修正
        markdown = markdown.replace(/\n- /g, '\n\n- ');
        markdown = markdown.replace(/\n\n\n- /g, '\n\n- ');
        
        // 見出し周りの適切なスペーシングを確保
        markdown = markdown.replace(/\n#/g, '\n\n#');
        markdown = markdown.replace(/\n\n\n#/g, '\n\n#');
        
        markdown = this.cleanPdfText(markdown);
        
        // トリムして返す
        return markdown.trim();
    }
    
    private cleanPdfText(text: string): string {
        // 制御文字を除去（タブと改行以外）
        // eslint-disable-next-line no-control-regex
        let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // 不正な見出しマーカーを除去（行頭の = や - の連続）
        cleaned = cleaned.replace(/^[=-]{3,}\s*$/gm, '');
        
        // PDFの文字化けしやすい文字を修正
        cleaned = cleaned.replace(/[�]/g, '');
        
        // 行末の空白を削除
        cleaned = cleaned.replace(/[ \t]+$/gm, '');
        
        return cleaned;
    }
    
    private detectLineType(lineItems: LineItem[], lineText: string): LineType {
        if (!lineItems || lineItems.length === 0) return 'paragraph';
        
        const maxFontSize = Math.max(...lineItems.map(item => item.fontSize || 0));
        const isBold = lineItems.some(item => item.fontName && item.fontName.toLowerCase().includes('bold'));
        const isShort = lineText.length < 60;
        const isAllCaps = lineText === lineText.toUpperCase() && /[A-Z]/.test(lineText);
        
        // コードライクなパターンをチェック
        if (lineText.startsWith('    ') || lineText.startsWith('\t')) {
            return 'code';
        }
        
        // 複数の基準で見出しを検出
        // Chapter/Sectionパターン
        if (/^(Chapter|Section|Part)\s+\d+/i.test(lineText) || 
            /^\d+\.\d+(\.\d+)*\s+[A-Z]/.test(lineText)) {
            return 'heading2';
        }
        
        // 大きなフォントサイズまたは太字の短いテキストは見出しの可能性が高い
        if (maxFontSize > 18 && isShort) return 'heading1';
        if (maxFontSize > 15 && isShort) return 'heading2';
        if ((maxFontSize > 13 || isBold) && isShort) return 'heading3';
        
        // 全て大文字の短いテキストは見出しの可能性が高い
        if (isAllCaps && isShort) {
            if (lineText.length < 20) return 'heading2';
            return 'heading3';
        }
        
        // パターンを使用してリストを検出
        const BULLET_PATTERNS = [
            /^[•·▪▫◦‣⁃]\s*/,
            /^[➢➣→➤]\s*/,
            /^[-–—]\s+/,  // 各種ダッシュ
            /^\*\s+/,
            /^[▸▹►▻]\s*/
        ];
        
        const NUMBERED_PATTERNS = [
            /^\d+[.)]\s*/,
            /^[a-z][.)]\s+/i,
            /^[ivxIVX]+[.)]\s+/,  // ローマ数字
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
    
    /**
     * 画像マネージャーを取得（翻訳後の画像復元用）
     */
    override getImageManager(): ImageManager | null {
        return this.imageManager;
    }

    override createProcessingResult(content: string, fileInfo?: FileInfo, additionalMetadata?: Record<string, any>): ProcessingResult {
        const characterCount = content.length;
        const pageCount = additionalMetadata?.pageCount || 0;
        
        return {
            content,
            metadata: {
                originalName: fileInfo?.name || 'unknown.pdf',
                fileType: 'pdf',
                size: fileInfo?.size || 0,
                characterCount,
                processingTime: 0,
                pageCount: pageCount,
                extractedImages: []
            }
        };
    }

}

export default BuiltInParser;