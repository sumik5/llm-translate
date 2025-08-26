// ==================== Base Classes Types ====================
// 基底クラス用の型定義

import type { 
  FileProcessor, 
  MarkdownConverters, 
  // ProcessingResult, // Unused
  // ProcessingChunk, // Unused
  ChunkType 
} from './processors.js';
// import type { FileInfo } from './core.js'; // Unused

/**
 * 基底ファイルプロセッサクラスの型定義
 */
export interface BaseFileProcessorInterface extends FileProcessor {
  /**
   * マークダウン変換ルール
   */
  readonly markdownConverters: MarkdownConverters;

  /**
   * マークダウン変換ルールを初期化
   * @returns マークダウンコンバーターのマップ
   */
  initializeMarkdownConverters(): MarkdownConverters;

  /**
   * マークダウンテキストをクリーンアップ
   * @param markdown - 生のマークダウンテキスト
   * @returns クリーンアップされたマークダウン
   */
  cleanMarkdown(markdown: string): string;

  /**
   * 要素のクラス名からコード言語を検出
   * @param node - DOM要素
   * @returns 言語識別子または空文字列
   */
  detectCodeLanguage(node: Element): string;

  /**
   * コード内容を書式を保持して抽出
   * @param node - コードを含むDOM要素
   * @returns 書式が保持されたコード内容
   */
  extractCodeContent(node: Element): string;

  /**
   * リストノードからリスト項目を抽出
   * @param listNode - ULまたはOL要素
   * @param isOrdered - 順序付きリストかどうか
   * @returns マークダウン形式のリスト
   */
  extractListFromNode(listNode: Element, isOrdered?: boolean): string;

  /**
   * テキストがコードのように見えるかチェック
   * @param line - チェックする行のテキスト
   * @returns コードのように見える場合はtrue
   */
  looksLikeCode(line: string): boolean;

  /**
   * 行タイプを検出してフォーマット用の識別子を返す
   * @param lineText - 行のテキスト
   * @param avgFontSize - 平均フォントサイズ（利用可能な場合）
   * @returns 行タイプの識別子
   */
  detectLineType(lineText: string, avgFontSize?: number): ChunkType;

  /**
   * ノードからテキストを抽出（サブクラスで実装が必要な場合）
   * @param node - DOM ノード
   * @param isRoot - ルートノードかどうか
   * @param preserveFormatting - 書式を保持するかどうか
   * @returns 抽出されたテキスト
   */
  extractTextFromNode(node: Element, isRoot?: boolean, preserveFormatting?: boolean): string;
}

/**
 * HTMLエレメントの型拡張（Node APIとの互換性のため）
 */
export interface ExtendedElement extends Element {
  readonly innerText?: string;
  readonly textContent: string; // Changed to match parent interface  
  readonly childNodes: NodeListOf<ChildNode>;
  readonly tagName: string;
}

/**
 * DOMノードの型
 */
export interface ExtendedNode extends Node {
  readonly nodeType: number;
  readonly textContent: string | null;
  readonly childNodes: NodeListOf<ChildNode>;
}

/**
 * HTMLElement with extended properties for file processing
 */
export interface ProcessingHTMLElement extends HTMLElement {
  readonly innerText: string; // Made required to match HTMLElement
  readonly textContent: string;
  readonly tagName: string;
  readonly className: string;
  readonly childNodes: NodeListOf<ChildNode>;
  
  /**
   * 属性値を取得
   */
  getAttribute(name: string): string | null;
  
  /**
   * 子要素を検索
   */
  querySelector(selectors: string): Element | null;
  
  /**
   * すべての子要素を検索
   */
  querySelectorAll(selectors: string): NodeListOf<Element>;
}

/**
 * マークダウン変換コンテキスト
 */
export interface MarkdownConversionContext {
  readonly currentDepth: number;
  readonly parentTag?: string;
  readonly preserveWhitespace: boolean;
  readonly isCodeBlock: boolean;
  readonly listLevel: number;
}

/**
 * ノード処理オプション
 */
export interface NodeProcessingOptions {
  readonly preserveFormatting: boolean;
  readonly extractImages: boolean;
  readonly includeMetadata: boolean;
  readonly skipEmptyNodes: boolean;
  readonly normalizeWhitespace: boolean;
}

/**
 * テキスト抽出結果
 */
export interface TextExtractionResult {
  readonly text: string;
  readonly metadata: {
    readonly wordCount: number;
    readonly characterCount: number;
    readonly lineCount: number;
    readonly hasFormatting: boolean;
    readonly detectedLanguage?: string;
  };
}

/**
 * コード検出設定
 */
export interface CodeDetectionConfig {
  readonly languagePatterns: readonly RegExp[];
  readonly codeIndicators: readonly RegExp[];
  readonly minConfidenceScore: number;
  readonly contextLines: number;
}

/**
 * リスト抽出設定
 */
export interface ListExtractionConfig {
  readonly maxDepth: number;
  readonly preserveNesting: boolean;
  readonly detectNumbering: boolean;
  readonly customMarkers: readonly string[];
}

/**
 * ドキュメント構造情報
 */
export interface DocumentStructure {
  readonly headings: readonly HeadingInfo[];
  readonly sections: readonly SectionInfo[];
  readonly codeBlocks: readonly CodeBlockInfo[];
  readonly lists: readonly ListInfo[];
  readonly tables: readonly TableInfo[];
}

/**
 * 見出し情報
 */
export interface HeadingInfo {
  readonly level: number;
  readonly text: string;
  readonly id?: string;
  readonly position: number;
}

/**
 * セクション情報
 */
export interface SectionInfo {
  readonly title: string;
  readonly level: number;
  readonly startPosition: number;
  readonly endPosition: number;
  readonly wordCount: number;
}

/**
 * コードブロック情報
 */
export interface CodeBlockInfo {
  readonly language: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly isInline: boolean;
}

/**
 * リスト情報
 */
export interface ListInfo {
  readonly type: 'ordered' | 'unordered';
  readonly items: readonly string[];
  readonly level: number;
  readonly startPosition: number;
}

/**
 * テーブル情報
 */
export interface TableInfo {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly caption?: string;
  readonly position: number;
}