// ==================== Base File Processor ====================

import { REGEX_PATTERNS } from './constants.js';
import type { 
    MarkdownConverters,
    ChunkType,
    ProcessingResult,
    FileInfo
} from './types/index.js';

/**
 * Base class for file processors
 * Provides common functionality for converting documents to Markdown
 */
export class BaseFileProcessor {
    readonly markdownConverters: MarkdownConverters;
    readonly supportedTypes: readonly string[] = [];

    constructor() {
        this.markdownConverters = this.initializeMarkdownConverters();
    }

    /**
     * Initialize markdown conversion rules
     * @returns Map of HTML tags to markdown converters
     */
    initializeMarkdownConverters(): MarkdownConverters {
        return {
            h1: (content: string): string => `\n\n# ${content.trim()}\n\n`,
            h2: (content: string): string => `\n\n## ${content.trim()}\n\n`,
            h3: (content: string): string => `\n\n### ${content.trim()}\n\n`,
            h4: (content: string): string => `\n\n#### ${content.trim()}\n\n`,
            h5: (content: string): string => `\n\n##### ${content.trim()}\n\n`,
            h6: (content: string): string => `\n\n###### ${content.trim()}\n\n`,
            p: (content: string): string => content.trim() ? `\n\n${content.trim()}\n\n` : '',
            div: (content: string): string => content.trim() ? `\n${content.trim()}\n` : '',
            br: (): string => '  \n',
            hr: (): string => '\n\n---\n\n',
            strong: (content: string): string => `**${content.trim()}**`,
            b: (content: string): string => `**${content.trim()}**`,
            em: (content: string): string => `*${content.trim()}*`,
            i: (content: string): string => `*${content.trim()}*`,
            blockquote: (content: string): string => content.trim() ? `\n> ${content.trim().replace(/\n/g, '\n> ')}\n` : '',
        };
    }

    /**
     * Parse file and return markdown content
     * @param arrayBuffer - File content as ArrayBuffer
     * @param fileInfo - Optional file information
     * @returns Promise resolving to processing result
     */
    async parse(_arrayBuffer: ArrayBuffer, _fileInfo?: FileInfo): Promise<ProcessingResult> {
        throw new Error('parse method must be implemented by subclass');
    }

    /**
     * Check if file type is supported
     * @param fileType - File type to check
     * @returns True if supported
     */
    supportsType(fileType: string): boolean {
        return this.supportedTypes.includes(fileType);
    }

    /**
     * Clean up markdown text
     * @param markdown - Raw markdown text
     * @returns Cleaned markdown
     */
    cleanMarkdown(markdown: string): string {
        return markdown
            .replace(/\n{3,}/g, '\n\n')  // Remove excessive newlines
            .replace(/\s+\n/g, '\n')      // Remove trailing spaces
            .replace(/\n\s+\n/g, '\n\n')  // Clean empty lines with spaces
            .trim();
    }

    /**
     * Detect code language from element class names
     * @param node - DOM element
     * @returns Language identifier or empty string
     */
    detectCodeLanguage(node: Element): string {
        const className = node.getAttribute('class') || '';
        
        for (const pattern of REGEX_PATTERNS.LANGUAGE_CLASS) {
            const match = className.match(pattern);
            if (match) {
                return match[1] || 'unknown';
            }
        }
        
        // Check code element inside pre
        const codeElement = node.querySelector('code');
        if (codeElement) {
            const codeClass = codeElement.getAttribute('class') || '';
            for (const pattern of REGEX_PATTERNS.LANGUAGE_CLASS) {
                const match = codeClass.match(pattern);
                if (match) {
                    return match[1] || 'unknown';
                }
            }
        }
        
        return '';
    }

    /**
     * Extract code content preserving formatting
     * @param node - DOM element containing code
     * @returns Code content with preserved formatting
     */
    extractCodeContent(node: Element): string {
        const extendedNode = node as HTMLElement;
        
        // First, try to use innerText or textContent
        if (extendedNode.innerText !== undefined) {
            return extendedNode.innerText;
        } else if (extendedNode.textContent) {
            return extendedNode.textContent;
        }
        
        // Fallback: manually extract text preserving formatting
        let code = '';
        
        const processNode = (n: Node): void => {
            if (n.nodeType === Node.TEXT_NODE) {
                code += n.textContent || '';
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                const element = n as Element;
                const tag = element.tagName.toLowerCase();
                
                if (tag === 'br') {
                    code += '\n';
                } else if (tag === 'div' || tag === 'p') {
                    if (code && !code.endsWith('\n')) {
                        code += '\n';
                    }
                    for (const child of Array.from(n.childNodes)) {
                        processNode(child);
                    }
                    if (!code.endsWith('\n')) {
                        code += '\n';
                    }
                } else {
                    for (const child of Array.from(n.childNodes)) {
                        processNode(child);
                    }
                }
            }
        };
        
        for (const child of Array.from(node.childNodes)) {
            processNode(child);
        }
        
        return code;
    }

    /**
     * Extract list items from a list node
     * @param listNode - UL or OL element
     * @param isOrdered - Whether the list is ordered
     * @returns Markdown formatted list
     */
    extractListFromNode(listNode: Element, isOrdered: boolean = false): string {
        let markdown = '';
        let index = 1;
        
        for (const child of Array.from(listNode.childNodes)) {
            if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === 'li') {
                const prefix = isOrdered ? `${index}. ` : '- ';
                const content = this.extractTextFromNode(child as Element, false, false).trim();
                if (content) {
                    markdown += prefix + content + '\n';
                    index++;
                }
            }
        }
        
        return markdown;
    }

    /**
     * Check if text looks like code
     * @param line - Text line to check
     * @returns True if line looks like code
     */
    looksLikeCode(line: string): boolean {
        return REGEX_PATTERNS.CODE_LIKE_LINE.test(line) && 
               !line.startsWith('#') && 
               !line.startsWith('//');
    }

    /**
     * Detect line type for formatting
     * @param lineText - Text of the line
     * @param avgFontSize - Average font size if available
     * @returns Line type identifier
     */
    detectLineType(lineText: string, avgFontSize: number = 0): ChunkType {
        // Detect headings by font size if available
        if (avgFontSize > 20) return 'heading';
        if (avgFontSize > 16) return 'heading';
        if (avgFontSize > 14 && lineText.length < 100) return 'heading';
        
        // Detect lists
        if (REGEX_PATTERNS.BULLET_POINTS.test(lineText)) return 'list';
        if (REGEX_PATTERNS.NUMBERED_LIST.test(lineText)) return 'list';
        if (REGEX_PATTERNS.LETTER_LIST.test(lineText)) return 'list';
        
        return 'paragraph';
    }

    /**
     * Extract text from node (to be implemented by subclasses if needed)
     * @param node - DOM node
     * @param isRoot - Whether this is the root node
     * @param preserveFormatting - Whether to preserve formatting
     * @returns Extracted text
     */
    extractTextFromNode(_node: Element, _isRoot: boolean = true, _preserveFormatting: boolean = false): string {
        // This method should be overridden by subclasses if needed
        throw new Error('extractTextFromNode method must be implemented by subclass');
    }
}

export default BaseFileProcessor;