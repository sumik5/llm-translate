// ==================== Image Manager ====================
// Manages images separately from the main text to avoid translating base64 data

/**
 * Interface for stored image data
 */
interface StoredImageData {
    readonly data: string;
    readonly alt: string;
}

/**
 * Manages images separately from the main text to avoid translating base64 data
 */
export class ImageManager {
    private readonly images: Map<string, StoredImageData>;
    private imageCounter: number;

    constructor() {
        this.images = new Map<string, StoredImageData>();
        this.imageCounter = 0;
    }

    /**
     * Store an image and return a placeholder
     * @param base64Data - Base64 encoded image data
     * @param altText - Alternative text for the image
     * @returns Placeholder string for the image
     */
    storeImage(base64Data: string, altText: string = ''): string {
        this.imageCounter++;
        const imageId = `IMG_${this.imageCounter}`;
        this.images.set(imageId, {
            data: base64Data,
            alt: altText
        });
        // Return a placeholder that won't be translated
        return `[[${imageId}]]`;
    }

    /**
     * Replace placeholders with actual image markdown
     * @param text - Text containing image placeholders
     * @returns Text with placeholders replaced by image markdown
     */
    restoreImages(text: string): string {
        let restoredText = text;
        
        for (const [imageId, imageData] of this.images) {
            const placeholder = `[[${imageId}]]`;
            if (text.includes(placeholder)) {
                const imageMarkdown = `![${imageData.alt}](${imageData.data})`;
                restoredText = restoredText.replace(new RegExp(placeholder.replace(/[[\]]/g, '\\$&'), 'g'), imageMarkdown);
            }
        }
        return restoredText;
    }

    /**
     * Get image data for preview without base64 in main text
     * @param imageId - ID of the image to retrieve
     * @returns Base64 image data or null if not found
     */
    getImageForPreview(imageId: string): string | null {
        const image = this.images.get(imageId);
        return image ? image.data : null;
    }

    /**
     * Clear all stored images
     */
    clear(): void {
        this.images.clear();
        this.imageCounter = 0;
    }

    /**
     * Check if text contains image placeholders
     * @param text - Text to check
     * @returns True if text contains image placeholders
     */
    hasImagePlaceholders(text: string): boolean {
        return /\[\[IMG_\d+\]\]/.test(text);
    }

    /**
     * Extract image placeholders from text
     * @param text - Text to extract placeholders from
     * @returns Array of image IDs found in the text
     */
    extractPlaceholders(text: string): string[] {
        const placeholders: string[] = [];
        const regex = /\[\[IMG_(\d+)\]\]/g;
        let match: RegExpExecArray | null;
        
        while ((match = regex.exec(text)) !== null) {
            placeholders.push(`IMG_${match[1]}`);
        }
        return placeholders;
    }

    /**
     * Get the number of stored images
     * @returns Number of stored images
     */
    get size(): number {
        return this.images.size;
    }

    /**
     * Get all stored image IDs
     * @returns Array of image IDs
     */
    getImageIds(): string[] {
        return Array.from(this.images.keys());
    }

    /**
     * Check if an image with the given ID exists
     * @param imageId - ID to check
     * @returns True if image exists
     */
    hasImage(imageId: string): boolean {
        return this.images.has(imageId);
    }
}

export default ImageManager;