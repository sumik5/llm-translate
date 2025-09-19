// ==================== Markdown Generator ====================
// Handles Markdown generation for downloads and exports

export interface MarkdownGenerationOptions {
    title?: string;
    includeMetadata?: boolean;
    includeTimestamp?: boolean;
    extractImages?: boolean;
}

export interface ImageData {
    filename: string;
    data: string; // base64 data
    mimeType: string;
}

export class MarkdownGenerator {
    private imageCounter: number = 0;
    
    /**
     * Extract base64 images from markdown and replace with file references
     */
    private extractAndReplaceImages(markdown: string): { content: string; images: ImageData[] } {
        const images: ImageData[] = [];
        this.imageCounter = 0;
        
        // Pattern to match base64 images in markdown (handles spaces in data URLs)
        const base64ImagePattern = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,\s*([^)]+))\)/g;
        
        const processedContent = markdown.replace(base64ImagePattern, (_match, altText, _dataUrl, mimeType, base64Data) => {
            this.imageCounter++;
            const extension = this.getExtensionFromMimeType(mimeType);
            // Simple numbered filename
            const paddedNumber = this.imageCounter.toString().padStart(3, '0');
            const filename = `${paddedNumber}.${extension}`;
            
            // Remove any whitespace from base64 data
            const cleanBase64Data = base64Data.replace(/\s+/g, '');
            
            images.push({
                filename,
                data: cleanBase64Data,
                mimeType: `image/${mimeType}`
            });
            
            // Replace with simple file reference (no folder)
            return `![${altText}](${filename})`;
        });
        
        return { content: processedContent, images };
    }
    
    /**
     * Get file extension from MIME type
     */
    private getExtensionFromMimeType(mimeType: string): string {
        const mimeMap: { [key: string]: string } = {
            'png': 'png',
            'jpeg': 'jpg',
            'jpg': 'jpg',
            'gif': 'gif',
            'webp': 'webp',
            'svg+xml': 'svg'
        };
        return mimeMap[mimeType.toLowerCase()] || 'png';
    }
    
    /**
     * Convert base64 to blob
     */
    private base64ToBlob(base64: string, mimeType: string): Blob {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
    
    /**
     * Download markdown with extracted images as ZIP
     */
    async downloadMarkdownWithImages(markdownContent: string, filename: string, options: { extractImages?: boolean } = {}): Promise<void> {
        if (options.extractImages && window.JSZip) {
            // Extract and replace images
            const { content, images } = this.extractAndReplaceImages(markdownContent);
            
            
            if (images.length > 0) {
                // Create ZIP file with markdown and images
                try {
                    const zip = new window.JSZip();
                    const baseName = filename.replace(/\.md$/, '');
                    
                    // Add markdown file to ZIP
                    zip.file(`${baseName}.md`, content);
                    
                    // Add images to ZIP
                    for (const image of images) {
                        const blob = this.base64ToBlob(image.data, image.mimeType);
                        zip.file(image.filename, blob);
                    }
                    
                    // Generate and download ZIP
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(zipBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${baseName}.zip`;
                    
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                } catch (error) {
                    console.error('Error creating ZIP file:', error);
                    // Fall back to simple markdown download
                    this.downloadAsMarkdown(content, filename);
                    alert('ZIPファイルの作成に失敗しました。Markdownファイルのみダウンロードします。');
                }
            } else {
                // No images, just download markdown
                this.downloadAsMarkdown(markdownContent, filename);
            }
        } else {
            // Download markdown as-is with base64 images
            this.downloadAsMarkdown(markdownContent, filename);
        }
    }
    /**
     * Generate markdown content with comparison format (original and translation)
     */
    generateComparisonMarkdown(
        originalText: string | null, 
        translatedText: string, 
        options: MarkdownGenerationOptions = {}
    ): string {
        const { title = 'Translation', includeMetadata = true, includeTimestamp = true } = options;
        
        let content = '';
        
        // Add title
        content += `# ${title}\n\n`;
        
        // Add metadata if requested
        if (includeMetadata && includeTimestamp) {
            content += `*Generated on ${new Date().toLocaleString('ja-JP')}*\n\n`;
            content += '---\n\n';
        }
        
        // Add original text section
        if (originalText) {
            content += '## 原文 (Original)\n\n';
            content += originalText;
            content += '\n\n---\n\n';
        }
        
        // Add translated text section
        content += '## 翻訳 (Translation)\n\n';
        content += translatedText;
        
        // Add footer if timestamp is enabled
        if (includeTimestamp) {
            content += '\n\n---\n\n';
            content += `*Generated by LLM Translation Tool - ${new Date().toLocaleString('ja-JP')}*`;
        }
        
        return content;
    }
    
    /**
     * Generate markdown content with translation only
     */
    generateTranslationOnlyMarkdown(
        translatedText: string, 
        options: MarkdownGenerationOptions = {}
    ): string {
        const { title, includeMetadata = false, includeTimestamp = false } = options;
        
        let content = '';
        
        // Add title if provided
        if (title) {
            content += `# ${title}\n\n`;
        }
        
        // Add metadata if requested
        if (includeMetadata && includeTimestamp) {
            content += `*Generated on ${new Date().toLocaleString('ja-JP')}*\n\n`;
            content += '---\n\n';
        }
        
        // Add translated text
        content += translatedText;
        
        // Add footer if timestamp is enabled
        if (includeTimestamp) {
            content += '\n\n---\n\n';
            content += `*Generated by LLM Translation Tool - ${new Date().toLocaleString('ja-JP')}*`;
        }
        
        return content;
    }
    
    /**
     * Download markdown content as a file
     */
    downloadAsMarkdown(markdownContent: string, filename: string): void {
        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * Generate filename with timestamp
     */
    generateFilename(prefix: string = 'translation'): string {
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        return `${prefix}_${dateStr}.md`;
    }
}