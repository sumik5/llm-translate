// ==================== Main Application (TypeScript) ====================

import ConfigManager from './config-manager.js';
import UIManager from './ui-manager.js';
import APIClient from './api-client.js';
import MarkdownProcessor from './markdown-processor.js';
import FileProcessor from './file-processor.js';
// import TextProcessor from './text-processor.js'; // Unused import commented out
import { TranslationService } from './translation-service.js';
import { ERROR_MESSAGES, API_CONFIG } from './constants.js';
import type { ImageManager } from './image-manager.js';

// Types removed - were not used in implementation

/**
 * Main translator application class
 * Orchestrates all components for file translation functionality
 */
class TranslatorApp {
    // Core service instances
    private readonly configManager: any;
    private readonly uiManager: any;
    private readonly apiClient: any;
    private readonly markdownProcessor: any;
    private readonly translationService: any;

    // Application state
    private isTranslating: boolean = false;
    private currentImageManager: ImageManager | null = null;

    constructor() {
        // Initialize core services
        this.configManager = new ConfigManager();
        this.uiManager = new UIManager();
        this.apiClient = new APIClient(this.configManager);
        this.markdownProcessor = new MarkdownProcessor();
        this.translationService = new TranslationService(this.apiClient, this.configManager);
        
        // Initialize application
        this.initialize().catch(error => {
            console.error('Application initialization failed:', error);
            this.handleInitializationError(error);
        });
    }

    /**
     * Initialize the application
     * Sets up configuration, UI, and event listeners
     */
    private async initialize(): Promise<void> {
        try {
            // Load configuration
            this.configManager.loadPromptConfig();
            this.loadPromptConfig();
            
            // Setup UI and event handlers
            this.setupEventListeners();
            this.setupPageLeaveProtection();
            
            // Initialize model list
            await this.refreshModels();
            
        } catch (error) {
            this.handleInitializationError(error);
        }
    }

    /**
     * Handle initialization errors
     * @param error - The initialization error
     */
    private handleInitializationError(error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
        
        // Display error to user
        this.uiManager.showError(errorMessage);
        
        // Disable translation button
        const translateBtn = this.uiManager.elements.translateBtn;
        if (translateBtn) {
            translateBtn.disabled = true;
            translateBtn.textContent = '設定エラー';
        }
        
        console.error('初期化エラー:', error);
    }

    /**
     * Load prompt configuration into UI elements
     */
    private loadPromptConfig(): void {
        const config = this.configManager.getConfig();
        const apiUrlElement = this.uiManager.elements.apiUrl;
        
        if (config.api && apiUrlElement) {
            apiUrlElement.value = config.api.defaultEndpoint;
        }
    }

    /**
     * Setup all event listeners for UI interactions
     */
    private setupEventListeners(): void {
        const { elements } = this.uiManager;
        
        // Translation/Cancel button
        elements.translateBtn.addEventListener('click', () => {
            if (this.isTranslating) {
                this.cancelTranslation();
            } else {
                this.handleTranslation().catch(error => {
                    console.error('Translation error:', error);
                    this.uiManager.showError(error instanceof Error ? error.message : 'Translation failed');
                });
            }
        });
        
        // File input button handling
        elements.fileInputButton?.addEventListener('click', () => {
            elements.fileInput.click();
        });
        
        // File input handling
        elements.fileInput.addEventListener('change', (e: Event) => {
            this.handleFileUpload(e).catch(error => {
                console.error('File upload error:', error);
                this.uiManager.showError(`ファイル読み込みエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }).finally(() => {
                // 同じファイルを選択してもイベントが発火するようにリセット
                elements.fileInput.value = '';
            });
        });

        // Handle Shift+Click on file input for parser selection
        elements.fileInput.addEventListener('click', (e: MouseEvent) => {
            if (e.shiftKey) {
                // Shift+Clickでパーサー選択を強制
                e.preventDefault();
                this.handleFileUploadWithParserSelection().catch(error => {
                    console.error('File upload with parser selection error:', error);
                    this.uiManager.showError(`ファイル読み込みエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
                });
            }
        });
        
        // Text input monitoring
        elements.inputText.addEventListener('input', () => {
            this.uiManager.updateCharCount(elements.inputText, elements.inputCharCount);
            this.uiManager.markAsChanged();
        });
        
        elements.outputText.addEventListener('input', () => {
            this.uiManager.updateCharCount(elements.outputText, elements.outputCharCount);
            this.uiManager.markAsChanged();
            this.updatePreviewIfActive();
        });
        
        // Save HTML button
        elements.saveHtmlBtn.addEventListener('click', () => 
            this.uiManager.downloadHtml(this.markdownProcessor, this.currentImageManager));
        
        // Chunk size input - force numeric input mode
        const chunkSizeInput = elements.chunkSize as HTMLInputElement;
        
        // compositionstart/endイベントでIME入力を検知して防ぐ
        chunkSizeInput.addEventListener('compositionstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        chunkSizeInput.addEventListener('compositionupdate', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        chunkSizeInput.addEventListener('compositionend', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // キー入力を数字のみに制限
        chunkSizeInput.addEventListener('keydown', (e) => {
            // 数字キー、バックスペース、削除、Tab、Enter、矢印キーを許可
            const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
            const isNumber = (e.key >= '0' && e.key <= '9');
            const isAllowed = allowedKeys.includes(e.key);
            const isModifier = e.ctrlKey || e.metaKey || e.altKey;
            
            if (!isNumber && !isAllowed && !isModifier) {
                e.preventDefault();
            }
        });
        
        // ペースト時も数字のみ許可
        chunkSizeInput.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = e.clipboardData?.getData('text');
            if (pasteData && /^\d+$/.test(pasteData)) {
                const currentValue = chunkSizeInput.value;
                const selectionStart = chunkSizeInput.selectionStart || 0;
                const selectionEnd = chunkSizeInput.selectionEnd || 0;
                const newValue = currentValue.slice(0, selectionStart) + pasteData + currentValue.slice(selectionEnd);
                const numValue = parseInt(newValue, 10);
                
                // min/max範囲内であることを確認
                if (numValue >= 100 && numValue <= 10000) {
                    chunkSizeInput.value = newValue;
                }
            }
        });
        
        // Model refresh button
        if (elements.refreshModels) {
            elements.refreshModels.addEventListener('click', async () => {
                elements.refreshModels.disabled = true;
                try {
                    await this.refreshModels();
                } catch (error) {
                    console.error('Model refresh error:', error);
                    this.uiManager.showError('モデル一覧の取得に失敗しました');
                } finally {
                    elements.refreshModels.disabled = false;
                }
            });
        }
        
        // API URL change handler
        elements.apiUrl.addEventListener('change', () => {
            this.refreshModels().catch(error => {
                console.error('Model refresh on API URL change error:', error);
            });
        });
        
        // Tab switching
        this.setupTabSwitching();
    }

    /**
     * Setup tab switching functionality
     */
    private setupTabSwitching(): void {
        const tabButtons: NodeListOf<Element> = document.querySelectorAll('[data-tab]');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (button instanceof HTMLElement) {
                    this.switchTab(button);
                }
            });
        });
    }

    /**
     * Setup page leave protection to warn about unsaved changes
     */
    private setupPageLeaveProtection(): void {
        const { elements } = this.uiManager;
        
        // Track changes
        elements.fileInput.addEventListener('change', () => this.uiManager.markAsChanged());
        elements.translateBtn.addEventListener('click', () => {
            setTimeout(() => this.uiManager.markAsChanged(), 100);
        });
        
        // Before unload warning
        window.addEventListener('beforeunload', (event: BeforeUnloadEvent) => {
            if (this.hasUnsavedContent()) {
                const confirmationMessage = '翻訳内容が失われる可能性があります。このページを離れてもよろしいですか？';
                event.returnValue = confirmationMessage;
                return confirmationMessage;
            }
            return undefined;
        });
        
        // Popstate (back/forward) handling
        window.addEventListener('popstate', (event: PopStateEvent) => {
            if (this.hasUnsavedContent()) {
                if (!confirm('翻訳内容が失われる可能性があります。このページを離れてもよろしいですか？')) {
                    window.history.pushState(null, '', window.location.href);
                    event.preventDefault();
                }
            }
        });
        
        // Add initial state to history
        window.history.pushState(null, '', window.location.href);
    }

    /**
     * Check if there is unsaved content
     * @returns True if there are unsaved changes
     */
    private hasUnsavedContent(): boolean {
        const { elements } = this.uiManager;
        return this.uiManager.hasUnsavedChanges || 
               elements.inputText.value.trim() !== '' || 
               elements.outputText.value.trim() !== '';
    }

    /**
     * Handle file upload and processing
     * @param event - File input change event
     */
    private async handleFileUpload(event: Event): Promise<void> {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        
        try {
            const result = await FileProcessor.processFile(file);
            
            // Store image manager if available
            this.currentImageManager = result.imageManager || null;
            
            // Set the text and update UI
            this.uiManager.elements.inputText.value = result.text;
            this.uiManager.updateInputCharCount();
            this.uiManager.markAsChanged();
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown file processing error';
            this.uiManager.showError(`ファイル読み込みエラー: ${errorMessage}`);
        }
    }

    /**
     * パーサー選択を強制してファイルをアップロード・処理
     */
    private async handleFileUploadWithParserSelection(): Promise<void> {
        // ファイル選択ダイアログを開く
        const fileInput = this.uiManager.elements.fileInput;
        fileInput.click();
        
        // ファイルが選択されるのを待つ
        const waitForFile = new Promise<File | null>((resolve) => {
            const handleChange = (e: Event) => {
                const target = e.target as HTMLInputElement;
                const file = target.files?.[0] || null;
                fileInput.removeEventListener('change', handleChange);
                resolve(file);
            };
            fileInput.addEventListener('change', handleChange);
        });

        const file = await waitForFile;
        if (!file) return;

        try {
            const result = await FileProcessor.processFileWithParserSelection(file);
            
            // Store image manager if available
            this.currentImageManager = result.imageManager || null;
            
            // Set the text and update UI
            this.uiManager.elements.inputText.value = result.text;
            this.uiManager.updateInputCharCount();
            this.uiManager.markAsChanged();
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown file processing error';
            this.uiManager.showError(`ファイル読み込みエラー: ${errorMessage}`);
        }
    }

    /**
     * Handle translation process
     */
    private async handleTranslation(): Promise<void> {
        const { elements } = this.uiManager;
        const text = elements.inputText.value.trim();
        
        if (!text) {
            this.uiManager.showError(ERROR_MESSAGES.NO_TEXT);
            return;
        }
        
        // Set translation state
        this.isTranslating = true;
        this.uiManager.state.startTranslation();
        this.uiManager.hideError();
        this.setTranslatingUI(true);
        
        try {
            // Test API connection first
            // Get values with proper type checking
            const apiUrlElement = elements.apiUrl as HTMLInputElement;
            const modelNameElement = elements.modelName as HTMLSelectElement;
            
            const apiUrl = apiUrlElement?.value || API_CONFIG.defaultEndpoint;
            const modelName = modelNameElement?.value || API_CONFIG.defaultModel;
            
            const isConnected = await this.translationService.testConnection(
                apiUrl,
                modelName
            );
            
            if (!isConnected) {
                this.uiManager.showError(ERROR_MESSAGES.API_CONNECTION_ERROR);
                this.setTranslatingUI(false);
                return;
            }
            
            // Prepare translation options
            const targetLanguage = elements.targetLang.value;
            const chunkSize = parseInt(elements.chunkSize.value) || 500;
            
            const translationOptions = {
                apiUrl: elements.apiUrl.value,
                modelName: elements.modelName.value,
                maxChunkTokens: chunkSize,
                imageManager: this.currentImageManager,
                onProgress: (progress: number, message: string) => {
                    this.uiManager.updateProgress(progress, message);
                },
                onChunkComplete: (current: number, total: number, chunkText: string) => {
                    this.handleChunkComplete(current, total, chunkText);
                }
            };
            
            // Perform translation
            const translatedText = await this.translationService.translateText(
                text,
                targetLanguage,
                translationOptions
            );
            
            // Handle translation completion
            this.handleTranslationSuccess(translatedText);
            
        } catch (error) {
            this.handleTranslationError(error);
        } finally {
            this.isTranslating = false;
            this.setTranslatingUI(false);
        }
    }

    /**
     * Handle chunk completion during translation
     * @param current - Current chunk number
     * @param total - Total chunk count
     * @param chunkText - Translated chunk text
     */
    private handleChunkComplete(current: number, _total: number, chunkText: string): void {
        const { elements } = this.uiManager;
        
        if (current === 1) {
            elements.outputText.value = '';
        }
        
        // Normalize the chunk text before appending
        const normalizedChunk = this.normalizeTranslatedMarkdown(chunkText);
        
        // Append chunk with proper formatting
        if (elements.outputText.value) {
            elements.outputText.value += '\n\n' + normalizedChunk;
        } else {
            elements.outputText.value = normalizedChunk;
        }
        
        // Update UI
        this.uiManager.updateOutputCharCount();
        elements.outputText.scrollTop = elements.outputText.scrollHeight;
        
        // Update preview if active
        this.updatePreviewIfActive();
    }

    /**
     * Handle successful translation completion
     * @param translatedText - The final translated text
     */
    private handleTranslationSuccess(translatedText?: string): void {
        const { elements } = this.uiManager;
        
        // Set final text if provided and normalize it
        if (translatedText && !elements.outputText.value) {
            const normalizedText = this.normalizeTranslatedMarkdown(translatedText);
            elements.outputText.value = normalizedText;
            this.uiManager.updateOutputCharCount();
        } else if (elements.outputText.value) {
            // Normalize existing text in output
            const normalizedText = this.normalizeTranslatedMarkdown(elements.outputText.value);
            if (normalizedText !== elements.outputText.value) {
                elements.outputText.value = normalizedText;
                this.uiManager.updateOutputCharCount();
            }
        }
        
        // Update preview
        this.updatePreviewWithImages();
        this.uiManager.state.completeTranslation();
    }

    /**
     * Normalize translated markdown text for proper spacing
     * @param text - Text to normalize
     * @returns Normalized text with proper spacing
     */
    private normalizeTranslatedMarkdown(text: string): string {
        if (!this.markdownProcessor || !text) return text;
        
        // Always apply markdown normalization to ensure proper spacing
        return this.markdownProcessor.normalizeMarkdown(text);
    }

    /**
     * Handle translation errors
     * @param error - The translation error
     */
    private handleTranslationError(error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown translation error';
        
        if (errorMessage !== ERROR_MESSAGES.TRANSLATION_ABORTED) {
            this.uiManager.showError(errorMessage);
        } else {
            this.uiManager.showError(ERROR_MESSAGES.TRANSLATION_CANCELLED);
        }
    }

    /**
     * Update preview if preview tab is active
     */
    private updatePreviewIfActive(): void {
        const activeTab = document.querySelector('[data-tab][data-state="active"]');
        if (activeTab?.getAttribute('data-tab') === 'preview') {
            this.updatePreviewWithImages();
        }
    }

    /**
     * Update preview with image restoration
     */
    private updatePreviewWithImages(): void {
        let previewText = this.uiManager.elements.outputText.value;
        
        if (this.currentImageManager?.hasImagePlaceholders(previewText)) {
            previewText = this.currentImageManager.restoreImages(previewText);
        }
        
        this.uiManager.updatePreview(previewText, this.markdownProcessor);
    }

    /**
     * Set UI state for translation process
     * @param isTranslating - Whether translation is in progress
     */
    private setTranslatingUI(isTranslating: boolean): void {
        const { elements } = this.uiManager;
        
        if (isTranslating) {
            // Set cancel button state
            elements.translateBtn.innerHTML = '<span class="btn-text">中止</span>';
            elements.translateBtn.style.backgroundColor = '#ef4444';
            elements.translateBtn.style.color = '#ffffff';
            
            // Disable file input during translation
            elements.fileInput.disabled = true;
            elements.outputText.classList.add('translating');
            elements.markdownPreview.innerHTML = '';
            
            this.uiManager.showProgressBar();
        } else {
            // Restore normal button state
            elements.translateBtn.innerHTML = `
                <span class="btn-text">翻訳する</span>
                <span class="spinner"></span>
            `;
            elements.translateBtn.style.backgroundColor = '';
            elements.translateBtn.style.color = '';
            elements.translateBtn.classList.remove('loading');
            elements.outputText.classList.remove('translating');
            elements.fileInput.disabled = false;
            
            this.uiManager.hideProgressBar();
        }
    }

    /**
     * Refresh available models from API
     */
    private async refreshModels(): Promise<void> {
        const apiUrl = this.uiManager.elements.apiUrl.value;
        const models = await this.apiClient.fetchAvailableModels(apiUrl);
        await this.uiManager.updateModelDropdown(models);
    }

    /**
     * Cancel ongoing translation
     */
    private cancelTranslation(): void {
        if (this.translationService.abort()) {
            this.uiManager.showError(ERROR_MESSAGES.TRANSLATION_CANCELLED);
        }
    }

    /**
     * Switch between tabs (output/preview)
     * @param button - The tab button element
     */
    private switchTab(button: HTMLElement): void {
        const tabName = button.getAttribute('data-tab');
        if (!tabName) return;
        
        const tabContents: NodeListOf<Element> = document.querySelectorAll('.tabs-content');
        const tabButtons: NodeListOf<Element> = document.querySelectorAll('[data-tab]');
        
        // Update button states
        tabButtons.forEach(btn => {
            btn.setAttribute('data-state', btn === button ? 'active' : 'inactive');
        });
        
        // Update content visibility
        tabContents.forEach(content => {
            const contentName = content.getAttribute('data-content');
            content.setAttribute('data-state', contentName === tabName ? 'active' : 'inactive');
        });
        
        // Update preview if switching to preview tab
        if (tabName === 'preview') {
            this.updatePreviewWithImages();
        }
    }

    /**
     * Get current application state
     * @returns Current application state information
     */
    public getState() {
        return {
            isTranslating: this.isTranslating,
            hasImageManager: this.currentImageManager !== null,
            configLoaded: this.configManager.isConfigLoaded()
        };
    }

    /**
     * Get current configuration
     * @returns Current application configuration
     */
    public getConfig() {
        return this.configManager.getConfig();
    }

    /**
     * Cleanup method for proper disposal
     */
    public dispose(): void {
        // Cancel any ongoing translation
        if (this.isTranslating) {
            this.cancelTranslation();
        }
        
        // Reset image manager
        this.currentImageManager = null;
        
        // Reset UI state
        this.uiManager.state.reset();
    }
}

// ==================== Application Initialization ====================

/**
 * Initialize the translator application when DOM is ready
 */
function initializeApp(): void {
    try {
        const app = new TranslatorApp();
        
        // Store app instance globally for debugging
        (window as any).translatorApp = app;
        
        console.log('Translator app initialized successfully');
    } catch (error) {
        console.error('Failed to initialize translator app:', error);
        
        // Show basic error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ef4444;
            color: white;
            padding: 1rem;
            border-radius: 0.5rem;
            z-index: 9999;
            max-width: 500px;
        `;
        errorDiv.textContent = 'アプリケーションの初期化に失敗しました。ページを再読み込みしてください。';
        document.body.appendChild(errorDiv);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

export default TranslatorApp;