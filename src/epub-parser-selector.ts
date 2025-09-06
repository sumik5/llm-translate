// ==================== EPUB Parser Selector ====================
// EPUBパーサー選択モーダルUI

import type { 
    EPUBParserType, 
    EPUBParserInfo, 
    EPUBParserOptions, 
    EPUBParserSelection 
} from './types/epub-parsers.js';

/**
 * EPUBパーサー選択UI管理クラス
 */
export default class EPUBParserSelector {
    private modal: HTMLElement | null = null;
    private resolve: ((value: EPUBParserSelection | null) => void) | null = null;

    /**
     * パーサー選択ダイアログを表示
     * @param availableParsers 利用可能なパーサー一覧
     * @param defaultParser デフォルトのパーサータイプ
     * @returns 選択されたパーサー設定
     */
    async showSelector(
        availableParsers: readonly EPUBParserInfo[], 
        defaultParser: EPUBParserType = 'builtin'
    ): Promise<EPUBParserSelection | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.createModal(availableParsers, defaultParser);
            this.showModal();
        });
    }

    /**
     * モーダルを作成
     */
    private createModal(
        availableParsers: readonly EPUBParserInfo[], 
        defaultParser: EPUBParserType
    ): void {
        // 既存のモーダルがあれば削除
        this.removeModal();

        const modalHtml = `
            <div id="epubParserModal" class="epub-parser-modal-overlay">
                <div class="epub-parser-modal-content">
                    <div class="epub-parser-modal-header">
                        <h2 class="epub-parser-modal-title">EPUBパーサーを選択</h2>
                        <button class="epub-parser-close-btn" id="epubParserCloseBtn">&times;</button>
                    </div>
                    
                    <div class="epub-parser-modal-body">
                        <div class="epub-parser-section">
                            <h3 class="epub-parser-section-title">パーサーを選択</h3>
                            <div class="epub-parser-options" id="epubParserOptions">
                                ${this.generateParserOptions(availableParsers, defaultParser)}
                            </div>
                        </div>
                    </div>
                    
                    <div class="epub-parser-modal-footer">
                        <button class="epub-parser-btn epub-parser-btn-secondary" id="epubParserCancelBtn">キャンセル</button>
                        <button class="epub-parser-btn epub-parser-btn-primary" id="epubParserConfirmBtn">変換開始</button>
                    </div>
                </div>
            </div>
        `;

        // モーダルをDOMに追加
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        this.modal = modalContainer.firstElementChild as HTMLElement;
        document.body.appendChild(this.modal);

        // イベントリスナーを設定
        this.setupEventListeners();
        this.setupParserSelectionHandlers(availableParsers);
    }

    /**
     * パーサー選択オプションを生成
     */
    private generateParserOptions(
        availableParsers: readonly EPUBParserInfo[], 
        defaultParser: EPUBParserType
    ): string {
        return availableParsers.map(parser => {
            const isChecked = parser.type === defaultParser ? 'checked' : '';
            const isDisabled = !parser.isAvailable ? 'disabled' : '';
            const statusText = parser.isAvailable ? '' : '（利用不可）';
            
            return `
                <label class="epub-parser-option ${isDisabled}">
                    <input type="radio" name="epubParser" value="${parser.type}" ${isChecked} ${isDisabled}>
                    <div class="epub-parser-option-content">
                        <div class="epub-parser-option-header">
                            <div class="epub-parser-option-title">${parser.name}${statusText}</div>
                        </div>
                        <div class="epub-parser-option-description">${parser.description}</div>
                        <div class="epub-parser-option-features">
                            <strong>機能:</strong> ${parser.features.join(', ')}
                        </div>
                        <div class="epub-parser-option-details">
                            <div class="epub-parser-strengths">
                                <strong>長所:</strong> ${parser.strengths.join(', ')}
                            </div>
                            <div class="epub-parser-limitations">
                                <strong>制限:</strong> ${parser.limitations.join(', ')}
                            </div>
                        </div>
                    </div>
                </label>
            `;
        }).join('');
    }

    /**
     * イベントリスナーを設定
     */
    private setupEventListeners(): void {
        if (!this.modal) return;

        // 閉じるボタン
        const closeBtn = this.modal.querySelector('#epubParserCloseBtn') as HTMLButtonElement;
        closeBtn?.addEventListener('click', () => this.closeModal(null));

        // キャンセルボタン
        const cancelBtn = this.modal.querySelector('#epubParserCancelBtn') as HTMLButtonElement;
        cancelBtn?.addEventListener('click', () => this.closeModal(null));

        // 確認ボタン
        const confirmBtn = this.modal.querySelector('#epubParserConfirmBtn') as HTMLButtonElement;
        confirmBtn?.addEventListener('click', () => this.handleConfirm());

        // モーダル外クリック
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal(null);
            }
        });

        // ESCキー
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.closeModal(null);
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
    }

    /**
     * パーサー選択ハンドラーを設定
     */
    private setupParserSelectionHandlers(_availableParsers: readonly EPUBParserInfo[]): void {
        // 詳細オプションを削除したため、パーサー選択時の処理は不要
        // ラジオボタンの選択変更時の処理のみ残す（将来の拡張用）
    }

    /**
     * 確認ボタンの処理
     */
    private handleConfirm(): void {
        if (!this.modal) return;

        const selectedRadio = this.modal.querySelector('input[name="epubParser"]:checked') as HTMLInputElement;
        if (!selectedRadio) {
            alert('パーサーを選択してください');
            return;
        }

        // デフォルト値を使用
        const options: EPUBParserOptions = {
            extractImages: true,
            includeMetadata: false,  // デフォルトでOFF
            includeChapterNumbers: true,
            preserveStyles: false,
            sectionSeparator: 'none',  // デフォルトでなし
            footnoteStyle: 'reference'
        };

        const selection: EPUBParserSelection = {
            parser: selectedRadio.value as EPUBParserType,
            options
        };

        this.closeModal(selection);
    }

    /**
     * モーダルを表示
     */
    private showModal(): void {
        if (!this.modal) return;
        
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // アニメーション
        requestAnimationFrame(() => {
            this.modal?.classList.add('epub-parser-modal-show');
        });
    }

    /**
     * モーダルを閉じる
     */
    private closeModal(result: EPUBParserSelection | null): void {
        if (!this.modal) return;
        
        this.modal.classList.remove('epub-parser-modal-show');
        document.body.style.overflow = '';
        
        setTimeout(() => {
            this.removeModal();
            if (this.resolve) {
                this.resolve(result);
                this.resolve = null;
            }
        }, 300);
    }

    /**
     * モーダルを削除
     */
    private removeModal(): void {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }
}

// CSS スタイル
const epubParserModalCSS = `
.epub-parser-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.epub-parser-modal-show {
    opacity: 1 !important;
}

.epub-parser-modal-content {
    background: white;
    border-radius: 8px;
    max-width: 800px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    transform: scale(0.9) translateY(20px);
    transition: transform 0.3s ease;
}

.epub-parser-modal-show .epub-parser-modal-content {
    transform: scale(1) translateY(0);
}

.epub-parser-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
}

.epub-parser-modal-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
}

.epub-parser-close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
    line-height: 1;
}

.epub-parser-close-btn:hover {
    color: #374151;
}

.epub-parser-modal-body {
    padding: 24px;
}

.epub-parser-section {
    margin-bottom: 24px;
}

.epub-parser-section:last-child {
    margin-bottom: 0;
}

.epub-parser-section-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: #374151;
}

.epub-parser-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.epub-parser-option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.epub-parser-option:hover:not(.disabled) {
    border-color: #d1d5db;
    background-color: #f9fafb;
}

.epub-parser-option.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #f3f4f6;
}

.epub-parser-option input[type="radio"] {
    margin-top: 2px;
}

.epub-parser-option input[type="radio"]:checked + .epub-parser-option-content {
    color: #1f2937;
}

.epub-parser-option:has(input[type="radio"]:checked) {
    border-color: #3b82f6;
    background-color: #eff6ff;
}

.epub-parser-option-content {
    flex: 1;
    min-width: 0;
}

.epub-parser-option-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
}

.epub-parser-option-title {
    font-weight: 600;
    color: #111827;
    font-size: 0.95rem;
}

.epub-parser-option-description {
    color: #6b7280;
    font-size: 0.875rem;
    margin-bottom: 8px;
}

.epub-parser-option-features {
    color: #374151;
    font-size: 0.8rem;
    margin-bottom: 4px;
}

.epub-parser-option-details {
    font-size: 0.75rem;
    color: #6b7280;
}

.epub-parser-strengths {
    margin-bottom: 2px;
}

.epub-parser-limitations {
}

.epub-parser-advanced-options {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.epub-parser-option-row {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
}

.epub-parser-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    color: #374151;
    user-select: none;
}

.epub-parser-checkbox-label input[type="checkbox"] {
    margin: 0;
}

.epub-parser-select-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.epub-parser-select-label {
    font-size: 0.875rem;
    color: #374151;
    font-weight: 500;
}

.epub-parser-select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background-color: white;
    font-size: 0.875rem;
    color: #374151;
    max-width: 200px;
}

.epub-parser-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.epub-parser-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid #e5e7eb;
    background-color: #f9fafb;
    border-radius: 0 0 8px 8px;
}

.epub-parser-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 80px;
}

.epub-parser-btn-secondary {
    background-color: #f3f4f6;
    color: #374151;
}

.epub-parser-btn-secondary:hover {
    background-color: #e5e7eb;
}

.epub-parser-btn-primary {
    background-color: #3b82f6;
    color: white;
}

.epub-parser-btn-primary:hover {
    background-color: #2563eb;
}

.epub-parser-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
`;

// CSSを動的に追加
if (!document.querySelector('#epub-parser-modal-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'epub-parser-modal-styles';
    styleElement.textContent = epubParserModalCSS;
    document.head.appendChild(styleElement);
}