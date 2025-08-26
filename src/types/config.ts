// ==================== Configuration Types ====================
// 設定関連の型定義

import type { SupportedLanguage } from './core.js';

/**
 * API設定
 */
export interface APIConfig {
  readonly defaultEndpoint: string;
  readonly defaultModel: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly chunkMaxTokens: number;
  readonly timeout: number;
  readonly retryAttempts: number;
  readonly retryDelay: number;
}

/**
 * トークン推定設定
 */
export interface TokenEstimationConfig {
  readonly japaneseMultiplier: number;
  readonly englishMultiplier: number;
  readonly otherMultiplier: number;
  readonly defaultChunkSize: number;
  readonly maxChunkSize: number;
  readonly translationCompressionRatio: TranslationCompressionRatio;
}

/**
 * 翻訳圧縮率
 */
export interface TranslationCompressionRatio {
  readonly JA_TO_EN: number;
  readonly EN_TO_JA: number;
  readonly DEFAULT: number;
}

/**
 * プロンプト設定
 */
export interface PromptSettings {
  readonly template: string;
  readonly instruction: string;
}

/**
 * 翻訳設定
 */
export interface TranslationConfig {
  readonly system: string;
  readonly markdown: PromptSettings;
}

/**
 * アプリケーション設定
 */
export interface AppConfig {
  readonly api: APIConfig;
  readonly translation: TranslationConfig;
  readonly tokenEstimation: TokenEstimationConfig;
}

/**
 * 設定マネージャーのインターフェース
 */
export interface ConfigManager {
  /**
   * プロンプト設定を読み込む
   * @throws {Error} プロンプト設定が見つからない場合
   */
  loadPromptConfig(): boolean;

  /**
   * 現在の設定を取得
   */
  getConfig(): AppConfig;

  /**
   * 翻訳プロンプトを構築
   * @param text - 翻訳対象のテキスト
   * @param targetLanguage - ターゲット言語
   * @returns 構築されたプロンプト
   * @throws {Error} 設定が不正な場合
   */
  buildTranslationPrompt(text: string, targetLanguage: SupportedLanguage): string;
}

/**
 * 設定の検証結果
 */
export interface ConfigValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * 設定検証器のインターフェース
 */
export interface ConfigValidator {
  /**
   * 設定を検証
   * @param config - 検証対象の設定
   */
  validate(config: Partial<AppConfig>): ConfigValidationResult;

  /**
   * API設定を検証
   * @param apiConfig - API設定
   */
  validateApiConfig(apiConfig: Partial<APIConfig>): ConfigValidationResult;

  /**
   * プロンプト設定を検証
   * @param translationConfig - 翻訳設定
   */
  validateTranslationConfig(translationConfig: Partial<TranslationConfig>): ConfigValidationResult;
}

/**
 * Configuration Manager Interface for TypeScript compatibility
 */
export interface ConfigManagerInterface {
  /**
   * プロンプト設定を読み込み
   * @returns 成功した場合はtrue
   */
  loadPromptConfig(): boolean;

  /**
   * 現在の設定を取得
   * @returns アプリケーション設定
   */
  getConfig(): AppConfig;

  /**
   * 翻訳プロンプトを構築
   * @param text - 翻訳対象テキスト
   * @param targetLanguage - 対象言語
   * @returns 構築されたプロンプト
   */
  buildTranslationPrompt(text: string, targetLanguage: string): string;

  /**
   * 設定が読み込み済みかチェック
   * @returns 読み込み済みの場合はtrue
   */
  isConfigLoaded(): boolean;

  /**
   * 設定を更新
   * @param config - 更新する設定
   */
  updateConfig(config: Partial<AppConfig>): void;

  /**
   * 設定をリセット
   */
  resetToDefaults(): void;
}