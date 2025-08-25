import EPUBProcessor from './epub-processor.js?v=20250126';
import PDFProcessor from './pdf-processor.js?v=20250126';


// ==================== File Processing ====================
class FileProcessor {
    static async processFile(file) {
        const fileType = file.name.split('.').pop().toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        
        const processors = {
            'epub': async () => {
                const epubProcessor = new EPUBProcessor();
                const result = await epubProcessor.parse(arrayBuffer);
                return result || '';
            },
            'pdf': async () => {
                const pdfProcessor = new PDFProcessor();
                const result = await pdfProcessor.parse(arrayBuffer);
                return result;
            },
            'txt': () => new TextDecoder('utf-8').decode(arrayBuffer),
            'md': () => new TextDecoder('utf-8').decode(arrayBuffer)
        };
        
        const processor = processors[fileType];
        if (!processor) {
            throw new Error(`不正なファイル形式です: ${fileType}`);
        }
        
        try {
            const result = await processor();
            return result;
        } catch (error) {
            throw error;
        }
    }
}

export default FileProcessor;