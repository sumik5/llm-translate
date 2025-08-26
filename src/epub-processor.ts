// ==================== EPUB Processor ====================
// @ts-expect-error - BaseFileProcessor import may have type issues
import { BaseFileProcessor } from './base-file-processor.js?v=20250126';
// @ts-expect-error - BaseFileProcessor import may have type issues
import { ERROR_MESSAGES } from './constants.js?v=20250126';
// @ts-expect-error - BaseFileProcessor import may have type issues
import { ImageManager } from './image-manager.js?v=20250126';
import type { 
    ProcessingResult, 
    EPUBMetadata, 
    EPUBChapter
} from './types/processors.js';
import type { SupportedFileType, FileInfo } from './types/core.js';

// Global JSZip type declaration
declare global {
    const JSZip: any;
}

interface ZipFile {
    async(type: string): Promise<any>;
}

interface ZipObject {
    files: { [key: string]: ZipFile };
    file(path: string): ZipFile | null;
    loadAsync(data: ArrayBuffer): Promise<ZipObject>;
}

interface SpineItem {
    href: string;
    mediaType?: string;
}

// interface TextItem {
//     str: string;
//     transform: number[];
//     height: number;
//     fontName: string;
//     width: number;
// }

// interface LineItem {
//     text: string;
//     x: number;
//     y: number;
//     fontSize: number;
//     fontName: string;
//     width: number;
// }

/**
 * EPUB形式のファイルを処理するプロセッサー
 * ZIP形式で圧縮されたEPUBファイルを解析し、Markdownに変換する
 */
class EPUBProcessor extends BaseFileProcessor {
    private imageManager: ImageManager;
    private imageCache: Map<string, string>;
    private zip: ZipObject | null;
    private basePath: string;
    
    readonly supportedTypes: readonly SupportedFileType[] = ['epub'];

    constructor() {
        super();
        this.imageManager = new ImageManager();
        this.imageCache = new Map();
        this.zip = null;
        this.basePath = '';
    }

    /**
     * マークダウンを正規化
     * @param content - 正規化対象のマークダウン
     */
    normalizeMarkdown(content: string): string {
        return this.ensureProperSpacing(content);
    }

    /**
     * EPUBファイルを解析してMarkdownテキストに変換
     * @param arrayBuffer - EPUBファイルのバイナリデータ
     * @param fileInfo - ファイル情報（オプション）
     * @returns 処理結果
     */
    async parse(arrayBuffer: ArrayBuffer, fileInfo?: FileInfo): Promise<ProcessingResult> {
        if (!arrayBuffer) {
            return this.createEmptyResult();
        }
        
        try {
            this.zip = await JSZip.loadAsync(arrayBuffer);
            if (!this.zip) throw new Error('ZIP file not loaded');
            const contentOPF = await this.getContentOPF(this.zip);
            const spine = this.parseSpine(contentOPF);
            
            // Pre-load all images
            await this.preloadImages(this.zip);
            
            const chapters: string[] = [];
            for (const itemRef of spine) {
                const content = await this.getChapterContent(this.zip, itemRef.href, this.basePath);
                if (content) {
                    chapters.push(content);
                }
            }
            
            const result = chapters.join('\n\n');
            return this.createProcessingResult(result || '', fileInfo);
        } catch (error) {
            console.error('EPUB parsing error:', error);
            return this.createEmptyResult();
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
     * EPUBファイルのメタデータを抽出
     * @param arrayBuffer - EPUBファイル内容
     */
    async extractMetadata(arrayBuffer: ArrayBuffer): Promise<EPUBMetadata> {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const contentOPF = await this.getContentOPF(zip);
        
        // Parse metadata from OPF
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentOPF, 'text/xml');
        
        const titleElement = doc.querySelector('dc\\:title, title');
        const authorElement = doc.querySelector('dc\\:creator, creator');
        const languageElement = doc.querySelector('dc\\:language, language');
        const identifierElement = doc.querySelector('dc\\:identifier, identifier');
        const publisherElement = doc.querySelector('dc\\:publisher, publisher');
        
        return {
            originalName: 'unknown.epub',
            fileType: 'epub' as const,
            size: arrayBuffer.byteLength,
            characterCount: 0,
            processingTime: 0,
            title: titleElement?.textContent || 'Unknown Title',
            author: authorElement?.textContent || 'Unknown Author',
            language: languageElement?.textContent || 'unknown',
            identifier: identifierElement?.textContent || '',
            publisher: publisherElement?.textContent || '',
            chapters: []
        };
    }

    /**
     * 章を個別に抽出
     * @param arrayBuffer - EPUBファイル内容
     */
    async extractChapters(arrayBuffer: ArrayBuffer): Promise<readonly EPUBChapter[]> {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const contentOPF = await this.getContentOPF(zip);
        const spine = this.parseSpine(contentOPF);
        
        const chapters: EPUBChapter[] = [];
        for (let i = 0; i < spine.length; i++) {
            const itemRef = spine[i];
            if (!itemRef) continue;
            const content = await this.getChapterContent(zip, itemRef.href, this.basePath);
            
            chapters.push({
                id: `chapter-${i + 1}`,
                title: `Chapter ${i + 1}`,
                href: itemRef?.href || '',
                content: content || '',
                order: i + 1
            });
        }
        
        return chapters;
    }
    
    private async preloadImages(zip: ZipObject): Promise<void> {
        try {
            // Find all image files in the EPUB
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
            const files = Object.keys(zip.files);
            
            for (const filename of files) {
                const lowerName = filename.toLowerCase();
                if (imageExtensions.some(ext => lowerName.endsWith(ext))) {
                    try {
                        const file = zip.file(filename);
                        if (file) {
                            const blob = await file.async('blob');
                            const base64 = await this.blobToBase64(blob, filename);
                            this.imageCache.set(filename, base64);
                            // Also store with different path variations
                            const shortName = filename.split('/').pop();
                            if (shortName) {
                                this.imageCache.set(shortName, base64);
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to preload image ${filename}:`, e);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to preload images:', error);
        }
    }
    
    private async blobToBase64(blob: Blob, filename: string = ''): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                let result = reader.result as string;
                // Fix incorrect MIME type for images
                if (result && result.startsWith('data:application/octet-stream')) {
                    // Determine correct MIME type from filename
                    const mimeType = this.getMimeTypeFromFilename(filename);
                    if (mimeType) {
                        result = result.replace('data:application/octet-stream', `data:${mimeType}`);
                    }
                }
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    private getMimeTypeFromFilename(filename: string): string | null {
        const ext = filename.toLowerCase().split('.').pop();
        if (!ext) return null;
        
        const mimeTypes: { [key: string]: string } = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp',
            'bmp': 'image/bmp'
        };
        return mimeTypes[ext] || null;
    }

    private async getContentOPF(zip: ZipObject): Promise<string> {
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) {
            throw new Error(ERROR_MESSAGES.EPUB_CONTAINER_ERROR);
        }
        
        const containerXml = await containerFile.async('string');
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, 'text/xml');
        const rootfile = containerDoc.querySelector('rootfile');
        
        if (!rootfile) {
            throw new Error(ERROR_MESSAGES.EPUB_ROOTFILE_ERROR);
        }
        
        const contentPath = rootfile.getAttribute('full-path');
        if (!contentPath) {
            throw new Error('Content path not found in rootfile');
        }
        
        const contentFile = zip.file(contentPath);
        if (!contentFile) {
            throw new Error(`${ERROR_MESSAGES.EPUB_OPF_ERROR}: ${contentPath}`);
        }
        
        // Store base path for later use
        this.basePath = contentPath.substring(0, contentPath.lastIndexOf('/') + 1);
        
        return await contentFile.async('string');
    }

    private parseSpine(contentOPF: string): SpineItem[] {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(contentOPF, 'text/xml');
            const manifest = new Map<string, SpineItem>();
            
            // Try with namespace and without
            let manifestItems: NodeListOf<Element> = doc.querySelectorAll('manifest item');
            if (manifestItems.length === 0) {
                manifestItems = doc.querySelectorAll('item'); // Use querySelectorAll instead
            }
            
            Array.from(manifestItems).forEach(item => {
                const id = item.getAttribute('id');
                const href = item.getAttribute('href');
                const mediaType = item.getAttribute('media-type');
                
                if (id && href) {
                    manifest.set(id, {
                        href,
                        mediaType: mediaType || ''
                    });
                }
            });
            
            // Try with namespace and without
            let spineItems: NodeListOf<Element> = doc.querySelectorAll('spine itemref');
            if (spineItems.length === 0) {
                spineItems = doc.querySelectorAll('itemref'); // Use querySelectorAll instead
            }
            
            const result = Array.from(spineItems)
                .map(ref => {
                    const idref = ref.getAttribute('idref');
                    return idref ? manifest.get(idref) : undefined;
                })
                .filter((item): item is SpineItem => 
                    item !== undefined && item.mediaType === 'application/xhtml+xml'
                );
            
            return result;
        } catch (error) {
            console.warn('Failed to parse spine:', error);
            return [];
        }
    }

    private async getChapterContent(zip: ZipObject, href: string, basePath: string = ''): Promise<string> {
        try {
            // Try different path combinations
            let contentFile = zip.file(href);
            
            if (!contentFile && basePath) {
                // Try with base path
                const fullPath = basePath + href;
                contentFile = zip.file(fullPath);
            }
            
            if (!contentFile) {
                // Try in OEBPS folder (common in EPUBs)
                const oebpsPath = 'OEBPS/' + href;
                contentFile = zip.file(oebpsPath);
            }
            
            if (!contentFile) {
                return '';
            }
            
            const content = await contentFile.async('string');
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const text = this.extractTextFromNode(doc.body);
            
            return text;
        } catch (error) {
            console.warn(`Failed to get chapter content for ${href}:`, error);
            return '';
        }
    }

    // Override base class method with EPUB-specific implementation
    private extractTextFromNode(node: Node | null, _isRoot: boolean = true, preserveFormatting: boolean = false): string {
        if (!node) return '';
        
        const skipElements = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'];
        
        let markdown = '';
        const listStack: string[] = []; // Track nested lists
        
        // Helper function to extract all text from an element recursively
        const extractAllText = (element: Element): string => {
            if (!element) return '';
            
            let text = '';
            
            const walkNode = (node: Node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.textContent || '';
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Special handling for BR tags
                    if (node.nodeName.toUpperCase() === 'BR') {
                        text += '\n';
                    } else {
                        // Recursively process all children
                        for (const child of node.childNodes) {
                            walkNode(child);
                        }
                    }
                }
            };
            
            walkNode(element);
            return text;
        };
        
        const processNode = (element: Node, depth: number = 0, insideCode: boolean = false) => {
            if (!element) return;
            
            // Skip certain elements
            if (element.nodeType === Node.ELEMENT_NODE && 
                skipElements.includes(element.nodeName.toUpperCase())) {
                return;
            }
            
            if (element.nodeType === Node.TEXT_NODE) {
                let content = element.textContent || '';
                // Don't modify whitespace in code blocks or PRE elements
                if (!insideCode && !preserveFormatting) {
                    content = content.replace(/\s+/g, ' ');
                }
                if (insideCode || content.trim()) {
                    markdown += content;
                }
            } else if (element.nodeType === Node.ELEMENT_NODE) {
                const elementNode = element as Element;
                const tagName = elementNode.nodeName.toUpperCase();
                
                switch (tagName) {
                    // Headings
                    case 'H1':
                    case 'H2':
                    case 'H3':
                    case 'H4':
                    case 'H5':
                    case 'H6': {
                        const level = parseInt(tagName[1] || '1');
                        markdown += '\n\n' + '#'.repeat(level) + ' ';
                        processChildren(elementNode, depth);
                        markdown += '\n\n';
                        break;
                    }
                    
                    // Paragraphs
                    case 'P':
                        markdown += '\n\n';
                        processChildren(elementNode, depth);
                        markdown += '\n\n';
                        break;
                    
                    // Line breaks
                    case 'BR':
                        markdown += '\n';
                        break;
                    
                    // Bold/Strong
                    case 'B':
                    case 'STRONG':
                        markdown += '**';
                        processChildren(elementNode, depth);
                        markdown += '**';
                        break;
                    
                    // Italic/Emphasis
                    case 'I':
                    case 'EM':
                        markdown += '*';
                        processChildren(elementNode, depth);
                        markdown += '*';
                        break;
                    
                    // Code
                    case 'CODE':
                        // Skip if inside PRE (already handled)
                        if (elementNode.parentElement && elementNode.parentElement.nodeName.toUpperCase() === 'PRE') {
                            break;
                        }
                        markdown += '`';
                        // Use textContent to preserve the code
                        markdown += elementNode.textContent || '';
                        markdown += '`';
                        break;
                    
                    // Preformatted/Code blocks
                    case 'PRE': {
                        markdown += '\n\n```';
                        
                        // Check for language hint
                        const firstCode = elementNode.querySelector('code');
                        if (firstCode && firstCode.className) {
                            const lang = firstCode.className.match(/language-(\w+)/);
                            if (lang && lang[1]) {
                                markdown += lang[1];
                            }
                        }
                        markdown += '\n';
                        
                        // Extract ALL text from PRE element, preserving whitespace
                        const codeText = extractAllText(elementNode);
                        markdown += codeText;
                        
                        // Ensure code block ends with newline
                        if (!markdown.endsWith('\n')) {
                            markdown += '\n';
                        }
                        markdown += '```\n\n';
                        
                        // IMPORTANT: Return here to prevent processing children again
                        return;  // Exit early to prevent double processing
                    }
                    
                    // Blockquotes
                    case 'BLOCKQUOTE': {
                        const tempMd = markdown;
                        markdown = '';
                        processChildren(elementNode, depth);
                        const quoteContent = markdown;
                        markdown = tempMd;
                        // Add > prefix to each line
                        quoteContent.split('\n').forEach(line => {
                            if (line.trim()) {
                                markdown += '\n> ' + line;
                            }
                        });
                        markdown += '\n\n';
                        break;
                    }
                    
                    // Lists
                    case 'UL':
                    case 'OL':
                        listStack.push(tagName);
                        markdown += '\n';
                        processChildren(elementNode, depth + 1);
                        listStack.pop();
                        markdown += '\n';
                        break;
                    
                    case 'LI': {
                        const listType = listStack[listStack.length - 1];
                        const indent = '  '.repeat(Math.max(0, listStack.length - 1));
                        
                        if (listType === 'UL') {
                            markdown += '\n' + indent + '- ';
                        } else if (listType === 'OL') {
                            const parent = elementNode.parentElement;
                            if (parent) {
                                const index = Array.from(parent.children).indexOf(elementNode) + 1;
                                markdown += '\n' + indent + `${index}. `;
                            }
                        }
                        processChildren(elementNode, depth);
                        break;
                    }
                    
                    // Links
                    case 'A': {
                        const href = elementNode.getAttribute('href');
                        const title = elementNode.getAttribute('title');
                        if (href) {
                            markdown += '[';
                            processChildren(elementNode, depth);
                            markdown += '](' + href;
                            if (title) {
                                markdown += ' "' + title + '"';
                            }
                            markdown += ')';
                        } else {
                            processChildren(elementNode, depth);
                        }
                        break;
                    }
                    
                    // Images
                    case 'IMG': {
                        const src = elementNode.getAttribute('src');
                        const alt = elementNode.getAttribute('alt') || '';
                        if (src) {
                            // Try to get the image from cache
                            let imageData: string | null = null;
                            const normalizedSrc = src.replace(/^\.\//, '').replace(/^\//, '');
                            
                            // Check various path combinations
                            const pathsToTry = [
                                normalizedSrc,
                                this.basePath + normalizedSrc,
                                'OEBPS/' + normalizedSrc,
                                src.split('/').pop() || '' // Just the filename
                            ];
                            
                            for (const path of pathsToTry) {
                                if (this.imageCache.has(path)) {
                                    imageData = this.imageCache.get(path) || null;
                                    break;
                                }
                            }
                            
                            if (imageData) {
                                // Store image and use placeholder
                                const placeholder = this.imageManager.storeImage(imageData, alt);
                                markdown += placeholder;
                            } else {
                                // Fallback to original src if no image data found
                                markdown += '![' + alt + '](' + src + ')';
                            }
                        }
                        break;
                    }
                    
                    // Tables
                    case 'TABLE':
                        markdown += '\n\n';
                        processTable(elementNode);
                        markdown += '\n\n';
                        break;
                    
                    // Horizontal rules
                    case 'HR':
                        markdown += '\n\n---\n\n';
                        break;
                    
                    // Definition lists
                    case 'DL':
                        markdown += '\n';
                        processChildren(elementNode, depth);
                        markdown += '\n';
                        break;
                    
                    case 'DT':
                        markdown += '\n**';
                        processChildren(elementNode, depth);
                        markdown += '**\n';
                        break;
                    
                    case 'DD':
                        markdown += ': ';
                        processChildren(elementNode, depth);
                        markdown += '\n';
                        break;
                    
                    // Inline code-like elements
                    case 'KBD':
                    case 'SAMP':
                    case 'VAR':
                        markdown += '`';
                        processChildren(elementNode, depth);
                        markdown += '`';
                        break;
                    
                    // Strikethrough
                    case 'DEL':
                    case 'S':
                    case 'STRIKE':
                        markdown += '~~';
                        processChildren(elementNode, depth);
                        markdown += '~~';
                        break;
                    
                    // Superscript/Subscript
                    case 'SUP':
                        markdown += '^';
                        processChildren(elementNode, depth);
                        markdown += '^';
                        break;
                    
                    case 'SUB':
                        markdown += '~';
                        processChildren(elementNode, depth);
                        markdown += '~';
                        break;
                    
                    // Default: process children
                    default:
                        // Don't process children for PRE and CODE as we handle them specially
                        if (tagName !== 'PRE' && tagName !== 'CODE') {
                            processChildren(elementNode, depth);
                        }
                        break;
                }
            }
        };
        
        const processChildren = (element: Element, depth: number, insideCode: boolean = false) => {
            for (const child of element.childNodes) {
                processNode(child, depth, insideCode);
            }
        };
        
        const processTable = (tableElement: Element) => {
            const thead = tableElement.querySelector('thead');
            const tbody = tableElement.querySelector('tbody');
            
            // Process header
            const headerRow: string[] = [];
            if (thead) {
                const headerCells = thead.querySelectorAll('th, td');
                headerCells.forEach(cell => {
                    const tempMd = markdown;
                    markdown = '';
                    processChildren(cell, 0);
                    headerRow.push(markdown.trim());
                    markdown = tempMd;
                });
            } else {
                // Check first row for headers
                const firstRow = tableElement.querySelector('tr');
                if (firstRow) {
                    const cells = firstRow.querySelectorAll('th');
                    if (cells.length > 0) {
                        cells.forEach(cell => {
                            const tempMd = markdown;
                            markdown = '';
                            processChildren(cell, 0);
                            headerRow.push(markdown.trim());
                            markdown = tempMd;
                        });
                    }
                }
            }
            
            // Add header to markdown
            if (headerRow.length > 0) {
                markdown += '| ' + headerRow.join(' | ') + ' |\n';
                markdown += '|' + headerRow.map(() => ' --- ').join('|') + '|\n';
            }
            
            // Process body rows
            const bodyRows = tbody ? tbody.querySelectorAll('tr') : tableElement.querySelectorAll('tr');
            bodyRows.forEach(row => {
                // Skip if this was the header row
                if (row.querySelector('th') && headerRow.length > 0) return;
                
                const cells = row.querySelectorAll('td, th');
                const rowData: string[] = [];
                cells.forEach(cell => {
                    const tempMd = markdown;
                    markdown = '';
                    processChildren(cell, 0);
                    rowData.push(markdown.trim());
                    markdown = tempMd;
                });
                
                if (rowData.length > 0) {
                    markdown += '| ' + rowData.join(' | ') + ' |\n';
                }
            });
        };
        
        processNode(node);
        
        // Clean up the markdown
        markdown = markdown
            .replace(/\n{3,}/g, '\n\n')  // Remove excessive line breaks
            .replace(/\n\n\n\n/g, '\n\n')  // Extra cleanup
            .replace(/^\n+/, '')  // Remove leading newlines
            .replace(/\n+$/, '')  // Remove trailing newlines
            .replace(/\n\s*\n\s*\n/g, '\n\n')  // Clean up whitespace between paragraphs
            .trim();
        
        return markdown;
    }

    /**
     * 画像マネージャーを取得（翻訳後の画像復元用）
     */
    getImageManager(): ImageManager {
        return this.imageManager;
    }

    private createEmptyResult(): ProcessingResult {
        return {
            content: '',
            metadata: {
                originalName: '',
                fileType: 'epub',
                size: 0,
                characterCount: 0,
                processingTime: 0
            }
        };
    }

    private createProcessingResult(content: string, fileInfo?: FileInfo): ProcessingResult {
        const characterCount = content.length;
        
        return {
            content,
            metadata: {
                originalName: fileInfo?.name || 'unknown.epub',
                fileType: 'epub',
                size: fileInfo?.size || 0,
                characterCount,
                processingTime: 0,
                extractedImages: Array.from(this.imageCache.entries()).map(([path, data], index) => ({
                    id: `img-${index}`,
                    src: data,
                    format: this.getMimeTypeFromFilename(path) || 'image/unknown',
                    size: data.length
                }))
            }
        };
    }

    private ensureProperSpacing(markdown: string): string {
        const lines = markdown.split('\n');
        const result: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i] || '';
            const prevLine = i > 0 ? (lines[i - 1] || '') : '';
            const nextLine = i < lines.length - 1 ? (lines[i + 1] || '') : '';
            
            // 画像プレースホルダーかどうかをチェック
            const isImagePlaceholder = (line: string) => /^\[\[IMG_\d+\]\]$/.test(line.trim());
            
            // 画像プレースホルダーの前に空行を追加
            if (isImagePlaceholder(currentLine) && prevLine.trim() !== '') {
                result.push('');
            }
            
            // ヘッダー（#で始まる行）の前に空行を追加
            // ただし、前の行が既に空行またはヘッダーの場合は追加しない
            if (currentLine.match(/^#{1,6}\s+/) && 
                prevLine.trim() !== '' && 
                !prevLine.match(/^#{1,6}\s+/)) {
                result.push('');
            }
            
            // コードブロック開始（```）の前に空行を追加
            if (currentLine.trim().startsWith('```') && 
                prevLine.trim() !== '' && 
                !prevLine.trim().startsWith('```')) {
                result.push('');
            }
            
            result.push(currentLine);
            
            // 画像プレースホルダーの後に空行を追加
            if (isImagePlaceholder(currentLine) && nextLine.trim() !== '') {
                result.push('');
            }
            
            // ヘッダーの後に空行を追加
            // ただし、次の行が既に空行またはヘッダーの場合は追加しない
            if (currentLine.match(/^#{1,6}\s+/) && 
                nextLine.trim() !== '' && 
                !nextLine.match(/^#{1,6}\s+/)) {
                result.push('');
            }
            
            // コードブロック終了（```）の後に空行を追加
            if (currentLine.trim().startsWith('```') && 
                this.isCodeBlockEnd(lines, i) && 
                nextLine.trim() !== '' && 
                !nextLine.trim().startsWith('```')) {
                result.push('');
            }
        }
        
        // 連続する空行を最大2つまでに制限
        return result.join('\n').replace(/\n{3,}/g, '\n\n');
    }
    
    private isCodeBlockEnd(lines: string[], index: number): boolean {
        // 現在の行より前にコードブロック開始があるか確認
        let codeBlockCount = 0;
        for (let i = 0; i <= index; i++) {
            const line = lines[i];
            if (line && line.trim().startsWith('```')) {
                codeBlockCount++;
            }
        }
        // 奇数回なら開始、偶数回なら終了
        return codeBlockCount % 2 === 0;
    }
}

export default EPUBProcessor;