// ==================== Constants ====================
// TypeScript版の定数定義

import type { 
  APIConfig, 
  TokenEstimationConfig, 
  TranslationCompressionRatio 
} from './types/config.js';
import type { 
  LanguageOption, 
  SupportedFileType, 
  UIState, 
  CSSClassName, 
  DOMSelector 
} from './types/core.js';

/**
 * APIの設定定数
 */
export const API_CONFIG: APIConfig = {
  defaultEndpoint: 'http://127.0.0.1:1234',
  defaultModel: 'local-model',
  temperature: 0.3,
  maxTokens: 10000,
  chunkMaxTokens: 5000,
  timeout: 600000, // 10 minutes
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
} as const;

/**
 * サポートされているファイル形式
 */
export const FILE_TYPES: Record<string, SupportedFileType> = {
  EPUB: 'epub',
  PDF: 'pdf',
  TEXT: 'txt',
  MARKDOWN: 'md',
} as const;

/**
 * サポートされている言語の一覧
 */
export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { value: '日本語', label: '日本語' },
  { value: '英語', label: '英語' },
  { value: '中国語', label: '中国語' },
  { value: '韓国語', label: '韓国語' },
  { value: 'スペイン語', label: 'スペイン語' },
  { value: 'フランス語', label: 'フランス語' },
  { value: 'ドイツ語', label: 'ドイツ語' },
  { value: 'ロシア語', label: 'ロシア語' },
  { value: 'ポルトガル語', label: 'ポルトガル語' },
  { value: 'イタリア語', label: 'イタリア語' },
] as const;

/**
 * 翻訳圧縮率の設定
 */
export const TRANSLATION_COMPRESSION_RATIO: TranslationCompressionRatio = {
  JA_TO_EN: 0.65,  // Japanese to English typically compresses to 65%
  EN_TO_JA: 1.5,   // English to Japanese typically expands by 150%
  DEFAULT: 1.0     // No change for other language pairs
} as const;

/**
 * トークン推定の設定
 */
export const TOKEN_ESTIMATION: TokenEstimationConfig = {
  japaneseMultiplier: 2,
  englishMultiplier: 1.3,
  otherMultiplier: 0.5,
  defaultChunkSize: 500,
  maxChunkSize: 12000,
  translationCompressionRatio: TRANSLATION_COMPRESSION_RATIO,
} as const;

/**
 * UIの状態定数
 */
export const UI_STATES: Record<string, UIState> = {
  IDLE: 'idle',
  TRANSLATING: 'translating',
  ERROR: 'error',
  SUCCESS: 'success',
} as const;

/**
 * エラーメッセージの定数
 * 関数を含むメッセージは型安全な関数として定義
 */
export const ERROR_MESSAGES = {
  NO_TEXT: '翻訳するテキストを入力してください',
  NO_PROMPT_CONFIG: 'プロンプト設定が読み込まれていません。prompts.jsファイルが存在することを確認してください。',
  NO_PROMPT_TEMPLATE: 'プロンプトテンプレートが設定されていません',
  API_CONNECTION_ERROR: 'LM Studio APIに接続できません',
  API_GENERAL_ERROR: 'LM Studio APIへの接続に失敗しました',
  API_TIMEOUT_ERROR: 'APIリクエストがタイムアウトしました',
  API_RESPONSE_ERROR: 'APIレスポンスの形式が不正です',
  TRANSLATION_CANCELLED: '翻訳を中止しました',
  TRANSLATION_ABORTED: '翻訳が中止されました',
  CONFIGURATION_ERROR: '設定エラー',
  EPUB_PARSE_ERROR: 'EPUBファイルの解析に失敗しました',
  EPUB_CONTAINER_ERROR: 'META-INF/container.xml not found in EPUB',
  EPUB_ROOTFILE_ERROR: 'rootfile element not found in container.xml',
  EPUB_OPF_ERROR: 'Content OPF file not found',
  PDF_PARSE_ERROR: 'PDFファイルの解析に失敗しました',
  
  // 型安全な関数形式のエラーメッセージ
  INVALID_FILE_TYPE: (type: string): string => `不正なファイル形式です: ${type}`,
  FILE_READ_ERROR: (message: string): string => `ファイル読み込みエラー: ${message}`,
  TRANSLATION_ERROR: (message: string): string => `翻訳エラー: ${message}`,
} as const;

/**
 * DOMセレクターの定数
 */
export const DOM_SELECTORS: Record<string, DOMSelector> = {
  INPUT_TEXT: 'inputText',
  OUTPUT_TEXT: 'outputText',
  TARGET_LANG: 'targetLang',
  API_URL: 'apiUrl',
  MODEL_NAME: 'modelName',
  FILE_INPUT: 'fileInput',
  TRANSLATE_BTN: 'translateBtn',
  SAVE_HTML_BTN: 'saveHtmlBtn',
  MARKDOWN_PREVIEW: 'markdownPreview',
  ERROR_MESSAGE: 'errorMessage',
  INPUT_CHAR_COUNT: 'inputCharCount',
  OUTPUT_CHAR_COUNT: 'outputCharCount',
  PROGRESS_BAR: 'progressBar',
  PROGRESS_FILL: 'progressFill',
  PROGRESS_INFO: 'progressInfo',
  STATUS_MESSAGE: 'statusMessage',
  CHUNK_SIZE: 'chunkSize',
  REFRESH_MODELS: 'refreshModels',
} as const;

/**
 * CSSクラス名の定数
 */
export const CSS_CLASSES: Record<string, CSSClassName> = {
  SHOW: 'show',
  LOADING: 'loading',
  TRANSLATING: 'translating',
  COPIED: 'copied',
  ERROR: 'error',
  SUCCESS: 'success',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

/**
 * 正規表現パターンの定数
 */
export const REGEX_PATTERNS = {
  JAPANESE_CHARS: /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g,
  ENGLISH_WORDS: /[a-zA-Z]+/g,
  CODE_BLOCK_START: /^```\w*/,
  CODE_BLOCK_END: /^```$/,
  CODE_LIKE_LINE: /^\s*(if|for|while|function|def|class|import|export|const|let|var|return)\s|^[\s]{4,}[\w]/,
  BULLET_POINTS: /^[•·▪▫◦‣⁃➢➣→\-*]\s+/,
  NUMBERED_LIST: /^\d+[.)]\s+/,
  LETTER_LIST: /^[a-z][.)]\s+/i,
  LANGUAGE_CLASS: [
    /language-([\w+-]+)/,
    /lang-([\w+-]+)/,
    /brush:\s*([\w+-]+)/,
    /highlight-([\w+-]+)/,
  ],
} as const;

/**
 * 不要なプレフィックスの一覧
 */
export const UNWANTED_PREFIXES: readonly string[] = [
  '翻訳後の日本語テキスト:',
  '翻訳後のテキスト:',
  '日本語翻訳:',
  '以下が翻訳結果です:',
  '翻訳結果:',
  'Here is the translation:',
  'Translation:',
] as const;

// 型ガード関数

/**
 * サポートされているファイルタイプかどうかをチェック
 */
export function isSupportedFileType(value: string): value is SupportedFileType {
  return Object.values(FILE_TYPES).includes(value as SupportedFileType);
}

/**
 * サポートされている言語かどうかをチェック
 */
export function isSupportedLanguage(value: string): value is SupportedFileType {
  return SUPPORTED_LANGUAGES.some(lang => lang.value === value);
}

/**
 * 有効なUI状態かどうかをチェック
 */
export function isValidUIState(value: string): value is UIState {
  return Object.values(UI_STATES).includes(value as UIState);
}

/**
 * 有効なCSSクラス名かどうかをチェック
 */
export function isValidCSSClassName(value: string): value is CSSClassName {
  return Object.values(CSS_CLASSES).includes(value as CSSClassName);
}

/**
 * 有効なDOMセレクターかどうかをチェック
 */
export function isValidDOMSelector(value: string): value is DOMSelector {
  return Object.values(DOM_SELECTORS).includes(value as DOMSelector);
}

// 後方互換性のための古い形式のエクスポート（gradual migrationのため）
export default {
  API_CONFIG,
  FILE_TYPES,
  SUPPORTED_LANGUAGES,
  TOKEN_ESTIMATION,
  UI_STATES,
  ERROR_MESSAGES,
  DOM_SELECTORS,
  CSS_CLASSES,
  REGEX_PATTERNS,
  UNWANTED_PREFIXES,
};