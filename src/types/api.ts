// ==================== API Types ====================
// API関連の型定義

import type { SupportedLanguage, ErrorDetails } from './core.js';

/**
 * APIリクエストのメッセージ
 */
export interface APIMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

/**
 * チャット完了APIのリクエストボディ
 */
export interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly APIMessage[];
  readonly temperature: number;
  readonly max_tokens: number;
  readonly stream: boolean;
}

/**
 * APIレスポンスの選択肢
 */
export interface APIChoice {
  readonly message: APIMessage;
  readonly index: number;
  readonly finish_reason: string;
}

/**
 * チャット完了APIのレスポンス
 */
export interface ChatCompletionResponse {
  readonly id: string;
  readonly object: string;
  readonly created: number;
  readonly model: string;
  readonly choices: readonly APIChoice[];
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

/**
 * 利用可能なモデル情報
 */
export interface ModelInfo {
  readonly id: string;
  readonly object: string;
  readonly created: number;
  readonly owned_by: string;
}

/**
 * モデルリストAPIのレスポンス
 */
export interface ModelsResponse {
  readonly data: readonly ModelInfo[];
  readonly object: string;
}

/**
 * APIエラーレスポンス
 */
export interface APIErrorResponse {
  readonly error: {
    readonly message: string;
    readonly type: string;
    readonly code: string;
  };
}

/**
 * API操作の種類
 */
export type APIOperation = 'translate' | 'test-connection' | 'fetch-models' | 'request';

/**
 * リクエスト設定
 */
export interface RequestConfig {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly timeout?: number;
}

/**
 * リクエスト結果
 */
export interface RequestResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: ErrorDetails;
  readonly status: number;
  readonly headers: Headers;
}

/**
 * APIクライアントのインターフェース
 */
export interface APIClient {
  /**
   * テキストを翻訳
   * @param text - 翻訳対象のテキスト
   * @param targetLanguage - ターゲット言語
   * @param apiUrl - API URL (オプション)
   * @param modelName - モデル名 (オプション)
   * @param signal - AbortSignal (オプション)
   * @returns 翻訳結果
   */
  translate(
    text: string,
    targetLanguage: SupportedLanguage,
    apiUrl?: string,
    modelName?: string,
    signal?: AbortSignal
  ): Promise<string>;

  /**
   * API接続をテスト
   * @param apiUrl - API URL
   * @param modelName - モデル名
   * @returns 接続可否
   */
  testConnection(apiUrl: string, modelName: string): Promise<boolean>;

  /**
   * 利用可能なモデルを取得
   * @param apiUrl - API URL
   * @returns モデルリスト
   */
  fetchAvailableModels(apiUrl: string): Promise<readonly ModelInfo[]>;
}

/**
 * リトライ設定
 */
export interface RetryConfig {
  readonly attempts: number;
  readonly delay: number;
  readonly backoff: 'linear' | 'exponential';
  readonly retryableErrors: readonly string[];
}

/**
 * HTTP リクエスト実行器
 */
export interface HTTPClient {
  /**
   * HTTPリクエストを実行
   * @param url - リクエストURL
   * @param config - リクエスト設定
   */
  request<T>(url: string, config: RequestConfig): Promise<RequestResult<T>>;

  /**
   * リトライ付きでリクエストを実行
   * @param url - リクエストURL
   * @param config - リクエスト設定
   * @param retryConfig - リトライ設定
   */
  requestWithRetry<T>(
    url: string,
    config: RequestConfig,
    retryConfig: RetryConfig
  ): Promise<RequestResult<T>>;
}

/**
 * APIClientInterface for compatibility
 */
export interface APIClientInterface {
  /**
   * 利用可能なモデル一覧を取得
   * @param apiUrl - API URL
   */
  fetchAvailableModels(apiUrl: string): Promise<string[]>;

  /**
   * API接続テスト
   * @param apiUrl - API URL
   * @param modelName - モデル名
   */
  testConnection(apiUrl: string, modelName?: string): Promise<boolean>;
}