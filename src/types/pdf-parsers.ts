// ==================== PDF Parsers Types ====================
// PDFパーサーシステムの型定義

import type { ProcessingResult } from './processors.js';
import type { FileInfo } from './core.js';
import type { ImageManager } from '../image-manager.js';

/**
 * サポートされているPDFパーサーライブラリ
 */
export type PDFParserType = 'builtin' | 'pdfjs-dist' | 'pdfjs-advanced' | 'unpdf';

/**
 * PDFパーサーの設定オプション
 */
export interface PDFParserOptions {
  /** 画像抽出を有効にするかどうか */
  readonly extractImages?: boolean;
  /** 高品質画像を生成するかどうか */
  readonly highQualityImages?: boolean;
  /** テーブル認識を有効にするかどうか */
  readonly detectTables?: boolean;
  /** OCRを有効にするかどうか（pdf2mdで利用可能） */
  readonly enableOCR?: boolean;
  /** レイアウト保持の厳密さ */
  readonly layoutPreservation?: 'strict' | 'moderate' | 'loose';
}

/**
 * PDFパーサーの基本情報
 */
export interface PDFParserInfo {
  readonly type: PDFParserType;
  readonly name: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly strengths: readonly string[];
  readonly limitations: readonly string[];
  readonly isAvailable: boolean;
  readonly requiresInternet: boolean;
}

/**
 * PDFパーサーの抽象インターフェース
 */
export interface IPDFParser {
  readonly info: PDFParserInfo;
  readonly defaultOptions: PDFParserOptions;

  /**
   * PDFファイルを解析してMarkdownに変換
   * @param arrayBuffer - PDFファイルのバイナリデータ
   * @param fileInfo - ファイル情報
   * @param options - パーサー固有のオプション
   */
  parse(arrayBuffer: ArrayBuffer, fileInfo?: FileInfo, options?: PDFParserOptions): Promise<ProcessingResult>;

  /**
   * パーサーが利用可能かどうかをチェック
   */
  isAvailable(): Promise<boolean>;

  /**
   * 画像マネージャーを取得（画像が抽出された場合）
   */
  getImageManager(): ImageManager | null;
}

/**
 * PDFパーサー選択のためのUI設定
 */
export interface PDFParserSelectionConfig {
  readonly showModal: boolean;
  readonly allowSkip: boolean;
  readonly rememberChoice: boolean;
  readonly defaultParser?: PDFParserType;
}

/**
 * PDFパーサー選択結果
 */
export interface PDFParserSelection {
  readonly parser: PDFParserType;
  readonly options: PDFParserOptions;
  readonly rememberChoice: boolean;
}

/**
 * PDFパーサーファクトリーのインターフェース
 */
export interface IPDFParserFactory {
  /**
   * 利用可能なパーサー一覧を取得
   */
  getAvailableParsers(): Promise<readonly PDFParserInfo[]>;

  /**
   * 指定されたタイプのパーサーインスタンスを作成
   * @param type - パーサータイプ
   */
  createParser(type: PDFParserType): Promise<IPDFParser>;

  /**
   * デフォルトパーサーを取得
   */
  getDefaultParser(): Promise<IPDFParser>;
}

/**
 * PDFパーサー選択UI用のイベントデータ
 */
export interface PDFParserSelectEvent {
  readonly type: 'parser-selected' | 'parser-cancelled';
  readonly parser?: PDFParserType;
  readonly options?: PDFParserOptions;
  readonly rememberChoice?: boolean;
}

/**
 * PDF.jsの型定義
 * グローバル宣言はglobal.d.tsで定義済み
 */

export interface PDFDocument {
  numPages: number;
  getPage(pageNum: number): Promise<PDFPage>;
}

export interface PDFPage {
  getTextContent(): Promise<TextContent>;
  getOperatorList(): Promise<OperatorList>;
  getViewport(options: { scale: number }): PDFViewport;
  objs: {
    get(name: string): Promise<any>;
  };
}

export interface TextContent {
  items: TextItem[];
}

export interface TextItem {
  str: string;
  transform: number[];
  height: number;
  fontName: string;
  width: number;
}

export interface OperatorList {
  fnArray: number[];
  argsArray: any[][];
}

export interface PDFViewport {
  width: number;
  height: number;
}

export interface LineItem {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontName: string;
  width: number;
}

export type LineType = 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'code' | 'toc' | 'paragraph';