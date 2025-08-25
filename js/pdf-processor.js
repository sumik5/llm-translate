// ==================== PDF Processor ====================
import { BaseFileProcessor } from './base-file-processor.js?v=20250126';
import { ERROR_MESSAGES } from './constants.js?v=20250126';

class PDFProcessor extends BaseFileProcessor {
    async parse(arrayBuffer) {
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            const pages = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Group text items by lines based on Y position
                const lines = this.groupTextByLines(textContent.items);
                
                // Convert lines to markdown
                const pageMarkdown = this.convertLinesToMarkdown(lines);
                
                if (pageMarkdown.trim()) {
                    const separator = pageNum > 1 ? '\n\n---\n\n' : '';
                    const pageHeader = `## Page ${pageNum}\n\n`;
                    pages.push(separator + pageHeader + pageMarkdown);
                }
            }
            
            return pages.join('');
        } catch (error) {
            throw new Error(`${ERROR_MESSAGES.PDF_PARSE_ERROR}: ${error.message}`);
        }
    }
    
    groupTextByLines(items) {
        if (!items || items.length === 0) return [];
        
        // Group items by Y position (with tolerance)
        const lineMap = new Map();
        const tolerance = 1.5; // Reduced tolerance for better line detection
        
        for (const item of items) {
            if (!item.str) continue; // Don't skip empty strings - they might be important spaces
            
            const y = Math.round(item.transform[5] * 10) / 10; // More precise Y position
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
            
            lineMap.get(lineY).push({
                text: item.str,
                x: item.transform[4],
                y: y,
                fontSize: item.height,
                fontName: item.fontName,
                width: item.width
            });
        }
        
        // Sort lines by Y position (top to bottom)
        const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])  // PDF Y coordinates are bottom-up
            .map(([y, items]) => {
                // Sort items in each line by X position
                const sortedItems = items.sort((a, b) => a.x - b.x);
                
                // Combine items with proper spacing
                const combinedLine = this.combineLineItems(sortedItems);
                return combinedLine;
            });
        
        return sortedLines;
    }
    
    combineLineItems(items) {
        if (!items || items.length === 0) return [];
        
        const combined = [];
        let currentItem = null;
        
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
    
    convertLinesToMarkdown(lines) {
        let markdown = '';
        let previousLineType = '';
        let currentParagraph = [];
        let previousY = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineText = line.map(item => item.text).join('').trim();
            
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
            const lineType = this.detectLineType(line, lineText);
            
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
                case 'bullet':
                    if (currentParagraph.length > 0) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [];
                    }
                    // Clean bullet point markers
                    const cleanBullet = lineText.replace(/^[•·▪▫◦‣⁃➢➣→\-\*]\s*/, '');
                    markdown += '- ' + cleanBullet + '\n';
                    break;
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
                default:
                    // Check if line ends with typical sentence endings
                    const endsWithPunctuation = /[.!?:;。！？：；]$/.test(lineText);
                    const startsWithCapital = /^[A-Z]/.test(lineText);
                    
                    // If starts with capital after punctuation, likely new paragraph
                    if (startsWithCapital && previousLineType === 'paragraph' && 
                        currentParagraph.length > 0 && 
                        /[.!?。！？]$/.test(currentParagraph[currentParagraph.length - 1])) {
                        markdown += currentParagraph.join(' ') + '\n\n';
                        currentParagraph = [lineText];
                    } else {
                        currentParagraph.push(lineText);
                    }
                    break;
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
    
    cleanupMarkdown(markdown) {
        // Remove excessive whitespace
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.replace(/[ \t]+/g, ' ');
        
        // Fix list formatting
        markdown = markdown.replace(/\n- /g, '\n\n- ');
        markdown = markdown.replace(/\n\n\n- /g, '\n\n- ');
        
        // Ensure proper spacing around headings
        markdown = markdown.replace(/\n#/g, '\n\n#');
        markdown = markdown.replace(/\n\n\n#/g, '\n\n#');
        
        // Trim and return
        return markdown.trim();
    }
    
    detectLineType(lineItems, lineText) {
        if (!lineItems || lineItems.length === 0) return 'paragraph';
        
        // Check average font size and other characteristics
        const avgFontSize = lineItems.reduce((sum, item) => sum + (item.fontSize || 0), 0) / lineItems.length;
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
}

export default PDFProcessor;