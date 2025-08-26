// ==================== File Processing ====================
// @ts-expect-error - Import type may have compatibility issues
import EPUBProcessor from './epub-processor.js?v=20250126';
// @ts-expect-error - Import type may have compatibility issues
import PDFProcessor from './pdf-processor.js?v=20250126';
// @ts-expect-error - Import type may have compatibility issues
import MarkdownProcessor from './markdown-processor.js?v=20250126';
import type { 
    ProcessingOptions 
} from './types/processors.js';
import type { SupportedFileType, FileInfo } from './types/core.js';
import type { ImageManager } from './image-manager.js';

interface FileProcessingResult {
    text: string;
    imageManager: any | null; // ImageManagerの型は実行時に決定
}

// type ProcessorFunction = () => Promise<string>;

interface ProcessorMap {
    [key: string]: () => Promise<FileProcessingResult>;
}

/**
 * ファイル処理の統合クラス
 * 各ファイル形式に応じた適切なプロセッサーを選択して処理を実行する
 */
class FileProcessor {
    private static epubProcessor: EPUBProcessor = new EPUBProcessor();
    private static pdfProcessor: PDFProcessor = new PDFProcessor();
    private static markdownProcessor: MarkdownProcessor = new MarkdownProcessor();

    /**
     * ファイルを解析して適切なプロセッサーで処理する
     * @param file - 処理対象のFile
     * @param options - 処理オプション（オプション）
     * @returns 処理結果
     */
    static async processFile(file: File, _options?: ProcessingOptions): Promise<FileProcessingResult> {
        const fileType = this.getFileType(file.name);
        const arrayBuffer = await file.arrayBuffer();
        
        let imageManager: ImageManager | null = null;
        
        const fileInfo: FileInfo = {
            name: file.name,
            type: fileType,
            size: file.size,
            lastModified: new Date(file.lastModified)
        };

        const processors: ProcessorMap = {
            'epub': async (): Promise<FileProcessingResult> => {
                const result = await this.epubProcessor.parse(arrayBuffer, fileInfo);
                imageManager = this.epubProcessor.getImageManager();
                return { text: result.content || '', imageManager };
            },
            'pdf': async (): Promise<FileProcessingResult> => {
                const result = await this.pdfProcessor.parse(arrayBuffer, fileInfo);
                imageManager = this.pdfProcessor.getImageManager();
                return { text: result.content, imageManager };
            },
            'md': async (): Promise<FileProcessingResult> => {
                const result = await this.markdownProcessor.parse(arrayBuffer, fileInfo);
                return { text: result.content, imageManager: null };
            },
            'txt': (): Promise<FileProcessingResult> => {
                const text = new TextDecoder('utf-8').decode(arrayBuffer);
                return Promise.resolve({ text, imageManager: null });
            }
        };
        
        const processor = processors[fileType];
        if (!processor) {
            throw new Error(`不正なファイル形式です: ${fileType}`);
        }
        
        const result = await processor();
        return result;
    }

    /**
     * ファイル名から対応するファイルタイプを抽出
     * @param fileName - ファイル名
     * @returns サポートされているファイルタイプ
     * @throws サポートされていないファイル形式の場合
     */
    private static getFileType(fileName: string): SupportedFileType {
        const extension = fileName.split('.').pop()?.toLowerCase();
        
        switch (extension) {
            case 'epub':
                return 'epub';
            case 'pdf':
                return 'pdf';
            case 'md':
            case 'markdown':
                return 'md';
            case 'txt':
                return 'txt';
            default:
                throw new Error(`サポートされていないファイル形式です: ${extension}`);
        }
    }

    /**
     * ファイル形式がサポートされているかチェック
     * @param fileName - ファイル名
     * @returns サポートされている場合true
     */
    static isSupportedFileType(fileName: string): boolean {
        try {
            this.getFileType(fileName);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * サポートされているファイル拡張子の配列を取得
     * @returns サポートされている拡張子配列
     */
    static getSupportedExtensions(): readonly string[] {
        return ['epub', 'pdf', 'md', 'markdown', 'txt'] as const;
    }

    /**
     * 各プロセッサーのインスタンスを取得
     */
    static getProcessors() {
        return {
            epub: this.epubProcessor,
            pdf: this.pdfProcessor,
            markdown: this.markdownProcessor
        };
    }
}

export default FileProcessor;