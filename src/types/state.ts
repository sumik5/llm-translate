// ==================== State Management Types ====================
// 状態管理関連の型定義

import type { ErrorDetails, /*ProgressInfo,*/ TranslationSession } from './core.js';

/**
 * アプリケーションの状態
 */
export interface AppState {
  readonly hasUnsavedChanges: boolean;
  readonly translatedHtml: string;
  readonly isTranslating: boolean;
  readonly currentProgress: number;
  readonly currentStatus: string;
  readonly lastError: ErrorDetails | null;
  readonly currentSession?: TranslationSession;
}

/**
 * 状態変更のタイプ
 */
export type StateChangeType = 
  | 'update'
  | 'reset'
  | 'translation-start'
  | 'translation-complete'
  | 'translation-error'
  | 'progress-update';

/**
 * 状態変更イベント
 */
export interface StateChangeEvent<T = unknown> {
  readonly type: StateChangeType;
  readonly key: keyof AppState;
  readonly newValue: T;
  readonly oldValue: T;
  readonly timestamp: Date;
}

/**
 * 状態変更リスナー
 */
export type StateChangeListener<T = unknown> = (
  newValue: T,
  oldValue: T,
  event: StateChangeEvent<T>
) => void;

/**
 * 状態更新の定義
 */
export type StateUpdates = Partial<AppState>;

/**
 * 状態マネージャーのインターフェース
 */
export interface StateManager {
  /**
   * 状態値を取得
   * @param key - 状態キー
   */
  get<K extends keyof AppState>(key: K): AppState[K];

  /**
   * 状態値を設定
   * @param key - 状態キー
   * @param value - 新しい値
   */
  set<K extends keyof AppState>(key: K, value: AppState[K]): void;

  /**
   * 複数の状態を一括更新
   * @param updates - 更新内容
   */
  update(updates: StateUpdates): void;

  /**
   * 変更フラグを設定
   */
  markAsChanged(): void;

  /**
   * 変更フラグをクリア
   */
  clearChanges(): void;

  /**
   * 翻訳開始状態に設定
   */
  startTranslation(): void;

  /**
   * 翻訳完了状態に設定
   * @param html - 翻訳されたHTML (オプション)
   */
  completeTranslation(html?: string): void;

  /**
   * エラー状態に設定
   * @param error - エラー詳細
   */
  setError(error: ErrorDetails): void;

  /**
   * プログレス情報を更新
   * @param percentage - 進捗率
   * @param message - ステータスメッセージ (オプション)
   */
  updateProgress(percentage: number, message?: string): void;

  /**
   * 状態変更を監視
   * @param key - 監視する状態キー
   * @param callback - コールバック関数
   * @returns アンサブスクライブ関数
   */
  subscribe<K extends keyof AppState>(
    key: K,
    callback: StateChangeListener<AppState[K]>
  ): () => void;

  /**
   * 状態をリセット
   */
  reset(): void;

  /**
   * 現在の状態のスナップショットを取得
   */
  getSnapshot(): Readonly<AppState>;
}

/**
 * 状態の持続化設定
 */
export interface PersistenceConfig {
  readonly key: string;
  readonly storage: Storage;
  readonly serialize?: (state: AppState) => string;
  readonly deserialize?: (data: string) => AppState;
  readonly whitelist?: readonly (keyof AppState)[];
  readonly blacklist?: readonly (keyof AppState)[];
}

/**
 * 持続化可能な状態マネージャー
 */
export interface PersistentStateManager extends StateManager {
  /**
   * 状態を保存
   */
  persist(): Promise<void>;

  /**
   * 状態を復元
   */
  restore(): Promise<void>;

  /**
   * 持続化設定を更新
   * @param config - 新しい設定
   */
  updatePersistenceConfig(config: Partial<PersistenceConfig>): void;
}

/**
 * 状態検証器
 */
export interface StateValidator {
  /**
   * 状態を検証
   * @param state - 検証対象の状態
   * @returns 検証結果
   */
  validate(state: Partial<AppState>): {
    readonly isValid: boolean;
    readonly errors: readonly string[];
  };
}