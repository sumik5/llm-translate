// ==================== Type Guards ====================
// 型ガード関数とバリデーション関数

import type { 
  SupportedFileType, 
  SupportedLanguage, 
  UIState, 
  CSSClassName, 
  DOMSelector,
  ErrorType,
  TranslationStatus,
  FileInfo
} from './core.js';
import type { 
  APIMessage, 
  ChatCompletionResponse, 
  ModelInfo 
} from './api.js';
import type { 
  AppState 
} from './state.js';
import type { 
  ProcessingResult, 
  FileMetadata 
} from './processors.js';

/**
 * サポートされているファイルタイプかどうかをチェック
 */
export function isSupportedFileType(value: unknown): value is SupportedFileType {
  return typeof value === 'string' && 
    ['epub', 'pdf', 'txt', 'md'].includes(value);
}

/**
 * サポートされている言語かどうかをチェック
 */
export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  const supportedLanguages = [
    '日本語', '英語', '中国語', '韓国語', 'スペイン語', 
    'フランス語', 'ドイツ語', 'ロシア語', 'ポルトガル語', 'イタリア語'
  ];
  return typeof value === 'string' && supportedLanguages.includes(value);
}

/**
 * 有効なUI状態かどうかをチェック
 */
export function isValidUIState(value: unknown): value is UIState {
  return typeof value === 'string' && 
    ['idle', 'translating', 'error', 'success'].includes(value);
}

/**
 * 有効なCSSクラス名かどうかをチェック
 */
export function isValidCSSClassName(value: unknown): value is CSSClassName {
  const validClasses = [
    'show', 'loading', 'translating', 'copied', 
    'error', 'success', 'active', 'inactive'
  ];
  return typeof value === 'string' && validClasses.includes(value);
}

/**
 * 有効なDOMセレクターかどうかをチェック
 */
export function isValidDOMSelector(value: unknown): value is DOMSelector {
  const validSelectors = [
    'inputText', 'outputText', 'targetLang', 'apiUrl', 'modelName',
    'fileInput', 'translateBtn', 'saveHtmlBtn', 'markdownPreview',
    'errorMessage', 'inputCharCount', 'outputCharCount', 'progressBar',
    'progressFill', 'progressInfo', 'statusMessage', 'chunkSize', 'refreshModels'
  ];
  return typeof value === 'string' && validSelectors.includes(value);
}

/**
 * 有効なエラータイプかどうかをチェック
 */
export function isValidErrorType(value: unknown): value is ErrorType {
  const validTypes = [
    'validation', 'api-connection', 'api-response', 'file-read',
    'parse', 'translation', 'timeout', 'abort'
  ];
  return typeof value === 'string' && validTypes.includes(value);
}

/**
 * 有効な翻訳ステータスかどうかをチェック
 */
export function isValidTranslationStatus(value: unknown): value is TranslationStatus {
  const validStatuses = ['pending', 'in-progress', 'completed', 'failed', 'cancelled'];
  return typeof value === 'string' && validStatuses.includes(value);
}

/**
 * ファイル情報オブジェクトかどうかをチェック
 */
export function isFileInfo(value: unknown): value is FileInfo {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return typeof obj.name === 'string' &&
    isSupportedFileType(obj.type) &&
    typeof obj.size === 'number' &&
    obj.lastModified instanceof Date;
}

/**
 * APIメッセージオブジェクトかどうかをチェック
 */
export function isAPIMessage(value: unknown): value is APIMessage {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return ['user', 'assistant', 'system'].includes(obj.role as string) &&
    typeof obj.content === 'string';
}

/**
 * チャット完了レスポンスかどうかをチェック
 */
export function isChatCompletionResponse(value: unknown): value is ChatCompletionResponse {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' &&
    typeof obj.object === 'string' &&
    typeof obj.created === 'number' &&
    typeof obj.model === 'string' &&
    Array.isArray(obj.choices) &&
    obj.choices.every((choice: unknown) => {
      if (!choice || typeof choice !== 'object') return false;
      const choiceObj = choice as Record<string, unknown>;
      return isAPIMessage(choiceObj.message) &&
        typeof choiceObj.index === 'number';
    });
}

/**
 * モデル情報オブジェクトかどうかをチェック
 */
export function isModelInfo(value: unknown): value is ModelInfo {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' &&
    typeof obj.object === 'string' &&
    typeof obj.created === 'number' &&
    typeof obj.owned_by === 'string';
}

/**
 * アプリケーション状態オブジェクトかどうかをチェック
 */
export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return typeof obj.hasUnsavedChanges === 'boolean' &&
    typeof obj.translatedHtml === 'string' &&
    typeof obj.isTranslating === 'boolean' &&
    typeof obj.currentProgress === 'number' &&
    typeof obj.currentStatus === 'string' &&
    (obj.lastError === null || typeof obj.lastError === 'object');
}

/**
 * 処理結果オブジェクトかどうかをチェック
 */
export function isProcessingResult(value: unknown): value is ProcessingResult {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return typeof obj.content === 'string' &&
    isFileMetadata(obj.metadata);
}

/**
 * ファイルメタデータオブジェクトかどうかをチェック
 */
export function isFileMetadata(value: unknown): value is FileMetadata {
  if (!value || typeof value !== 'object') return false;
  
  const obj = value as Record<string, unknown>;
  return typeof obj.originalName === 'string' &&
    isSupportedFileType(obj.fileType) &&
    typeof obj.size === 'number' &&
    typeof obj.characterCount === 'number' &&
    typeof obj.processingTime === 'number';
}

/**
 * HTMLElementかどうかをチェック
 */
export function isHTMLElement(value: unknown): value is HTMLElement {
  return value instanceof HTMLElement;
}

/**
 * Elementかどうかをチェック
 */
export function isElement(value: unknown): value is Element {
  return value instanceof Element;
}

/**
 * Nodeかどうかをチェック
 */
export function isNode(value: unknown): value is Node {
  return value instanceof Node;
}

/**
 * FileListかどうかをチェック
 */
export function isFileList(value: unknown): value is FileList {
  return value instanceof FileList;
}

/**
 * Fileかどうかをチェック
 */
export function isFile(value: unknown): value is File {
  return value instanceof File;
}

/**
 * Blobかどうかをチェック
 */
export function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

/**
 * ArrayBufferかどうかをチェック
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

/**
 * AbortSignalかどうかをチェック
 */
export function isAbortSignal(value: unknown): value is AbortSignal {
  return value instanceof AbortSignal;
}

/**
 * Promiseかどうかをチェック
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (value instanceof Promise) || 
    (!!value && typeof value === 'object' && typeof (value as any).then === 'function');
}

/**
 * 関数かどうかをチェック
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * 文字列が空でないかチェック
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 数値が正の値かチェック
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && !isNaN(value);
}

/**
 * 数値が非負の値かチェック
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && !isNaN(value);
}

/**
 * 配列が空でないかチェック
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * オブジェクトが空でないかチェック
 */
export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return value !== null && 
    typeof value === 'object' && 
    !Array.isArray(value) &&
    Object.keys(value).length > 0;
}