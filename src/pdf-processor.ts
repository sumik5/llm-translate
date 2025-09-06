// ==================== PDF Processor ====================
// @ts-expect-error - Import type may have compatibility issues
import { BaseFileProcessor } from './base-file-processor.js?v=20250126';
// @ts-expect-error - Import type may have compatibility issues
import { ERROR_MESSAGES } from './constants.js?v=20250126';
import { MarkdownFormatter } from './markdown-formatter.js';
import PDFParserFactory from './pdf-parsers/parser-factory.js';
import PDFParserSelector from './pdf-parser-selector.js';
import type { 
    ProcessingResult
} from './types/processors.js';
import type { SupportedFileType, FileInfo } from './types/core.js';
import type { 
    PDFParserOptions,
    PDFParserSelection
} from './types/pdf-parsers.js';
import type { ImageManager } from './image-manager.js';


/**
 * PDF形式のファイルを処理するプロセッサー
 * 複数のPDFパーサーライブラリから選択して解析を行う
 */
class PDFProcessor extends BaseFileProcessor {
    private imageManager: ImageManager | null;
    private parserFactory: PDFParserFactory;
    private parserSelector: PDFParserSelector;
    
    readonly supportedTypes: readonly SupportedFileType[] = ['pdf'];

    constructor() {
        super();
        this.imageManager = null;
        this.parserFactory = PDFParserFactory.getInstance();
        this.parserSelector = new PDFParserSelector();
    }

    /**
     * マークダウンを正規化
     * @param content - 正規化対象のマークダウン
     */
    normalizeMarkdown(content: string): string {
        return MarkdownFormatter.ensureProperSpacing(content);
    }

    /**
     * PDFファイルを解析してMarkdownテキストに変換
     * @param arrayBuffer - PDFファイルのバイナリデータ
     * @param fileInfo - ファイル情報（オプション）
     * @param forceParserSelection - パーサー選択を強制するかどうか
     * @returns 処理結果
     */
    async parse(
        arrayBuffer: ArrayBuffer, 
        fileInfo?: FileInfo, 
        forceParserSelection: boolean = false
    ): Promise<ProcessingResult> {
        try {
            // パーサーの選択
            const parserSelection = await this.selectParser(forceParserSelection);
            
            if (!parserSelection) {
                throw new Error('PDF parser selection was cancelled');
            }
            
            // Store selected parser info for potential future use
            
            // 選択されたパーサーでPDFを解析
            const parser = await this.parserFactory.createParser(parserSelection.parser);
            const result = await parser.parse(arrayBuffer, fileInfo, parserSelection.options);
            
            // ImageManagerを取得
            this.imageManager = parser.getImageManager();
            
            return result;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`${ERROR_MESSAGES.PDF_PARSE_ERROR}: ${errorMessage}`);
        }
    }

    /**
     * パーサーを選択する
     * @param _forceSelection - 選択を強制するかどうか（現在は常にポップアップを表示）
     */
    private async selectParser(_forceSelection: boolean = false): Promise<PDFParserSelection | null> {
        // 常にユーザーに選択させる
        // 利用可能なパーサーを取得
        const availableParsers = [...await this.parserFactory.getAvailableParsers()];
        
        if (availableParsers.length === 0) {
            throw new Error('No PDF parsers are available');
        }
        
        // パーサー選択ダイアログを常に表示（デフォルトはBuilt-in）
        return await this.parserSelector.showSelector(availableParsers, 'builtin');
    }

    /**
     * ファイルタイプをサポートしているかチェック
     * @param fileType - チェック対象のファイルタイプ
     */
    supportsType(fileType: SupportedFileType): boolean {
        return this.supportedTypes.includes(fileType);
    }

    /**
     * ページ単位でテキストを抽出
     * @param arrayBuffer - PDFファイル内容
     */
    async extractPageTexts(arrayBuffer: ArrayBuffer): Promise<readonly string[]> {
        // デフォルトパーサーを使用してテキスト抽出
        const parser = await this.parserFactory.getDefaultParser();
        const result = await parser.parse(arrayBuffer);
        
        // 単一ページとして返す（実装簡略化）
        return [result.content];
    }

    /**
     * PDFからテキストのみを抽出（レイアウト情報なし）
     * @param arrayBuffer - PDFファイル内容
     */
    async extractPlainText(arrayBuffer: ArrayBuffer): Promise<string> {
        // プレーンテキスト抽出用の設定でパーサーを実行
        const parser = await this.parserFactory.getDefaultParser();
        const options: PDFParserOptions = {
            extractImages: false,
            detectTables: false,
            enableOCR: false,
            layoutPreservation: 'loose'
        };
        
        const result = await parser.parse(arrayBuffer, undefined, options);
        
        // マークダウン記法を除去してプレーンテキストに変換
        return this.stripMarkdown(result.content);
    }
    
    /**
     * マークダウン記法を除去してプレーンテキストに変換
     * @param markdown - マークダウンテキスト
     */
    private stripMarkdown(markdown: string): string {
        let text = markdown;
        
        // 見出しマーカーを除去
        text = text.replace(/^#{1,6}\s*/gm, '');
        
        // リストマーカーを除去
        text = text.replace(/^\s*[\*\-\+]\s+/gm, '');
        text = text.replace(/^\s*\d+\.\s+/gm, '');
        
        // リンクを除去
        text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        
        // 画像を除去
        text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
        
        // 強調記法を除去
        text = text.replace(/\*\*([^\*]+)\*\*/g, '$1');
        text = text.replace(/\*([^\*]+)\*/g, '$1');
        text = text.replace(/__([^_]+)__/g, '$1');
        text = text.replace(/_([^_]+)_/g, '$1');
        
        // コードブロックを除去
        text = text.replace(/```[\s\S]*?```/g, '');
        text = text.replace(/`([^`]+)`/g, '$1');
        
        // 水平線を除去
        text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '');
        
        // 過剰な空白を正規化
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.replace(/[ \t]+/g, ' ');
        
        return text.trim();
    }
    
    /**
     * 画像マネージャーを取得（翻訳後の画像復元用）
     */
    getImageManager(): ImageManager | null {
        return this.imageManager;
    }

}

export default PDFProcessor;