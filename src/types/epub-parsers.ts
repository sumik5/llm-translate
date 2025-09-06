// ==================== EPUB Parser Types ====================
// EPUBパーサーシステムの型定義

import type { ImageManager } from '../image-manager.js';

/**
 * サポートされているEPUBパーサーのタイプ
 */
export type EPUBParserType = 
    | 'builtin'           // 内蔵パーサー（既存の実装）
    | 'lingo-turndown'    // @lingo-reader/epub-parser + turndown
    | 'epubjs';           // epub.js + turndown

/**
 * EPUBパーサーオプション
 */
export interface EPUBParserOptions {
    /** 画像を抽出するか */
    extractImages?: boolean;
    /** チャプター番号を含めるか */
    includeChapterNumbers?: boolean;
    /** メタデータを含めるか */
    includeMetadata?: boolean;
    /** セクション区切りスタイル */
    sectionSeparator?: 'hr' | 'heading' | 'none';
    /** 脚注の処理方法 */
    footnoteStyle?: 'inline' | 'reference' | 'ignore';
    /** スタイル情報を保持するか */
    preserveStyles?: boolean;
}

/**
 * EPUBパース結果
 */
export interface EPUBParseResult {
    /** 変換されたMarkdownコンテンツ */
    content: string;
    /** 抽出されたメタデータ */
    metadata?: EPUBMetadata;
    /** 処理にかかった時間（ミリ秒） */
    processingTime?: number;
    /** 警告メッセージ */
    warnings?: string[];
}

/**
 * EPUBメタデータ
 */
export interface EPUBMetadata {
    title?: string;
    author?: string;
    publisher?: string;
    language?: string;
    description?: string;
    isbn?: string;
    publishDate?: string;
    coverImage?: string;
    chapterCount?: number;
    wordCount?: number;
}

/**
 * EPUBパーサーインターフェース
 */
export interface IEPUBParser {
    /** パーサーのタイプ */
    readonly type: EPUBParserType;
    
    /** パーサーの名前 */
    readonly name: string;
    
    /** パーサーの説明 */
    readonly description: string;
    
    /**
     * パーサーが利用可能かチェック
     */
    isAvailable(): Promise<boolean>;
    
    /**
     * EPUBファイルを解析してMarkdownに変換
     * @param arrayBuffer - EPUBファイルのバイナリデータ
     * @param options - パーサーオプション
     * @returns パース結果
     */
    parse(
        arrayBuffer: ArrayBuffer,
        options?: EPUBParserOptions
    ): Promise<EPUBParseResult>;
    
    /**
     * 画像マネージャーを取得
     */
    getImageManager(): ImageManager | null;
    
    /**
     * リソースをクリーンアップ
     */
    dispose?(): void;
}

/**
 * EPUBパーサー情報（UI表示用）
 */
export interface EPUBParserInfo {
    type: EPUBParserType;
    name: string;
    description: string;
    features: string[];
    strengths: string[];
    limitations: string[];
    isAvailable: boolean;
    requiresInternet: boolean;
}

/**
 * EPUBパーサーファクトリーインターフェース
 */
export interface IEPUBParserFactory {
    /**
     * 利用可能なパーサー一覧を取得
     */
    getAvailableParsers(): Promise<readonly EPUBParserInfo[]>;
    
    /**
     * 指定されたタイプのパーサーインスタンスを作成
     */
    createParser(type: EPUBParserType): Promise<IEPUBParser>;
    
    /**
     * デフォルトパーサーを取得
     */
    getDefaultParser(): Promise<IEPUBParser>;
    
    /**
     * 指定されたパーサーが利用可能かチェック
     */
    isParserAvailable(type: EPUBParserType): Promise<boolean>;
}

/**
 * EPUBパーサー選択結果
 */
export interface EPUBParserSelection {
    parser: EPUBParserType;
    options: EPUBParserOptions;
}

/**
 * EPUBパーサーエラー
 */
export class EPUBParserError extends Error {
    constructor(
        public readonly parserType: EPUBParserType,
        message: string,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = 'EPUBParserError';
    }
}

/**
 * EPUBパーサーが利用不可エラー
 */
export class EPUBParserUnavailableError extends EPUBParserError {
    constructor(parserType: EPUBParserType, reason: string) {
        super(parserType, `Parser '${parserType}' is unavailable: ${reason}`);
        this.name = 'EPUBParserUnavailableError';
    }
}