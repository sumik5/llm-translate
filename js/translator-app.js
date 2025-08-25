import ConfigManager from './config-manager.js?v=20250126';
import UIManager from './ui-manager.js?v=20250126';
import APIClient from './api-client.js?v=20250126';
import MarkdownProcessor from './markdown-processor.js?v=20250126';
import FileProcessor from './file-processor.js?v=20250126';
import TextProcessor from './text-processor.js?v=20250126';
import { TranslationService } from './translation-service.js?v=20250126';
import { ERROR_MESSAGES } from './constants.js?v=20250126';

// ==================== Main Application ====================
class TranslatorApp {
    constructor() {
        this.configManager = new ConfigManager();
        this.uiManager = new UIManager();
        this.apiClient = new APIClient(this.configManager);
        this.markdownProcessor = new MarkdownProcessor();
        this.translationService = new TranslationService(this.apiClient, this.configManager);
        
        // Legacy properties for compatibility
        this.translationChunks = [];
        this.translatedChunks = [];
        this.failedChunkIndex = -1;
        this.isTranslating = false;
        
        this.initialize();
    }

    async initialize() {
        try {
            this.configManager.loadPromptConfig();
            this.loadPromptConfig();
            this.setupEventListeners();
            this.setupPageLeaveProtection();
            await this.refreshModels();
            
        } catch (error) {
            // プロンプト設定の読み込みエラーを表示
            this.uiManager.showError(error.message);
            // 翻訳ボタンを無効化
            if (this.uiManager.elements.translateBtn) {
                this.uiManager.elements.translateBtn.disabled = true;
                this.uiManager.elements.translateBtn.textContent = '設定エラー';
            }
            console.error('初期化エラー:', error);
        }
    }

    loadPromptConfig() {
        const config = this.configManager.getConfig();
        if (config.api && this.uiManager.elements.apiUrl) {
            this.uiManager.elements.apiUrl.value = config.api.defaultEndpoint;
        }
    }

    setupEventListeners() {
        const { elements } = this.uiManager;
        
        // Translation/Cancel button
        elements.translateBtn.addEventListener('click', () => {
            if (this.isTranslating) {
                this.cancelTranslation();
            } else {
                this.handleTranslation();
            }
        });
        
        // File input
        elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Character count updates
        elements.inputText.addEventListener('input', () => {
            this.uiManager.updateCharCount(elements.inputText, elements.inputCharCount);
            this.uiManager.markAsChanged();
        });
        
        elements.outputText.addEventListener('input', () => {
            this.uiManager.updateCharCount(elements.outputText, elements.outputCharCount);
            this.uiManager.markAsChanged();
        });
        
        // Markdown preview
        elements.outputText.addEventListener('input', () => {
            // Only update preview if the preview tab is active
            const activeTab = document.querySelector('[data-tab][data-state="active"]');
            if (activeTab && activeTab.getAttribute('data-tab') === 'preview') {
                this.uiManager.updatePreview(elements.outputText.value, this.markdownProcessor);
            }
        });
        
        // Save HTML button
        elements.saveHtmlBtn.addEventListener('click', () => this.uiManager.downloadHtml(this.markdownProcessor));
        
        // Copy button
        elements.copyButton.addEventListener('click', () => this.uiManager.copyToClipboard());
        
        // Model refresh
        if (elements.refreshModels) {
            elements.refreshModels.addEventListener('click', async () => {
                elements.refreshModels.disabled = true;
                await this.refreshModels();
                elements.refreshModels.disabled = false;
            });
        }
        
        // API URL change
        elements.apiUrl.addEventListener('change', () => this.refreshModels());
        
        // Tab switching
        const tabButtons = document.querySelectorAll('[data-tab]');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => this.switchTab(button));
        });
    }

    setupPageLeaveProtection() {
        const { elements } = this.uiManager;
        
        // Track changes
        elements.fileInput.addEventListener('change', () => this.uiManager.markAsChanged());
        elements.translateBtn.addEventListener('click', () => {
            setTimeout(() => this.uiManager.markAsChanged(), 100);
        });
        
        // Before unload warning
        window.addEventListener('beforeunload', (event) => {
            if (this.uiManager.hasUnsavedChanges || 
                elements.inputText.value.trim() || 
                elements.outputText.value.trim()) {
                const confirmationMessage = '翻訳内容が失われる可能性があります。このページを離れてもよろしいですか？';
                event.returnValue = confirmationMessage;
                return confirmationMessage;
            }
        });
        
        // Popstate (back/forward) handling
        window.addEventListener('popstate', (event) => {
            if (this.uiManager.hasUnsavedChanges || 
                elements.inputText.value.trim() || 
                elements.outputText.value.trim()) {
                if (!confirm('翻訳内容が失われる可能性があります。このページを離れてもよろしいですか？')) {
                    window.history.pushState(null, '', window.location.href);
                    event.preventDefault();
                }
            }
        });
        
        // Add initial state to history
        window.history.pushState(null, '', window.location.href);
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await FileProcessor.processFile(file);
            
            // Set the text directly to the element
            this.uiManager.elements.inputText.value = text;
            this.uiManager.updateInputCharCount();
            this.uiManager.markAsChanged();
        } catch (error) {
            this.uiManager.showError(`ファイル読み込みエラー: ${error.message}`);
        }
    }

    async handleTranslation() {
        const { elements } = this.uiManager;
        const text = elements.inputText.value.trim();
        
        if (!text) {
            this.uiManager.showError(ERROR_MESSAGES.NO_TEXT);
            return;
        }
        
        this.isTranslating = true;
        this.uiManager.state.startTranslation();
        this.uiManager.hideError();
        
        // Update UI for translation state
        this.setTranslatingUI(true);
        
        // Test API connection
        const isConnected = await this.translationService.testConnection(
            elements.apiUrl.value,
            elements.modelName.value
        );
        
        if (!isConnected) {
            this.uiManager.showError(ERROR_MESSAGES.API_CONNECTION_ERROR);
            this.setTranslatingUI(false);
            return;
        }
        
        try {
            const targetLanguage = elements.targetLang.value;
            const chunkSize = parseInt(elements.chunkSize.value) || 500;
            
            // Perform translation using TranslationService
            const translatedText = await this.translationService.translateText(
                text,
                targetLanguage,
                {
                    apiUrl: elements.apiUrl.value,
                    modelName: elements.modelName.value,
                    maxChunkTokens: chunkSize,
                    onProgress: (progress, message) => {
                        this.uiManager.updateProgress(progress, message);
                    },
                    onChunkComplete: (current, total, chunkText) => {
                        // Update output incrementally
                        const currentOutput = elements.outputText.value;
                        const newOutput = currentOutput ? 
                            `${currentOutput}\n\n${chunkText}` : chunkText;
                        elements.outputText.value = newOutput;
                        this.uiManager.updateOutputCharCount();
                        elements.outputText.scrollTop = elements.outputText.scrollHeight;
                        // Update preview if it's currently active
                        const activeTab = document.querySelector('[data-tab][data-state="active"]');
                        if (activeTab && activeTab.getAttribute('data-tab') === 'preview') {
                            this.uiManager.updatePreview(newOutput, this.markdownProcessor);
                        }
                    }
                }
            );
            
            // Update final output
            elements.outputText.value = translatedText;
            this.uiManager.updateOutputCharCount();
            this.uiManager.updatePreview(translatedText, this.markdownProcessor);
            this.uiManager.state.completeTranslation();
            elements.saveHtmlBtn.disabled = false;
            
        } catch (error) {
            if (error.message !== ERROR_MESSAGES.TRANSLATION_ABORTED) {
                this.uiManager.showError(error.message);
            } else {
                this.uiManager.showError(ERROR_MESSAGES.TRANSLATION_CANCELLED);
            }
        } finally {
            this.isTranslating = false;
            this.setTranslatingUI(false);
        }
    }

    setTranslatingUI(isTranslating) {
        const { elements } = this.uiManager;
        
        if (isTranslating) {
            // Change button to cancel button
            elements.translateBtn.innerHTML = '<span class="btn-text">中止</span>';
            elements.translateBtn.style.backgroundColor = '#ef4444';
            elements.translateBtn.style.color = '#ffffff';
            elements.saveHtmlBtn.disabled = true;
            elements.fileInput.disabled = true;
            elements.outputText.classList.add('translating');
            elements.markdownPreview.innerHTML = '';
            this.uiManager.showProgressBar();
        } else {
            // Restore button
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

    // Legacy methods kept for backward compatibility
    async translateSingleChunk(text, targetLanguage) {
        // Now delegated to TranslationService
        return await this.translationService.translateSingle(
            text,
            targetLanguage,
            this.uiManager.elements.apiUrl.value,
            this.uiManager.elements.modelName.value
        );
    }

    async translateMultipleChunks(text, targetLanguage, maxChunkTokens, isRetry) {
        // Legacy method - now handled by TranslationService
        // Kept for compatibility but delegates to service
        const totalChunks = this.translationChunks.length;
        const startIndex = isRetry ? this.failedChunkIndex : 0;
        
        const statusMessage = isRetry ? 
            `チャンク ${startIndex + 1}/${totalChunks} から再開中...` :
            `${totalChunks}個のチャンクで翻訳中...`;
        this.uiManager.updateProgress(0, statusMessage);
        
        if (isRetry) {
            elements.outputText.value = this.translatedChunks.slice(0, startIndex).join('\n\n');
        }
        
        for (let i = startIndex; i < totalChunks; i++) {
            const progress = ((i + 1) / totalChunks) * 100;
            this.uiManager.updateProgress(progress, `翻訳中... (${i + 1}/${totalChunks})`);
            
            try {
                // 中止チェック
                if (this.abortController.signal.aborted) {
                    throw new DOMException('翻訳が中止されました', 'AbortError');
                }
                
                const translatedChunk = await this.apiClient.translate(
                    this.translationChunks[i],
                    targetLanguage,
                    elements.apiUrl.value,
                    elements.modelName.value,
                    this.abortController.signal
                );
                
                this.translatedChunks[i] = translatedChunk;
                
                const fullTranslation = this.translatedChunks
                    .filter(chunk => chunk)
                    .join('\n\n');
                
                const postProcessedText = TextProcessor.postProcessTranslation(fullTranslation);
                elements.outputText.value = postProcessedText;
                this.uiManager.updateCharCount(elements.outputText, elements.outputCharCount);
                this.uiManager.updatePreview(postProcessedText, this.markdownProcessor);
                elements.outputText.scrollTop = elements.outputText.scrollHeight;
                
            } catch (error) {
                this.failedChunkIndex = i;
                throw error;
            }
        }
    }

    async refreshModels() {
        const models = await this.apiClient.fetchAvailableModels(this.uiManager.elements.apiUrl.value);
        await this.uiManager.updateModelDropdown(models);
    }

    cancelTranslation() {
        if (this.translationService.abort()) {
            this.uiManager.showError(ERROR_MESSAGES.TRANSLATION_CANCELLED);
        }
    }

    switchTab(button) {
        const tabName = button.getAttribute('data-tab');
        const tabContents = document.querySelectorAll('.tabs-content');
        const tabButtons = document.querySelectorAll('[data-tab]');
        
        tabButtons.forEach(btn => {
            btn.setAttribute('data-state', btn === button ? 'active' : 'inactive');
        });
        
        tabContents.forEach(content => {
            const contentName = content.getAttribute('data-content');
            content.setAttribute('data-state', contentName === tabName ? 'active' : 'inactive');
        });
        
        if (tabName === 'preview') {
            this.uiManager.updatePreview(
                this.uiManager.elements.outputText.value, 
                this.markdownProcessor
            );
        }
    }
}

// ==================== Application Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
    const app = new TranslatorApp();
});

export default TranslatorApp;