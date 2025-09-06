// ==================== Built-in EPUB Parser ====================
// 既存のEPUB処理ロジックをパーサーとして実装

import { BaseEPUBParser } from './base-epub-parser.js';
import type { 
    EPUBParserType,
    EPUBParserOptions,
    EPUBParseResult,
    EPUBMetadata
} from '../types/epub-parsers.js';

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

/**
 * 内蔵EPUBパーサー
 * 既存のEPUB処理ロジックを使用した安定版パーサー
 */
export default class BuiltInEPUBParser extends BaseEPUBParser {
    readonly type: EPUBParserType = 'builtin';
    readonly name = 'Built-in Parser';
    readonly description = '標準内蔵EPUBパーサー（安定版）';
    
    private imageCache: Map<string, string> = new Map();
    private zip: ZipObject | null = null;
    private basePath: string = '';
    
    /**
     * パーサーが利用可能かチェック
     */
    async isAvailable(): Promise<boolean> {
        try {
            // JSZipが利用可能かチェック
            return typeof JSZip !== 'undefined';
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
        const mergedOptions = this.mergeOptions(options);
        
        try {
            // 画像マネージャーを初期化
            if (mergedOptions.extractImages) {
                this.createImageManager();
            }
            
            this.zip = await JSZip.loadAsync(arrayBuffer);
            if (!this.zip) throw new Error('ZIP file not loaded');
            
            const contentOPF = await this.getContentOPF(this.zip);
            const spine = this.parseSpine(contentOPF);
            
            if (!spine || spine.length === 0) {
                throw new Error('No spine items found in EPUB');
            }
            
            // Pre-load all images if needed
            if (mergedOptions.extractImages) {
                await this.preloadImages(this.zip);
            }
            
            // Extract metadata if needed
            let metadata: EPUBMetadata | undefined;
            if (mergedOptions.includeMetadata) {
                metadata = await this.extractMetadata(contentOPF);
            }
            
            // Process chapters
            const chapters: string[] = [];
            for (let i = 0; i < spine.length; i++) {
                const itemRef = spine[i];
                if (!itemRef) continue;
                
                const content = await this.getChapterContent(
                    this.zip, 
                    itemRef.href, 
                    this.basePath,
                    mergedOptions
                );
                
                if (content) {
                    if (mergedOptions.includeChapterNumbers) {
                        const separator = this.generateSectionSeparator(
                            mergedOptions.sectionSeparator || 'hr',
                            i + 1,
                            `Chapter ${i + 1}`
                        );
                        chapters.push(separator + content);
                    } else {
                        chapters.push(content);
                    }
                }
            }
            
            let content = chapters.join('\n\n');
            
            // Add metadata section if needed
            if (mergedOptions.includeMetadata && metadata) {
                const metadataSection = this.generateMetadataSection(metadata);
                content = metadataSection + content;
            }
            
            const processingTime = performance.now() - startTime;
            
            const result: EPUBParseResult = {
                content,
                processingTime,
                warnings: []
            };
            
            if (metadata) {
                result.metadata = metadata;
            }
            
            return result;
            
        } catch (error) {
            this.handleError(error, 'EPUB parsing failed');
        }
    }
    
    private async getContentOPF(zip: ZipObject): Promise<string> {
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) {
            throw new Error('container.xml not found');
        }
        
        const containerXml = await containerFile.async('string');
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, 'text/xml');
        const rootfile = containerDoc.querySelector('rootfile');
        
        if (!rootfile) {
            throw new Error('rootfile not found');
        }
        
        const contentPath = rootfile.getAttribute('full-path');
        if (!contentPath) {
            throw new Error('Content path not found in rootfile');
        }
        
        const contentFile = zip.file(contentPath);
        if (!contentFile) {
            throw new Error(`content.opf not found at ${contentPath}`);
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
            
            // Parse manifest items
            const manifestItems = doc.querySelectorAll('item');
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
            
            // Parse spine items
            const spineItems = doc.querySelectorAll('itemref');
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
    
    private async extractMetadata(contentOPF: string): Promise<EPUBMetadata> {
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentOPF, 'text/xml');
        
        const titleElement = doc.querySelector('dc\\:title, title');
        const authorElement = doc.querySelector('dc\\:creator, creator');
        const languageElement = doc.querySelector('dc\\:language, language');
        const identifierElement = doc.querySelector('dc\\:identifier, identifier');
        const publisherElement = doc.querySelector('dc\\:publisher, publisher');
        const descriptionElement = doc.querySelector('dc\\:description, description');
        const dateElement = doc.querySelector('dc\\:date, date');
        
        const result: EPUBMetadata = {};
        
        const title = titleElement?.textContent;
        if (title) result.title = title;
        
        const author = authorElement?.textContent;
        if (author) result.author = author;
        
        const language = languageElement?.textContent;
        if (language) result.language = language;
        
        const isbn = identifierElement?.textContent;
        if (isbn) result.isbn = isbn;
        
        const publisher = publisherElement?.textContent;
        if (publisher) result.publisher = publisher;
        
        const description = descriptionElement?.textContent;
        if (description) result.description = description;
        
        const publishDate = dateElement?.textContent;
        if (publishDate) result.publishDate = publishDate;
        
        return result;
    }
    
    private async preloadImages(zip: ZipObject): Promise<void> {
        try {
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
    
    private async getChapterContent(
        zip: ZipObject,
        href: string,
        basePath: string,
        options: EPUBParserOptions
    ): Promise<string> {
        try {
            // Try different path combinations
            let contentFile = zip.file(href);
            
            if (!contentFile && basePath) {
                const fullPath = basePath + href;
                contentFile = zip.file(fullPath);
            }
            
            if (!contentFile) {
                const oebpsPath = 'OEBPS/' + href;
                contentFile = zip.file(oebpsPath);
            }
            
            if (!contentFile) {
                return '';
            }
            
            const content = await contentFile.async('string');
            
            // Parse as XML/XHTML
            const parser = new DOMParser();
            let doc = parser.parseFromString(content, 'application/xhtml+xml');
            
            // If XHTML parsing fails, try HTML
            if (doc.querySelector('parsererror')) {
                doc = parser.parseFromString(content, 'text/html');
            }
            
            const bodyElement = doc.body || doc.querySelector('body') || doc.documentElement;
            
            if (!bodyElement) {
                return '';
            }
            
            // Extract text with image handling
            const text = this.extractTextFromNode(bodyElement, options);
            
            if (!text || text.length === 0) {
                const fallbackText = bodyElement.textContent || '';
                return fallbackText.trim();
            }
            
            return text;
        } catch (error) {
            console.warn(`Failed to get chapter content for ${href}:`, error);
            return '';
        }
    }
    
    private extractTextFromNode(node: Node, options: EPUBParserOptions): string {
        if (!node) return '';
        
        let markdown = '';
        const skipElements = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'];
        const listStack: string[] = [];
        
        const processNode = (element: Node, depth: number = 0) => {
            if (!element) return;
            
            if (element.nodeType === Node.ELEMENT_NODE && 
                skipElements.includes(element.nodeName.toUpperCase())) {
                return;
            }
            
            if (element.nodeType === Node.TEXT_NODE) {
                const content = element.textContent || '';
                if (content.trim()) {
                    markdown += content.replace(/\s+/g, ' ');
                }
            } else if (element.nodeType === Node.ELEMENT_NODE) {
                const elementNode = element as Element;
                const tagName = elementNode.nodeName.toUpperCase();
                
                switch (tagName) {
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
                    
                    case 'P':
                        markdown += '\n\n';
                        processChildren(elementNode, depth);
                        markdown += '\n\n';
                        break;
                    
                    case 'BR':
                        markdown += '\n';
                        break;
                    
                    case 'B':
                    case 'STRONG':
                        markdown += '**';
                        processChildren(elementNode, depth);
                        markdown += '**';
                        break;
                    
                    case 'I':
                    case 'EM':
                        markdown += '*';
                        processChildren(elementNode, depth);
                        markdown += '*';
                        break;
                    
                    case 'IMG': {
                        if (options.extractImages) {
                            const src = elementNode.getAttribute('src');
                            const alt = elementNode.getAttribute('alt') || '';
                            if (src) {
                                let imageData: string | null = null;
                                const normalizedSrc = src.replace(/^\.\//, '').replace(/^\//, '');
                                
                                const pathsToTry = [
                                    normalizedSrc,
                                    this.basePath + normalizedSrc,
                                    'OEBPS/' + normalizedSrc,
                                    src.split('/').pop() || ''
                                ];
                                
                                for (const path of pathsToTry) {
                                    if (this.imageCache.has(path)) {
                                        imageData = this.imageCache.get(path) || null;
                                        break;
                                    }
                                }
                                
                                if (imageData && this.imageManager) {
                                    const placeholder = this.imageManager.storeImage(imageData, alt);
                                    markdown += placeholder;
                                } else {
                                    markdown += '![' + alt + '](' + src + ')';
                                }
                            }
                        }
                        break;
                    }
                    
                    case 'A': {
                        const href = elementNode.getAttribute('href');
                        if (href) {
                            markdown += '[';
                            processChildren(elementNode, depth);
                            markdown += '](' + href + ')';
                        } else {
                            processChildren(elementNode, depth);
                        }
                        break;
                    }
                    
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
                    
                    case 'BLOCKQUOTE': {
                        const tempMd = markdown;
                        markdown = '';
                        processChildren(elementNode, depth);
                        const quoteContent = markdown;
                        markdown = tempMd;
                        quoteContent.split('\n').forEach(line => {
                            if (line.trim()) {
                                markdown += '\n> ' + line;
                            }
                        });
                        markdown += '\n\n';
                        break;
                    }
                    
                    case 'PRE': {
                        markdown += '\n\n```\n';
                        markdown += elementNode.textContent || '';
                        markdown += '\n```\n\n';
                        return;
                    }
                    
                    case 'CODE':
                        if (elementNode.parentElement?.nodeName.toUpperCase() !== 'PRE') {
                            markdown += '`';
                            markdown += elementNode.textContent || '';
                            markdown += '`';
                        }
                        break;
                    
                    case 'HR':
                        markdown += '\n\n---\n\n';
                        break;
                    
                    default:
                        processChildren(elementNode, depth);
                        break;
                }
            }
        };
        
        const processChildren = (element: Element, depth: number) => {
            for (const child of element.childNodes) {
                processNode(child, depth);
            }
        };
        
        processNode(node);
        
        // Clean up the markdown
        markdown = markdown
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\n+/, '')
            .replace(/\n+$/, '')
            .trim();
        
        return markdown;
    }
}