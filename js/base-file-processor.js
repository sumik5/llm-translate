// ==================== Base File Processor ====================

import { REGEX_PATTERNS } from './constants.js';

/**
 * Base class for file processors
 * Provides common functionality for converting documents to Markdown
 */
export class BaseFileProcessor {
    constructor() {
        this.markdownConverters = this.initializeMarkdownConverters();
    }

    /**
     * Initialize markdown conversion rules
     * @returns {Object} Map of HTML tags to markdown converters
     */
    initializeMarkdownConverters() {
        return {
            h1: (content) => `\n\n# ${content.trim()}\n\n`,
            h2: (content) => `\n\n## ${content.trim()}\n\n`,
            h3: (content) => `\n\n### ${content.trim()}\n\n`,
            h4: (content) => `\n\n#### ${content.trim()}\n\n`,
            h5: (content) => `\n\n##### ${content.trim()}\n\n`,
            h6: (content) => `\n\n###### ${content.trim()}\n\n`,
            p: (content) => content.trim() ? `\n\n${content.trim()}\n\n` : '',
            div: (content) => content.trim() ? `\n${content.trim()}\n` : '',
            br: () => '  \n',
            hr: () => '\n\n---\n\n',
            strong: (content) => `**${content.trim()}**`,
            b: (content) => `**${content.trim()}**`,
            em: (content) => `*${content.trim()}*`,
            i: (content) => `*${content.trim()}*`,
            blockquote: (content) => content.trim() ? `\n> ${content.trim().replace(/\n/g, '\n> ')}\n` : '',
        };
    }

    /**
     * Parse file and return markdown content
     * @param {ArrayBuffer} arrayBuffer - File content as ArrayBuffer
     * @returns {Promise<string>} Markdown content
     */
    async parse(arrayBuffer) {
        throw new Error('parse method must be implemented by subclass');
    }

    /**
     * Clean up markdown text
     * @param {string} markdown - Raw markdown text
     * @returns {string} Cleaned markdown
     */
    cleanMarkdown(markdown) {
        return markdown
            .replace(/\n{3,}/g, '\n\n')  // Remove excessive newlines
            .replace(/\s+\n/g, '\n')      // Remove trailing spaces
            .replace(/\n\s+\n/g, '\n\n')  // Clean empty lines with spaces
            .trim();
    }

    /**
     * Detect code language from element class names
     * @param {Element} node - DOM element
     * @returns {string} Language identifier or empty string
     */
    detectCodeLanguage(node) {
        const className = node.getAttribute('class') || '';
        
        for (const pattern of REGEX_PATTERNS.LANGUAGE_CLASS) {
            const match = className.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        // Check code element inside pre
        const codeElement = node.querySelector('code');
        if (codeElement) {
            const codeClass = codeElement.getAttribute('class') || '';
            for (const pattern of REGEX_PATTERNS.LANGUAGE_CLASS) {
                const match = codeClass.match(pattern);
                if (match) {
                    return match[1];
                }
            }
        }
        
        return '';
    }

    /**
     * Extract code content preserving formatting
     * @param {Element} node - DOM element containing code
     * @returns {string} Code content with preserved formatting
     */
    extractCodeContent(node) {
        // First, try to use innerText or textContent
        if (node.innerText !== undefined) {
            return node.innerText;
        } else if (node.textContent) {
            return node.textContent;
        }
        
        // Fallback: manually extract text preserving formatting
        let code = '';
        
        const processNode = (n) => {
            if (n.nodeType === Node.TEXT_NODE) {
                code += n.textContent;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                const tag = n.tagName.toLowerCase();
                
                if (tag === 'br') {
                    code += '\n';
                } else if (tag === 'div' || tag === 'p') {
                    if (code && !code.endsWith('\n')) {
                        code += '\n';
                    }
                    for (const child of n.childNodes) {
                        processNode(child);
                    }
                    if (!code.endsWith('\n')) {
                        code += '\n';
                    }
                } else {
                    for (const child of n.childNodes) {
                        processNode(child);
                    }
                }
            }
        };
        
        for (const child of node.childNodes) {
            processNode(child);
        }
        
        return code;
    }

    /**
     * Extract list items from a list node
     * @param {Element} listNode - UL or OL element
     * @param {boolean} isOrdered - Whether the list is ordered
     * @returns {string} Markdown formatted list
     */
    extractListFromNode(listNode, isOrdered = false) {
        let markdown = '';
        let index = 1;
        
        for (const child of listNode.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
                const prefix = isOrdered ? `${index}. ` : '- ';
                const content = this.extractTextFromNode(child, false, false).trim();
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
     * @param {string} line - Text line to check
     * @returns {boolean} True if line looks like code
     */
    looksLikeCode(line) {
        return REGEX_PATTERNS.CODE_LIKE_LINE.test(line) && 
               !line.startsWith('#') && 
               !line.startsWith('//');
    }

    /**
     * Detect line type for formatting
     * @param {string} lineText - Text of the line
     * @param {number} avgFontSize - Average font size if available
     * @returns {string} Line type identifier
     */
    detectLineType(lineText, avgFontSize = 0) {
        // Detect headings by font size if available
        if (avgFontSize > 20) return 'heading1';
        if (avgFontSize > 16) return 'heading2';
        if (avgFontSize > 14 && lineText.length < 100) return 'heading3';
        
        // Detect lists
        if (REGEX_PATTERNS.BULLET_POINTS.test(lineText)) return 'bullet';
        if (REGEX_PATTERNS.NUMBERED_LIST.test(lineText)) return 'numbered';
        if (REGEX_PATTERNS.LETTER_LIST.test(lineText)) return 'numbered';
        
        return 'paragraph';
    }

    /**
     * Extract text from node (to be implemented by subclasses if needed)
     * @param {Element} node - DOM node
     * @param {boolean} isRoot - Whether this is the root node
     * @param {boolean} preserveFormatting - Whether to preserve formatting
     * @returns {string} Extracted text
     */
    extractTextFromNode(node, isRoot = true, preserveFormatting = false) {
        // This method should be overridden by subclasses if needed
        throw new Error('extractTextFromNode method must be implemented by subclass');
    }
}

export default BaseFileProcessor;