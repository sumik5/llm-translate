// ==================== File Processor Types ====================
// ファイル処理関連の型定義

import type { SupportedFileType, FileInfo /*, TranslationChunk */ } from './core.js';

/**
 * ファイル処理結果
 */
export interface ProcessingResult {
  readonly content: string;
  readonly metadata: FileMetadata;
  readonly chunks?: readonly ProcessingChunk[];
}

/**
 * ファイルのメタデータ
 */
export interface FileMetadata {
  readonly originalName: string;
  readonly fileType: SupportedFileType;
  readonly size: number;
  readonly encoding?: string;
  readonly language?: string;
  readonly pageCount?: number;
  readonly wordCount?: number;
  readonly characterCount: number;
  readonly processingTime: number;
  readonly extractedImages?: readonly ImageInfo[];
}

/**
 * 処理チャンク
 */
export interface ProcessingChunk {
  readonly id: string;
  readonly index: number;
  readonly content: string;
  readonly metadata: ChunkMetadata;
}

/**
 * チャンクのメタデータ
 */
export interface ChunkMetadata {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly tokenCount: number;
  readonly type: ChunkType;
}

/**
 * チャンクの種類
 */
export type ChunkType = 
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'code'
  | 'table'
  | 'quote'
  | 'image'
  | 'metadata';

/**
 * 画像情報
 */
export interface ImageInfo {
  readonly id: string;
  readonly src: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly format: string;
  readonly size: number;
}

/**
 * マークダウン変換ルール
 */
export type MarkdownConverter = (content: string) => string;

/**
 * マークダウン変換設定
 */
export interface MarkdownConverters {
  readonly [tag: string]: MarkdownConverter;
}

/**
 * ファイル処理結果 (Main App Compatible)
 */
export interface FileProcessResult {
  readonly text: string;
  readonly imageManager?: any; // ImageManager interface
}

/**
 * 翻訳オプション
 */
export interface TranslationOptions {
  readonly apiUrl: string;
  readonly modelName: string;
  readonly maxChunkTokens: number;
  readonly imageManager?: any;
  readonly onProgress?: (progress: number, message: string) => void;
  readonly onChunkComplete?: (current: number, total: number, chunkText: string) => void;
}

/**
 * Translation Service Interface
 */
export interface TranslationServiceInterface {
  /**
   * API接続をテスト
   * @param apiUrl - API URL
   * @param modelName - モデル名
   */
  testConnection(apiUrl: string, modelName?: string): Promise<boolean>;

  /**
   * テキストを翻訳
   * @param text - 翻訳対象テキスト
   * @param targetLanguage - 対象言語
   * @param options - 翻訳オプション
   */
  translateText(text: string, targetLanguage: string, options: TranslationOptions): Promise<string>;

  /**
   * 翻訳を中止
   * @returns 中止が成功した場合はtrue
   */
  abort(): boolean;
}

/**
 * Markdown Processor Interface
 */
export interface MarkdownProcessorInterface {
  /**
   * マークダウンをHTMLに変換
   * @param markdown - マークダウンテキスト
   */
  toHTML(markdown: string): string;
}

/**
 * ファイルプロセッサの基底インターフェース
 */
export interface FileProcessor {
  /**
   * サポートされているファイルタイプ
   */
  readonly supportedTypes: readonly SupportedFileType[];

  /**
   * ファイルを解析してマークダウンに変換
   * @param arrayBuffer - ファイル内容
   * @param fileInfo - ファイル情報
   * @returns 処理結果
   */
  parse(arrayBuffer: ArrayBuffer, fileInfo?: FileInfo): Promise<ProcessingResult>;

  /**
   * ファイルタイプをサポートしているかチェック
   * @param fileType - チェック対象のファイルタイプ
   */
  supportsType(fileType: SupportedFileType): boolean;
}

/**
 * テキストプロセッサ
 */
export interface TextProcessor extends FileProcessor {
  /**
   * テキストをチャンクに分割
   * @param text - 分割対象のテキスト
   * @param maxTokens - チャンクあたりの最大トークン数
   */
  chunkText(text: string, maxTokens: number): readonly ProcessingChunk[];

  /**
   * トークン数を推定
   * @param text - 対象テキスト
   * @param language - 言語 (推定用)
   */
  estimateTokens(text: string, language?: string): number;
}

/**
 * EPUBプロセッサの固有設定
 */
export interface EPUBProcessorOptions {
  readonly extractImages: boolean;
  readonly preserveFormatting: boolean;
  readonly includeMetadata: boolean;
}

/**
 * EPUBプロセッサ
 */
export interface EPUBProcessor extends FileProcessor {
  /**
   * EPUBファイルのメタデータを抽出
   * @param arrayBuffer - EPUBファイル内容
   */
  extractMetadata(arrayBuffer: ArrayBuffer): Promise<EPUBMetadata>;

  /**
   * 章を個別に抽出
   * @param arrayBuffer - EPUBファイル内容
   */
  extractChapters(arrayBuffer: ArrayBuffer): Promise<readonly EPUBChapter[]>;
}

/**
 * EPUBメタデータ
 */
export interface EPUBMetadata extends FileMetadata {
  readonly title: string;
  readonly author: string;
  readonly publisher?: string;
  readonly language: string;
  readonly identifier: string;
  readonly chapters: readonly string[];
}

/**
 * EPUB章情報
 */
export interface EPUBChapter {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly content: string;
  readonly order: number;
}

/**
 * PDFプロセッサの固有設定
 */
export interface PDFProcessorOptions {
  readonly extractText: boolean;
  readonly extractImages: boolean;
  readonly preserveLayout: boolean;
  readonly mergeTextLines: boolean;
}

/**
 * PDFプロセッサ
 */
export interface PDFProcessor extends FileProcessor {
  /**
   * ページ単位でテキストを抽出
   * @param arrayBuffer - PDFファイル内容
   */
  extractPageTexts(arrayBuffer: ArrayBuffer): Promise<readonly string[]>;

  /**
   * PDFからテキストのみを抽出（レイアウト情報なし）
   * @param arrayBuffer - PDFファイル内容
   */
  extractPlainText(arrayBuffer: ArrayBuffer): Promise<string>;
}

/**
 * マークダウンプロセッサ
 */
export interface MarkdownProcessor extends FileProcessor {
  /**
   * マークダウンをパース
   * @param content - マークダウンテキスト
   */
  parseMarkdown(content: string): MarkdownAST;

  /**
   * マークダウンを正規化
   * @param content - 正規化対象のマークダウン
   */
  normalizeMarkdown(content: string): string;
}

/**
 * マークダウンの抽象構文木
 */
export interface MarkdownAST {
  readonly type: 'root';
  readonly children: readonly MarkdownNode[];
}

/**
 * マークダウンノード
 */
export interface MarkdownNode {
  readonly type: string;
  readonly children?: readonly MarkdownNode[];
  readonly value?: string;
  readonly properties?: Record<string, unknown>;
}

/**
 * 処理設定
 */
export interface ProcessingOptions {
  readonly chunkSize?: number;
  readonly preserveFormatting?: boolean;
  readonly extractImages?: boolean;
  readonly includeMetadata?: boolean;
  readonly language?: string;
}