// ==================== EPUB Processor ====================
import { BaseFileProcessor } from './base-file-processor.js?v=20250126';
import { ERROR_MESSAGES } from './constants.js?v=20250126';

class EPUBProcessor extends BaseFileProcessor {
    async parse(arrayBuffer) {
        if (!arrayBuffer) {
            return '';
        }
        
        try {
            
            const zip = await JSZip.loadAsync(arrayBuffer);
            const contentOPF = await this.getContentOPF(zip);
            const spine = this.parseSpine(contentOPF);
            
            const chapters = [];
            for (const itemRef of spine) {
                const content = await this.getChapterContent(zip, itemRef.href, this.basePath);
                if (content) {
                    chapters.push(content);
                }
            }
            
            const result = chapters.join('\n\n');
            return result || '';
        } catch (error) {
            // Don't throw, return empty string
            return '';
        }
    }

    async getContentOPF(zip) {
        try {
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
            
            const contentFile = zip.file(contentPath);
            if (!contentFile) {
                throw new Error(`${ERROR_MESSAGES.EPUB_OPF_ERROR}: ${contentPath}`);
            }
            
            // Store base path for later use
            this.basePath = contentPath.substring(0, contentPath.lastIndexOf('/') + 1);
            
            return await contentFile.async('string');
        } catch (error) {
            throw error;
        }
    }

    parseSpine(contentOPF) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(contentOPF, 'text/xml');
            const manifest = new Map();
            
            // Try with namespace and without
            let manifestItems = doc.querySelectorAll('manifest item');
            if (manifestItems.length === 0) {
                manifestItems = doc.getElementsByTagName('item');
            }
            
            Array.from(manifestItems).forEach(item => {
                manifest.set(item.getAttribute('id'), {
                    href: item.getAttribute('href'),
                    mediaType: item.getAttribute('media-type')
                });
            });
            
            // Try with namespace and without
            let spineItems = doc.querySelectorAll('spine itemref');
            if (spineItems.length === 0) {
                spineItems = doc.getElementsByTagName('itemref');
            }
            
            const result = Array.from(spineItems)
                .map(ref => manifest.get(ref.getAttribute('idref')))
                .filter(item => item && item.mediaType === 'application/xhtml+xml');
            
            return result;
        } catch (error) {
            throw error;
        }
    }

    async getChapterContent(zip, href, basePath = '') {
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
            return '';
        }
    }

    // Override base class method with EPUB-specific implementation
    extractTextFromNode(node, isRoot = true, preserveFormatting = false) {
        if (!node) return '';
        
        const skipElements = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'];
        
        let markdown = '';
        let listStack = []; // Track nested lists
        
        // Helper function to extract all text from an element recursively
        const extractAllText = (element) => {
            if (!element) return '';
            
            let text = '';
            
            const walkNode = (node) => {
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
        
        const processNode = (element, depth = 0, insideCode = false) => {
            if (!element) return;
            
            // Skip certain elements
            if (element.nodeType === Node.ELEMENT_NODE && 
                skipElements.includes(element.nodeName.toUpperCase())) {
                return;
            }
            
            if (element.nodeType === Node.TEXT_NODE) {
                let content = element.textContent;
                // Don't modify whitespace in code blocks or PRE elements
                if (!insideCode && !preserveFormatting) {
                    content = content.replace(/\s+/g, ' ');
                }
                if (insideCode || content.trim()) {
                    markdown += content;
                }
            } else if (element.nodeType === Node.ELEMENT_NODE) {
                const tagName = element.nodeName.toUpperCase();
                
                switch (tagName) {
                    // Headings
                    case 'H1':
                    case 'H2':
                    case 'H3':
                    case 'H4':
                    case 'H5':
                    case 'H6':
                        const level = parseInt(tagName[1]);
                        markdown += '\n\n' + '#'.repeat(level) + ' ';
                        processChildren(element, depth);
                        markdown += '\n\n';
                        break;
                    
                    // Paragraphs
                    case 'P':
                        markdown += '\n\n';
                        processChildren(element, depth);
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
                        processChildren(element, depth);
                        markdown += '**';
                        break;
                    
                    // Italic/Emphasis
                    case 'I':
                    case 'EM':
                        markdown += '*';
                        processChildren(element, depth);
                        markdown += '*';
                        break;
                    
                    // Code
                    case 'CODE':
                        // Skip if inside PRE (already handled)
                        if (element.parentElement && element.parentElement.nodeName.toUpperCase() === 'PRE') {
                            break;
                        }
                        markdown += '`';
                        // Use textContent to preserve the code
                        markdown += element.textContent || '';
                        markdown += '`';
                        break;
                    
                    // Preformatted/Code blocks
                    case 'PRE':
                        markdown += '\n\n```';
                        
                        // Check for language hint
                        const firstCode = element.querySelector('code');
                        if (firstCode && firstCode.className) {
                            const lang = firstCode.className.match(/language-(\w+)/);
                            if (lang && lang[1]) {
                                markdown += lang[1];
                            }
                        }
                        markdown += '\n';
                        
                        // Extract ALL text from PRE element, preserving whitespace
                        const codeText = extractAllText(element);
                        markdown += codeText;
                        
                        // Ensure code block ends with newline
                        if (!markdown.endsWith('\n')) {
                            markdown += '\n';
                        }
                        markdown += '```\n\n';
                        
                        // IMPORTANT: Return here to prevent processing children again
                        return;  // Exit early to prevent double processing
                    
                    // Blockquotes
                    case 'BLOCKQUOTE':
                        const quoteLines = [];
                        const tempMd = markdown;
                        markdown = '';
                        processChildren(element, depth);
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
                    
                    // Lists
                    case 'UL':
                    case 'OL':
                        listStack.push(tagName);
                        markdown += '\n';
                        processChildren(element, depth + 1);
                        listStack.pop();
                        markdown += '\n';
                        break;
                    
                    case 'LI':
                        const listType = listStack[listStack.length - 1];
                        const indent = '  '.repeat(Math.max(0, listStack.length - 1));
                        
                        if (listType === 'UL') {
                            markdown += '\n' + indent + '- ';
                        } else if (listType === 'OL') {
                            const parent = element.parentElement;
                            const index = Array.from(parent.children).indexOf(element) + 1;
                            markdown += '\n' + indent + `${index}. `;
                        }
                        processChildren(element, depth);
                        break;
                    
                    // Links
                    case 'A':
                        const href = element.getAttribute('href');
                        const title = element.getAttribute('title');
                        if (href) {
                            markdown += '[';
                            processChildren(element, depth);
                            markdown += '](' + href;
                            if (title) {
                                markdown += ' "' + title + '"';
                            }
                            markdown += ')';
                        } else {
                            processChildren(element, depth);
                        }
                        break;
                    
                    // Images
                    case 'IMG':
                        const src = element.getAttribute('src');
                        const alt = element.getAttribute('alt') || '';
                        if (src) {
                            markdown += '![' + alt + '](' + src + ')';
                        }
                        break;
                    
                    // Tables
                    case 'TABLE':
                        markdown += '\n\n';
                        processTable(element);
                        markdown += '\n\n';
                        break;
                    
                    // Horizontal rules
                    case 'HR':
                        markdown += '\n\n---\n\n';
                        break;
                    
                    // Definition lists
                    case 'DL':
                        markdown += '\n';
                        processChildren(element, depth);
                        markdown += '\n';
                        break;
                    
                    case 'DT':
                        markdown += '\n**';
                        processChildren(element, depth);
                        markdown += '**\n';
                        break;
                    
                    case 'DD':
                        markdown += ': ';
                        processChildren(element, depth);
                        markdown += '\n';
                        break;
                    
                    // Inline code-like elements
                    case 'KBD':
                    case 'SAMP':
                    case 'VAR':
                        markdown += '`';
                        processChildren(element, depth);
                        markdown += '`';
                        break;
                    
                    // Strikethrough
                    case 'DEL':
                    case 'S':
                    case 'STRIKE':
                        markdown += '~~';
                        processChildren(element, depth);
                        markdown += '~~';
                        break;
                    
                    // Superscript/Subscript
                    case 'SUP':
                        markdown += '^';
                        processChildren(element, depth);
                        markdown += '^';
                        break;
                    
                    case 'SUB':
                        markdown += '~';
                        processChildren(element, depth);
                        markdown += '~';
                        break;
                    
                    // Default: process children
                    default:
                        // Don't process children for PRE and CODE as we handle them specially
                        if (tagName !== 'PRE' && tagName !== 'CODE') {
                            processChildren(element, depth);
                        }
                        break;
                }
            }
        };
        
        const processChildren = (element, depth, insideCode = false) => {
            for (const child of element.childNodes) {
                processNode(child, depth, insideCode);
            }
        };
        
        const processTable = (tableElement) => {
            const rows = [];
            const thead = tableElement.querySelector('thead');
            const tbody = tableElement.querySelector('tbody');
            
            // Process header
            let headerRow = [];
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
                const rowData = [];
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

    // These methods are now inherited from BaseFileProcessor
}

export default EPUBProcessor;