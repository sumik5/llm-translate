// ==================== UI Types ====================
// UI関連の型定義

import type { 
  DOMSelector, 
  CSSClassName, 
  UIState, 
  // SupportedLanguage, // Unused 
  ProgressInfo, 
  ErrorDetails 
} from './core.js';

/**
 * DOM要素の参照
 */
export interface ElementRefs {
  readonly inputText: HTMLTextAreaElement;
  readonly outputText: HTMLTextAreaElement;
  readonly targetLang: HTMLSelectElement;
  readonly apiUrl: HTMLInputElement;
  readonly modelName: HTMLSelectElement;
  readonly fileInput: HTMLInputElement;
  readonly translateBtn: HTMLButtonElement;
  readonly saveHtmlBtn: HTMLButtonElement;
  readonly markdownPreview: HTMLElement;
  readonly errorMessage: HTMLElement;
  readonly inputCharCount: HTMLElement;
  readonly outputCharCount: HTMLElement;
  readonly progressBar: HTMLElement;
  readonly progressFill: HTMLElement;
  readonly progressInfo: HTMLElement;
  readonly statusMessage: HTMLElement;
  readonly chunkSize: HTMLInputElement;
  readonly refreshModels: HTMLButtonElement;
}

/**
 * イベントハンドラーの型
 */
export type EventHandler<T extends Event = Event> = (event: T) => void | Promise<void>;

/**
 * ファイル選択イベントのハンドラー
 */
export type FileSelectHandler = (file: File) => void | Promise<void>;

/**
 * プログレス更新イベントのハンドラー
 */
export type ProgressUpdateHandler = (progress: ProgressInfo) => void;

/**
 * エラーハンドラー
 */
export type ErrorHandler = (error: ErrorDetails) => void;

/**
 * UI状態変更ハンドラー
 */
export type UIStateChangeHandler = (state: UIState, previousState: UIState) => void;

/**
 * UI コントローラーのインターフェース
 */
export interface UIController {
  /**
   * UI要素を初期化
   */
  initialize(): void;

  /**
   * UI状態を更新
   * @param state - 新しいUI状態
   */
  updateState(state: UIState): void;

  /**
   * プログレスバーを更新
   * @param progress - プログレス情報
   */
  updateProgress(progress: ProgressInfo): void;

  /**
   * エラーを表示
   * @param error - エラー詳細
   */
  showError(error: ErrorDetails): void;

  /**
   * エラー表示をクリア
   */
  clearError(): void;

  /**
   * ローディング状態を設定
   * @param loading - ローディング中かどうか
   */
  setLoading(loading: boolean): void;

  /**
   * UI要素を無効化/有効化
   * @param disabled - 無効化するかどうか
   */
  setDisabled(disabled: boolean): void;
}

/**
 * DOM コントローラー
 */
export interface DOMController {
  /**
   * 要素を取得
   * @param selector - セレクター
   */
  getElement<T extends HTMLElement = HTMLElement>(selector: DOMSelector): T | null;

  /**
   * 複数の要素を取得
   * @param selectors - セレクター配列
   */
  getElements(selectors: readonly DOMSelector[]): ElementRefs;

  /**
   * CSSクラスを追加
   * @param element - 対象要素
   * @param className - クラス名
   */
  addClass(element: HTMLElement, className: CSSClassName): void;

  /**
   * CSSクラスを削除
   * @param element - 対象要素
   * @param className - クラス名
   */
  removeClass(element: HTMLElement, className: CSSClassName): void;

  /**
   * CSSクラスをトグル
   * @param element - 対象要素
   * @param className - クラス名
   */
  toggleClass(element: HTMLElement, className: CSSClassName): void;

  /**
   * 要素の表示/非表示を切り替え
   * @param element - 対象要素
   * @param visible - 表示するかどうか
   */
  setVisible(element: HTMLElement, visible: boolean): void;

  /**
   * テキスト内容を設定
   * @param element - 対象要素
   * @param text - テキスト内容
   */
  setText(element: HTMLElement, text: string): void;

  /**
   * HTML内容を設定
   * @param element - 対象要素
   * @param html - HTML内容
   */
  setHTML(element: HTMLElement, html: string): void;
}

/**
 * フォーム要素の値の型
 */
export type FormValue = string | number | boolean | File | null;

/**
 * フォームデータ
 */
export interface FormData {
  readonly [key: string]: FormValue;
}

/**
 * フォーム バリデーション結果
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: Record<string, string>;
}

/**
 * フォーム マネージャー
 */
export interface FormManager {
  /**
   * フォームデータを取得
   */
  getData(): FormData;

  /**
   * フォームデータを設定
   * @param data - フォームデータ
   */
  setData(data: Partial<FormData>): void;

  /**
   * フォームをバリデート
   */
  validate(): ValidationResult;

  /**
   * フォームをリセット
   */
  reset(): void;

  /**
   * フォームの変更を監視
   * @param callback - 変更時のコールバック
   */
  onChange(callback: (data: FormData) => void): () => void;
}

/**
 * ファイルドロップ設定
 */
export interface DropZoneConfig {
  readonly acceptedTypes: readonly string[];
  readonly maxFileSize: number;
  readonly multiple: boolean;
  readonly onDrop: FileSelectHandler;
  readonly onError: ErrorHandler;
}

/**
 * ドロップゾーン マネージャー
 */
export interface DropZoneManager {
  /**
   * ドロップゾーンを初期化
   * @param element - ドロップゾーン要素
   * @param config - 設定
   */
  initialize(element: HTMLElement, config: DropZoneConfig): void;

  /**
   * ドロップゾーンを破棄
   */
  destroy(): void;

  /**
   * ファイルタイプが受け入れ可能かチェック
   * @param file - チェック対象のファイル
   */
  isAcceptableFile(file: File): boolean;
}

/**
 * モーダル設定
 */
export interface ModalConfig {
  readonly title: string;
  readonly content: string;
  readonly type: 'info' | 'warning' | 'error' | 'confirm';
  readonly buttons: readonly ModalButton[];
  readonly closable: boolean;
  readonly backdrop: boolean;
}

/**
 * モーダルボタン
 */
export interface ModalButton {
  readonly text: string;
  readonly type: 'primary' | 'secondary' | 'danger';
  readonly action: () => void | Promise<void>;
}

/**
 * モーダル マネージャー
 */
export interface ModalManager {
  /**
   * モーダルを表示
   * @param config - モーダル設定
   */
  show(config: ModalConfig): Promise<void>;

  /**
   * モーダルを閉じる
   */
  close(): void;

  /**
   * 確認ダイアログを表示
   * @param message - メッセージ
   * @param title - タイトル（オプション）
   */
  confirm(message: string, title?: string): Promise<boolean>;

  /**
   * アラートダイアログを表示
   * @param message - メッセージ
   * @param title - タイトル（オプション）
   */
  alert(message: string, title?: string): Promise<void>;
}

/**
 * UI Manager インターフェース
 */
export interface UIManagerInterface {
  readonly elements: ElementRefs;
  readonly state: {
    startTranslation(): void;
    completeTranslation(): void;
    reset(): void;
  };
  readonly hasUnsavedChanges: boolean;

  /**
   * 文字数を更新
   * @param element - テキスト要素
   * @param countElement - カウント表示要素
   */
  updateCharCount(element: HTMLElement, countElement: HTMLElement): void;

  /**
   * 入力テキストの文字数を更新
   */
  updateInputCharCount(): void;

  /**
   * 出力テキストの文字数を更新
   */
  updateOutputCharCount(): void;

  /**
   * エラーメッセージを表示
   * @param message - エラーメッセージ
   */
  showError(message: string): void;

  /**
   * エラーメッセージを非表示
   */
  hideError(): void;

  /**
   * プログレスバーを表示
   */
  showProgressBar(): void;

  /**
   * プログレスバーを非表示
   */
  hideProgressBar(): void;

  /**
   * プログレス情報を更新
   * @param progress - 進捗率（0-100）
   * @param message - ステータスメッセージ
   */
  updateProgress(progress: number, message: string): void;

  /**
   * プレビューを更新
   * @param text - プレビュー対象のテキスト
   * @param markdownProcessor - マークダウンプロセッサー
   */
  updatePreview(text: string, markdownProcessor: any): void;

  /**
   * モデルドロップダウンを更新
   * @param models - モデル一覧
   */
  updateModelDropdown(models: string[]): Promise<void>;

  /**
   * HTMLファイルをダウンロード
   * @param markdownProcessor - マークダウンプロセッサー
   * @param imageManager - 画像マネージャー
   */
  downloadHtml(markdownProcessor: any, imageManager: any): void;

  /**
   * 変更状態をマーク
   */
  markAsChanged(): void;
}