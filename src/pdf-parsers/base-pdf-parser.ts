// ==================== Base PDF Parser ====================
// 全てのPDFパーサーの基底クラス

import type { 
    IPDFParser, 
    PDFParserType, 
    PDFParserInfo, 
    PDFParserOptions 
} from '../types/pdf-parsers.js';
import type { ProcessingResult } from '../types/processors.js';
import type { FileInfo } from '../types/core.js';
import type { ImageManager } from '../image-manager.js';

/**
 * 全てのPDFパーサーの共通基底クラス
 * 各パーサーの実装はこのクラスを継承する
 */
export abstract class BasePDFParser implements IPDFParser {
    abstract readonly info: PDFParserInfo;
    
    /**
     * デフォルトパーサーオプション
     */
    readonly defaultOptions: PDFParserOptions = {
        extractImages: true,
        highQualityImages: false,
        detectTables: false,
        enableOCR: false,
        layoutPreservation: 'moderate'
    };

    protected imageManager: ImageManager | null = null;

    /**
     * PDFファイルを解析してMarkdownに変換
     * @param arrayBuffer - PDFファイルのバイナリデータ
     * @param fileInfo - ファイル情報
     * @param options - パーサー固有のオプション
     */
    abstract parse(
        arrayBuffer: ArrayBuffer, 
        fileInfo?: FileInfo, 
        options?: PDFParserOptions
    ): Promise<ProcessingResult>;

    /**
     * パーサーが利用可能かどうかをチェック
     */
    async isAvailable(): Promise<boolean> {
        try {
            await this.checkAvailability();
            return true;
        } catch (error) {
            console.warn(`Parser ${this.info.type} is not available:`, error);
            return false;
        }
    }

    /**
     * パーサー固有の利用可能性チェック
     * 各パーサーで実装する
     */
    protected abstract checkAvailability(): Promise<void>;

    /**
     * 画像マネージャーを取得
     */
    getImageManager(): ImageManager | null {
        return this.imageManager;
    }

    /**
     * オプションをマージしてパーサー固有の設定を作成
     */
    protected mergeOptions(options?: PDFParserOptions): PDFParserOptions {
        return {
            ...this.defaultOptions,
            ...options
        };
    }

    /**
     * 共通のMarkdownクリーンアップ処理
     */
    protected cleanMarkdown(content: string): string {
        if (!content) return '';
        
        // 連続する改行を2つに制限
        let cleaned = content.replace(/\n{3,}/g, '\n\n');
        
        // 連続するスペースを1つに制限
        cleaned = cleaned.replace(/[ \t]+/g, ' ');
        
        // 行末の空白を削除
        cleaned = cleaned.replace(/[ \t]+$/gm, '');
        
        // 見出しの前後に適切な改行を追加
        cleaned = cleaned.replace(/\n(#{1,6})/g, '\n\n$1');
        cleaned = cleaned.replace(/(#{1,6}.*)\n([^\n])/g, '$1\n\n$2');
        
        // リストアイテムの前に改行を追加
        cleaned = cleaned.replace(/\n([*\-+]|\d+\.)/g, '\n\n$1');
        cleaned = cleaned.replace(/\n\n\n([*\-+]|\d+\.)/g, '\n\n$1');
        
        return cleaned.trim();
    }

    /**
     * エラーハンドリングを含む安全な処理実行
     */
    protected async safeProcess<T>(
        operation: () => Promise<T>, 
        errorMessage: string
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`${errorMessage}: ${message}`);
        }
    }

    /**
     * 処理結果を作成するヘルパーメソッド
     */
    protected createProcessingResult(
        content: string, 
        fileInfo?: FileInfo, 
        additionalMetadata?: Record<string, any>
    ): ProcessingResult {
        const cleanedContent = this.cleanMarkdown(content);
        const characterCount = cleanedContent.length;
        
        return {
            content: cleanedContent,
            metadata: {
                originalName: fileInfo?.name || 'unknown.pdf',
                fileType: 'pdf',
                size: fileInfo?.size || 0,
                characterCount,
                processingTime: 0,
                parserType: this.info.type,
                parserName: this.info.name,
                extractedImages: this.imageManager ? [] : [],
                ...additionalMetadata
            }
        };
    }

    /**
     * パーサータイプを取得
     */
    getType(): PDFParserType {
        return this.info.type;
    }

    /**
     * パーサー情報を取得
     */
    getInfo(): PDFParserInfo {
        return { ...this.info };
    }

    /**
     * リソースのクリーンアップ
     */
    dispose(): void {
        this.imageManager = null;
    }
}

/**
 * PDFパーサーエラークラス
 */
export class PDFParserError extends Error {
    constructor(
        message: string,
        public readonly parserType: PDFParserType,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'PDFParserError';
    }
}

/**
 * パーサー利用不可エラークラス
 */
export class PDFParserUnavailableError extends PDFParserError {
    constructor(parserType: PDFParserType, reason?: string) {
        super(
            `PDF parser '${parserType}' is not available${reason ? `: ${reason}` : ''}`, 
            parserType
        );
        this.name = 'PDFParserUnavailableError';
    }
}

export default BasePDFParser;