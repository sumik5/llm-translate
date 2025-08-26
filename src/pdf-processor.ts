// ==================== PDF Processor ====================
// @ts-expect-error - Import type may have compatibility issues
import { BaseFileProcessor } from './base-file-processor.js?v=20250126';
// @ts-expect-error - Import type may have compatibility issues
import { ERROR_MESSAGES } from './constants.js?v=20250126';
// @ts-expect-error - Import type may have compatibility issues
import { ImageManager } from './image-manager.js?v=20250126';
import type { 
    ProcessingResult
} from './types/processors.js';
import type { SupportedFileType, FileInfo } from './types/core.js';

// Global PDF.js type declarations
declare global {
    const pdfjsLib: {
        getDocument(params: { data: ArrayBuffer }): {
            promise: Promise<PDFDocument>;
        };
    };
}

interface PDFDocument {
    numPages: number;
    getPage(pageNum: number): Promise<PDFPage>;
}

interface PDFPage {
    getTextContent(): Promise<TextContent>;
    getOperatorList(): Promise<OperatorList>;
    getViewport(options: { scale: number }): PDFViewport;
    objs: {
        get(name: string): Promise<any>;
    };
}

interface TextContent {
    items: TextItem[];
}

interface TextItem {
    str: string;
    transform: number[];
    height: number;
    fontName: string;
    width: number;
}

interface OperatorList {
    fnArray: number[];
    argsArray: any[][];
}

interface PDFViewport {
    width: number;
    height: number;
}

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
 * PDF形式のファイルを処理するプロセッサー
 * PDF.jsを使用してPDFファイルを解析し、Markdownに変換する
 */
class PDFProcessor extends BaseFileProcessor {
    private imageManager: ImageManager;
    private imageCounter: number;
    private images: string[];
    
    readonly supportedTypes: readonly SupportedFileType[] = ['pdf'];

    constructor() {
        super();
        this.imageManager = new ImageManager();
        this.imageCounter = 0;
        this.images = [];
    }

    /**
     * PDFファイルを解析してMarkdownテキストに変換
     * @param arrayBuffer - PDFファイルのバイナリデータ
     * @param fileInfo - ファイル情報（オプション）
     * @returns 処理結果
     */
    async parse(arrayBuffer: ArrayBuffer, fileInfo?: FileInfo): Promise<ProcessingResult> {
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            const pages: string[] = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Extract images from the page
                const pageImages = await this.extractImagesFromPage(page, pageNum);
                
                // Group text items by lines based on Y position
                const lines = this.groupTextByLines(textContent.items);
                
                // Convert lines to markdown
                let pageMarkdown = this.convertLinesToMarkdown(lines);
                
                // Add images to markdown
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
            return this.createProcessingResult(content, fileInfo, pdf.numPages);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`${ERROR_MESSAGES.PDF_PARSE_ERROR}: ${errorMessage}`);
        }
    }

    /**
     * ファイルタイプをサポートしているかチェック
     * @param fileType - チェック対象のファイルタイプ
     */
    supportsType(fileType: SupportedFileType): boolean {
        return this.supportedTypes.includes(fileType);
    }

    /**
     * ページ単位でテキストを抽出
     * @param arrayBuffer - PDFファイル内容
     */
    async extractPageTexts(arrayBuffer: ArrayBuffer): Promise<readonly string[]> {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            const lines = this.groupTextByLines(textContent.items);
            const pageText = this.convertLinesToMarkdown(lines);
            pages.push(pageText);
        }
        
        return pages;
    }

    /**
     * PDFからテキストのみを抽出（レイアウト情報なし）
     * @param arrayBuffer - PDFファイル内容
     */
    async extractPlainText(arrayBuffer: ArrayBuffer): Promise<string> {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let allText = '';
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            if (pageText) {
                allText += pageText + '\n\n';
            }
        }
        
        return allText.trim();
    }
    
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
                                // Store image and use placeholder
                                const placeholder = this.imageManager.storeImage(imageData, altText);
                                images.push(placeholder);
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to extract image on page ${pageNum}:`, e);
                    }
                }
            }
        } catch (error) {
            // If image extraction fails, continue without images
            console.warn(`Failed to extract images from page ${pageNum}:`, error);
        }
        return images;
    }
    
    private async imageToBase64(img: any, _viewport: PDFViewport): Promise<string | null> {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                return null;
            }
            
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
    
    private groupTextByLines(items: TextItem[]): LineItem[][] {
        if (!items || items.length === 0) return [];
        
        // Group items by Y position (with tolerance)
        const lineMap = new Map<number, LineItem[]>();
        const tolerance = 1.5; // Reduced tolerance for better line detection
        
        for (const item of items) {
            if (!item.str) continue; // Don't skip empty strings - they might be important spaces
            
            const y = Math.round((item.transform[5] || 0) * 10) / 10; // More precise Y position
            let lineY = y;
            
            // Find existing line within tolerance
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
        
        // Sort lines by Y position (top to bottom)
        const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])  // PDF Y coordinates are bottom-up
            .map(([_y, items]) => {
                // Sort items in each line by X position
                const sortedItems = items.sort((a, b) => a.x - b.x);
                
                // Combine items with proper spacing
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
            
            // Calculate gap between items
            const gap = item.x - (currentItem.x + (currentItem.width || 0));
            
            // If gap is small, combine the text
            if (gap < 10) {
                // Add appropriate spacing
                if (gap > 3) {
                    currentItem.text += ' ';
                }
                currentItem.text += item.text;
                currentItem.width = (item.x + (item.width || 0)) - currentItem.x;
            } else {
                // Start new item if gap is large
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
                // Empty line might indicate paragraph break
                if (currentParagraph.length > 0) {
                    markdown += currentParagraph.join(' ') + '\n\n';
                    currentParagraph = [];
                }
                continue;
            }
            
            // Calculate line gap for paragraph detection
            const currentY = line[0]?.y || 0;
            const lineGap = previousY ? Math.abs(previousY - currentY) : 0;
            previousY = currentY;
            
            // Detect line type based on formatting
            const lineType = this.detectLineType(line || [], lineText);
            
            // If there's a large gap, finish current paragraph
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
                    // Clean bullet point markers
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
                    // Check if line ends with typical sentence endings
                    // const _endsWithPunctuation = /[.!?:;。！？：；]$/.test(lineText);
                    const startsWithCapital = /^[A-Z]/.test(lineText);
                    
                    // If starts with capital after punctuation, likely new paragraph
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
        
        // Add any remaining paragraph
        if (currentParagraph.length > 0) {
            markdown += currentParagraph.join(' ') + '\n\n';
        }
        
        // Clean up the markdown
        return this.cleanupMarkdown(markdown);
    }
    
    private cleanupMarkdown(markdown: string): string {
        // Remove excessive whitespace
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.replace(/[ \t]+/g, ' ');
        
        // Fix list formatting
        markdown = markdown.replace(/\n- /g, '\n\n- ');
        markdown = markdown.replace(/\n\n\n- /g, '\n\n- ');
        
        // Ensure proper spacing around headings
        markdown = markdown.replace(/\n#/g, '\n\n#');
        markdown = markdown.replace(/\n\n\n#/g, '\n\n#');
        
        markdown = this.cleanPdfText(markdown);
        
        // Trim and return
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
        
        // Check average font size and other characteristics
        // const _avgFontSize = lineItems.reduce((sum, item) => sum + (item.fontSize || 0), 0) / lineItems.length;
        const maxFontSize = Math.max(...lineItems.map(item => item.fontSize || 0));
        const isBold = lineItems.some(item => item.fontName && item.fontName.toLowerCase().includes('bold'));
        const isShort = lineText.length < 60;
        const isAllCaps = lineText === lineText.toUpperCase() && /[A-Z]/.test(lineText);
        
        // Check for code-like patterns
        if (lineText.startsWith('    ') || lineText.startsWith('\t')) {
            return 'code';
        }
        
        // Detect headings by multiple criteria
        // Chapter/Section patterns
        if (/^(Chapter|Section|Part)\s+\d+/i.test(lineText) || 
            /^\d+\.\d+(\.\d+)*\s+[A-Z]/.test(lineText)) {
            return 'heading2';
        }
        
        // Large font size or bold short text likely heading
        if (maxFontSize > 18 && isShort) return 'heading1';
        if (maxFontSize > 15 && isShort) return 'heading2';
        if ((maxFontSize > 13 || isBold) && isShort) return 'heading3';
        
        // All caps short text is likely a heading
        if (isAllCaps && isShort) {
            if (lineText.length < 20) return 'heading2';
            return 'heading3';
        }
        
        // Detect lists using patterns
        const BULLET_PATTERNS = [
            /^[•·▪▫◦‣⁃]\s*/,
            /^[➢➣→➤]\s*/,
            /^[-–—]\s+/,  // Various dashes
            /^\*\s+/,
            /^[▸▹►▻]\s*/
        ];
        
        const NUMBERED_PATTERNS = [
            /^\d+[.)]\s*/,
            /^[a-z][.)]\s+/i,
            /^[ivxIVX]+[.)]\s+/,  // Roman numerals
            /^\(\d+\)\s*/,
            /^\[\d+\]\s*/
        ];
        
        if (BULLET_PATTERNS.some(pattern => lineText.match(pattern))) return 'bullet';
        if (NUMBERED_PATTERNS.some(pattern => lineText.match(pattern))) return 'numbered';
        
        // Table of contents patterns
        if (/\.\s*\.\s*\.\s*\d+$/.test(lineText) || /\s{2,}\d+$/.test(lineText)) {
            return 'toc';
        }
        
        return 'paragraph';
    }
    
    /**
     * 画像マネージャーを取得（翻訳後の画像復元用）
     */
    getImageManager(): ImageManager {
        return this.imageManager;
    }

    private createProcessingResult(content: string, fileInfo?: FileInfo, pageCount?: number): ProcessingResult {
        const characterCount = content.length;
        
        return {
            content,
            metadata: {
                originalName: fileInfo?.name || 'unknown.pdf',
                fileType: 'pdf',
                size: fileInfo?.size || 0,
                characterCount,
                processingTime: 0,
                pageCount: pageCount || 0,
                extractedImages: this.images.map((data, index) => ({
                    id: `img-${index}`,
                    src: data,
                    format: 'image/png',
                    size: data.length
                }))
            }
        };
    }
}

export default PDFProcessor;