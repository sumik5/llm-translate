// ==================== Core Types ====================
// 基本的なドメイン型と共通インターフェース

/**
 * サポートされているファイル形式
 */
export type SupportedFileType = 'epub' | 'pdf' | 'txt' | 'md';

/**
 * サポートされている言語
 */
export type SupportedLanguage = 
  | '日本語' 
  | '英語' 
  | '中国語' 
  | '韓国語' 
  | 'スペイン語' 
  | 'フランス語' 
  | 'ドイツ語' 
  | 'ロシア語' 
  | 'ポルトガル語' 
  | 'イタリア語';

/**
 * 言語選択肢の構造
 */
export interface LanguageOption {
  readonly value: SupportedLanguage;
  readonly label: string;
}

/**
 * アプリケーションのUI状態
 */
export type UIState = 'idle' | 'translating' | 'error' | 'success';

/**
 * CSSクラス名の定義
 */
export type CSSClassName = 
  | 'show' 
  | 'loading' 
  | 'translating' 
  | 'copied' 
  | 'error' 
  | 'success' 
  | 'active' 
  | 'inactive';

/**
 * DOM要素のセレクター名
 */
export type DOMSelector = 
  | 'inputText'
  | 'outputText'
  | 'targetLang'
  | 'apiUrl'
  | 'modelName'
  | 'fileInput'
  | 'translateBtn'
  | 'saveHtmlBtn'
  | 'markdownPreview'
  | 'errorMessage'
  | 'inputCharCount'
  | 'outputCharCount'
  | 'progressBar'
  | 'progressFill'
  | 'progressInfo'
  | 'statusMessage'
  | 'chunkSize'
  | 'refreshModels';

/**
 * 翻訳結果のステータス
 */
export type TranslationStatus = 
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * エラーの種類
 */
export type ErrorType = 
  | 'validation'
  | 'api-connection'
  | 'api-response'
  | 'file-read'
  | 'parse'
  | 'translation'
  | 'timeout'
  | 'abort';

/**
 * プログレス情報
 */
export interface ProgressInfo {
  readonly percentage: number;
  readonly message: string;
  readonly currentStep?: number;
  readonly totalSteps?: number;
}

/**
 * エラー情報の詳細
 */
export interface ErrorDetails {
  readonly type: ErrorType;
  readonly message: string;
  readonly originalError?: Error;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;
}

/**
 * ファイル情報
 */
export interface FileInfo {
  readonly name: string;
  readonly type: SupportedFileType;
  readonly size: number;
  readonly lastModified: Date;
}

/**
 * 翻訳チャンクの情報
 */
export interface TranslationChunk {
  readonly id: string;
  readonly index: number;
  readonly originalText: string;
  readonly translatedText?: string;
  readonly status: TranslationStatus;
  readonly tokenCount: number;
  readonly error?: ErrorDetails;
}

/**
 * 翻訳セッションの情報
 */
export interface TranslationSession {
  readonly id: string;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly sourceLanguage?: SupportedLanguage;
  readonly targetLanguage: SupportedLanguage;
  readonly chunks: readonly TranslationChunk[];
  readonly totalTokens: number;
  readonly status: TranslationStatus;
  readonly progress: ProgressInfo;
}