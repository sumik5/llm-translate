// ==================== PDF Parser Selector ====================
// PDFパーサー選択UIコンポーネント

import type { 
    PDFParserType, 
    PDFParserInfo, 
    PDFParserOptions,
    PDFParserSelection,
    PDFParserSelectEvent
} from './types/pdf-parsers.js';

/**
 * PDFパーサー選択UIクラス
 * モーダルダイアログでパーサーの選択を行う
 */
export class PDFParserSelector {
    private modal: HTMLElement | null = null;
    private availableParsers: PDFParserInfo[] = [];
    private selectedParser: PDFParserType | null = null;
    private rememberChoice: boolean = false;
    private resolveCallback: ((result: PDFParserSelection | null) => void) | null = null;

    constructor() {
        this.createModalHTML();
        this.setupEventListeners();
    }

    /**
     * パーサー選択ダイアログを表示
     * @param parsers 利用可能なパーサー一覧
     * @param defaultParser デフォルトで選択するパーサー
     */
    async showSelector(
        parsers: PDFParserInfo[], 
        defaultParser?: PDFParserType
    ): Promise<PDFParserSelection | null> {
        this.availableParsers = parsers;
        this.selectedParser = defaultParser || parsers.find(p => p.isAvailable)?.type || null;
        
        return new Promise((resolve) => {
            this.resolveCallback = resolve;
            this.renderParserOptions();
            this.showModal();
        });
    }

    /**
     * セッション記憶されたパーサー選択を取得
     */
    getRememberedChoice(): PDFParserSelection | null {
        try {
            const saved = sessionStorage.getItem('pdf-parser-selection');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    parser: parsed.parser,
                    options: parsed.options || {},
                    rememberChoice: true
                };
            }
        } catch (error) {
            console.warn('Failed to load remembered parser choice:', error);
        }
        return null;
    }

    /**
     * パーサー選択をセッションに保存
     */
    private saveChoice(selection: PDFParserSelection): void {
        if (selection.rememberChoice) {
            try {
                sessionStorage.setItem('pdf-parser-selection', JSON.stringify(selection));
            } catch (error) {
                console.warn('Failed to save parser choice:', error);
            }
        }
    }

    /**
     * モーダルのHTMLを作成
     */
    private createModalHTML(): void {
        const modalHTML = `
            <div id="pdf-parser-modal" class="pdf-parser-modal" style="display: none;">
                <div class="pdf-parser-modal-overlay">
                    <div class="pdf-parser-modal-content">
                        <div class="pdf-parser-modal-header">
                            <h2>PDFパーサーを選択</h2>
                            <button class="pdf-parser-modal-close">&times;</button>
                        </div>
                        <div class="pdf-parser-modal-body">
                            <p class="pdf-parser-description">
                                PDFファイルの解析方法を選択してください。各パーサーには異なる特徴があります。
                            </p>
                            <div id="pdf-parser-options" class="pdf-parser-options">
                                <!-- パーサーオプションがここに動的に追加される -->
                            </div>
                            <div class="pdf-parser-advanced-options" style="display: none;">
                                <h3>詳細オプション</h3>
                                <div class="pdf-parser-option-group">
                                    <label>
                                        <input type="checkbox" id="extract-images" checked>
                                        画像を抽出する
                                    </label>
                                </div>
                                <div class="pdf-parser-option-group">
                                    <label>
                                        <input type="checkbox" id="detect-tables">
                                        テーブルを認識する
                                    </label>
                                </div>
                                <div class="pdf-parser-option-group">
                                    <label>
                                        <input type="checkbox" id="enable-ocr">
                                        OCR（光学文字認識）を有効にする
                                    </label>
                                </div>
                                <div class="pdf-parser-option-group">
                                    <label for="layout-preservation">レイアウト保持:</label>
                                    <select id="layout-preservation">
                                        <option value="loose">緩い</option>
                                        <option value="moderate" selected>普通</option>
                                        <option value="strict">厳密</option>
                                    </select>
                                </div>
                            </div>
                            <div class="pdf-parser-session-options">
                                <label>
                                    <input type="checkbox" id="remember-choice">
                                    この選択を今回のセッション中は記憶する
                                </label>
                            </div>
                        </div>
                        <div class="pdf-parser-modal-footer">
                            <button id="show-advanced" class="pdf-parser-btn pdf-parser-btn-secondary">
                                詳細オプション
                            </button>
                            <button id="pdf-parser-cancel" class="pdf-parser-btn pdf-parser-btn-cancel">
                                キャンセル
                            </button>
                            <button id="pdf-parser-ok" class="pdf-parser-btn pdf-parser-btn-primary">
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // CSS追加
        const styleHTML = `
            <style>
                .pdf-parser-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .pdf-parser-modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .pdf-parser-modal-content {
                    background: white;
                    border-radius: 12px;
                    max-width: 800px;
                    width: 90%;
                    max-height: 85vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                }
                
                .pdf-parser-modal-header {
                    padding: 24px 24px 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .pdf-parser-modal-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                    color: #1f2937;
                }
                
                .pdf-parser-modal-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #6b7280;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                }
                
                .pdf-parser-modal-close:hover {
                    background: #f3f4f6;
                    color: #374151;
                }
                
                .pdf-parser-modal-body {
                    padding: 24px;
                }
                
                .pdf-parser-description {
                    color: #6b7280;
                    margin-bottom: 20px;
                    line-height: 1.5;
                }
                
                .pdf-parser-options {
                    margin-bottom: 20px;
                }
                
                .pdf-parser-option {
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 16px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .pdf-parser-option:hover {
                    border-color: #d1d5db;
                    background: #f9fafb;
                }
                
                .pdf-parser-option.selected {
                    border-color: #3b82f6;
                    background: #eff6ff;
                }
                
                .pdf-parser-option.unavailable {
                    opacity: 0.5;
                    cursor: not-allowed;
                    background: #f9fafb;
                }
                
                .pdf-parser-option-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .pdf-parser-option input[type="radio"] {
                    margin-right: 12px;
                }
                
                .pdf-parser-option-title {
                    font-weight: 600;
                    color: #1f2937;
                    font-size: 1.1rem;
                }
                
                .pdf-parser-option-description {
                    color: #6b7280;
                    font-size: 0.9rem;
                    margin-bottom: 8px;
                }
                
                .pdf-parser-features {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                
                .pdf-parser-feature {
                    background: #e0e7ff;
                    color: #3730a3;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                }
                
                .pdf-parser-strengths {
                    color: #059669;
                    font-size: 0.85rem;
                }
                
                .pdf-parser-limitations {
                    color: #dc2626;
                    font-size: 0.85rem;
                }
                
                .pdf-parser-advanced-options {
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                
                .pdf-parser-advanced-options h3 {
                    margin: 0 0 12px 0;
                    font-size: 1rem;
                    color: #374151;
                }
                
                .pdf-parser-option-group {
                    margin-bottom: 12px;
                }
                
                .pdf-parser-option-group label {
                    display: flex;
                    align-items: center;
                    color: #374151;
                    cursor: pointer;
                }
                
                .pdf-parser-option-group input[type="checkbox"] {
                    margin-right: 8px;
                }
                
                .pdf-parser-option-group select {
                    margin-left: 8px;
                    padding: 4px 8px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                }
                
                .pdf-parser-session-options {
                    border-top: 1px solid #e5e7eb;
                    padding-top: 16px;
                }
                
                .pdf-parser-session-options label {
                    display: flex;
                    align-items: center;
                    color: #374151;
                    cursor: pointer;
                }
                
                .pdf-parser-session-options input[type="checkbox"] {
                    margin-right: 8px;
                }
                
                .pdf-parser-modal-footer {
                    padding: 0 24px 24px;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                
                .pdf-parser-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .pdf-parser-btn-primary {
                    background: #3b82f6;
                    color: white;
                }
                
                .pdf-parser-btn-primary:hover {
                    background: #2563eb;
                }
                
                .pdf-parser-btn-secondary {
                    background: #f3f4f6;
                    color: #374151;
                }
                
                .pdf-parser-btn-secondary:hover {
                    background: #e5e7eb;
                }
                
                .pdf-parser-btn-cancel {
                    background: #f3f4f6;
                    color: #6b7280;
                }
                
                .pdf-parser-btn-cancel:hover {
                    background: #e5e7eb;
                    color: #374151;
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styleHTML);
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('pdf-parser-modal');
    }

    /**
     * イベントリスナーを設定
     */
    private setupEventListeners(): void {
        if (!this.modal) return;

        // 閉じるボタン
        const closeBtn = this.modal.querySelector('.pdf-parser-modal-close');
        const cancelBtn = this.modal.querySelector('#pdf-parser-cancel');
        const okBtn = this.modal.querySelector('#pdf-parser-ok');
        const advancedBtn = this.modal.querySelector('#show-advanced');

        closeBtn?.addEventListener('click', () => this.handleCancel());
        cancelBtn?.addEventListener('click', () => this.handleCancel());
        okBtn?.addEventListener('click', () => this.handleOK());
        
        // 詳細オプションの表示/非表示
        advancedBtn?.addEventListener('click', () => this.toggleAdvancedOptions());

        // オーバーレイクリックで閉じる
        const overlay = this.modal.querySelector('.pdf-parser-modal-overlay');
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.handleCancel();
            }
        });

        // ESCキーで閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal?.style.display !== 'none') {
                this.handleCancel();
            }
        });
    }

    /**
     * パーサーオプションを描画
     */
    private renderParserOptions(): void {
        const container = this.modal?.querySelector('#pdf-parser-options');
        if (!container) return;

        container.innerHTML = '';

        for (const parser of this.availableParsers) {
            const optionHTML = `
                <div class="pdf-parser-option ${!parser.isAvailable ? 'unavailable' : ''}" 
                     data-parser="${parser.type}">
                    <div class="pdf-parser-option-header">
                        <input type="radio" name="parser" value="${parser.type}" 
                               ${this.selectedParser === parser.type ? 'checked' : ''}
                               ${!parser.isAvailable ? 'disabled' : ''}>
                        <div class="pdf-parser-option-title">${parser.name}</div>
                    </div>
                    <div class="pdf-parser-option-description">${parser.description}</div>
                    <div class="pdf-parser-features">
                        ${parser.features.map(f => `<span class="pdf-parser-feature">${f}</span>`).join('')}
                    </div>
                    <div class="pdf-parser-strengths">
                        <strong>特徴:</strong> ${parser.strengths.join(', ')}
                    </div>
                    <div class="pdf-parser-limitations">
                        <strong>制限事項:</strong> ${parser.limitations.join(', ')}
                    </div>
                    ${!parser.isAvailable ? '<div style="color: #dc2626; font-size: 0.85rem; margin-top: 4px;"><strong>現在利用できません</strong></div>' : ''}
                    ${parser.requiresInternet ? '<div style="color: #f59e0b; font-size: 0.85rem; margin-top: 4px;"><strong>インターネット接続が必要です</strong></div>' : ''}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', optionHTML);
        }

        // パーサー選択イベント
        container.querySelectorAll('.pdf-parser-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const parserType = target.dataset.parser as PDFParserType;
                const radio = target.querySelector('input[type="radio"]') as HTMLInputElement;
                
                if (radio && !radio.disabled) {
                    this.selectParser(parserType);
                }
            });
        });
    }

    /**
     * パーサーを選択
     */
    private selectParser(parserType: PDFParserType): void {
        this.selectedParser = parserType;
        
        // ラジオボタンの更新
        const radios = this.modal?.querySelectorAll('input[name="parser"]') as NodeListOf<HTMLInputElement>;
        radios?.forEach(radio => {
            radio.checked = radio.value === parserType;
        });
        
        // 視覚的な選択状態の更新
        this.modal?.querySelectorAll('.pdf-parser-option').forEach(option => {
            option.classList.remove('selected');
            if (option.getAttribute('data-parser') === parserType) {
                option.classList.add('selected');
            }
        });

        // 選択されたパーサーに応じて詳細オプションを更新
        this.updateAdvancedOptions(parserType);
    }

    /**
     * 詳細オプションを更新
     */
    private updateAdvancedOptions(parserType: PDFParserType): void {
        const parser = this.availableParsers.find(p => p.type === parserType);
        if (!parser) return;

        // OCRオプションの有効/無効
        const ocrCheckbox = this.modal?.querySelector('#enable-ocr') as HTMLInputElement;
        if (ocrCheckbox) {
            ocrCheckbox.disabled = !parser.features.includes('OCR対応');
            ocrCheckbox.checked = parser.features.includes('OCR対応');
        }

        // テーブル認識オプション
        const tableCheckbox = this.modal?.querySelector('#detect-tables') as HTMLInputElement;
        if (tableCheckbox) {
            tableCheckbox.disabled = !parser.features.includes('テーブル認識');
            tableCheckbox.checked = parser.features.includes('テーブル認識');
        }

        // 画像抽出オプション
        const imageCheckbox = this.modal?.querySelector('#extract-images') as HTMLInputElement;
        if (imageCheckbox) {
            imageCheckbox.disabled = !parser.features.includes('画像抽出');
            imageCheckbox.checked = parser.features.includes('画像抽出');
        }
    }

    /**
     * 詳細オプションの表示切り替え
     */
    private toggleAdvancedOptions(): void {
        const advancedDiv = this.modal?.querySelector('.pdf-parser-advanced-options') as HTMLElement;
        const btn = this.modal?.querySelector('#show-advanced') as HTMLButtonElement;
        
        if (advancedDiv && btn) {
            const isVisible = advancedDiv.style.display !== 'none';
            advancedDiv.style.display = isVisible ? 'none' : 'block';
            btn.textContent = isVisible ? '詳細オプション' : '詳細オプションを隠す';
        }
    }

    /**
     * 現在のオプション設定を取得
     */
    private getCurrentOptions(): PDFParserOptions {
        const extractImages = (this.modal?.querySelector('#extract-images') as HTMLInputElement)?.checked || false;
        const detectTables = (this.modal?.querySelector('#detect-tables') as HTMLInputElement)?.checked || false;
        const enableOCR = (this.modal?.querySelector('#enable-ocr') as HTMLInputElement)?.checked || false;
        const layoutPreservation = (this.modal?.querySelector('#layout-preservation') as HTMLSelectElement)?.value as 'strict' | 'moderate' | 'loose' || 'moderate';

        return {
            extractImages,
            detectTables,
            enableOCR,
            layoutPreservation,
            highQualityImages: false // デフォルト値
        };
    }

    /**
     * OKボタンの処理
     */
    private handleOK(): void {
        if (!this.selectedParser) return;

        this.rememberChoice = (this.modal?.querySelector('#remember-choice') as HTMLInputElement)?.checked || false;

        const selection: PDFParserSelection = {
            parser: this.selectedParser,
            options: this.getCurrentOptions(),
            rememberChoice: this.rememberChoice
        };

        this.saveChoice(selection);
        this.hideModal();
        
        if (this.resolveCallback) {
            this.resolveCallback(selection);
            this.resolveCallback = null;
        }

        this.dispatchEvent('parser-selected', selection);
    }

    /**
     * キャンセルボタンの処理
     */
    private handleCancel(): void {
        this.hideModal();
        
        if (this.resolveCallback) {
            this.resolveCallback(null);
            this.resolveCallback = null;
        }

        this.dispatchEvent('parser-cancelled');
    }

    /**
     * カスタムイベントを発行
     */
    private dispatchEvent(type: 'parser-selected' | 'parser-cancelled', selection?: PDFParserSelection): void {
        const event: PDFParserSelectEvent = {
            type,
            ...(selection && {
                parser: selection.parser,
                options: selection.options,
                rememberChoice: selection.rememberChoice
            })
        };

        document.dispatchEvent(new CustomEvent('pdf-parser-select', { detail: event }));
    }

    /**
     * モーダルを表示
     */
    private showModal(): void {
        if (this.modal) {
            this.modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            // フォーカスを最初の選択可能な要素に設定
            const firstRadio = this.modal.querySelector('input[name="parser"]:not(:disabled)') as HTMLInputElement;
            firstRadio?.focus();
        }
    }

    /**
     * モーダルを非表示
     */
    private hideModal(): void {
        if (this.modal) {
            this.modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    /**
     * リソースのクリーンアップ
     */
    dispose(): void {
        this.hideModal();
        this.modal?.remove();
        this.modal = null;
        this.resolveCallback = null;
    }
}

export default PDFParserSelector;