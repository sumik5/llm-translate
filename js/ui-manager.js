// ==================== UI Manager ====================
import { DOMController } from './dom-controller.js';
import { StateManager } from './state-manager.js';
import { HTMLGenerator } from './html-generator.js';

class UIManager {
    constructor() {
        this.dom = new DOMController();
        this.state = new StateManager();
        this.htmlGenerator = new HTMLGenerator();
        this.elements = this.dom.elements; // For backward compatibility
        this.setupStateListeners();
    }

    setupStateListeners() {
        // Subscribe to state changes
        this.state.subscribe('currentProgress', (progress) => {
            this.dom.setStyle('progressFill', 'width', `${progress}%`);
        });
        
        this.state.subscribe('currentStatus', (status) => {
            this.dom.setText('statusMessage', status);
        });
        
        this.state.subscribe('isTranslating', (isTranslating) => {
            if (isTranslating) {
                this.dom.show('progressInfo');
            } else {
                setTimeout(() => this.dom.hide('progressInfo'), 2000);
            }
        });
    }

    updateCharCount(element, countElement) {
        const count = element.value.length;
        countElement.textContent = `${count}文字`;
    }
    
    updateInputCharCount() {
        const count = this.dom.getValue('inputText').length;
        this.dom.setText('inputCharCount', `${count}文字`);
    }
    
    updateOutputCharCount() {
        const count = this.dom.getValue('outputText').length;
        this.dom.setText('outputCharCount', `${count}文字`);
    }

    showError(message) {
        this.dom.setText('errorMessage', message);
        this.dom.addClass('errorMessage', 'show');
        this.state.setError(message);
        
        setTimeout(() => {
            this.dom.removeClass('errorMessage', 'show');
        }, 5000);
    }

    hideError() {
        this.dom.removeClass('errorMessage', 'show');
        this.state.set('lastError', null);
    }

    updateProgress(percentage, message) {
        this.state.updateProgress(percentage, message);
    }

    showProgressBar() {
        this.dom.show('progressInfo');
    }

    hideProgressBar() {
        this.dom.hide('progressInfo');
    }

    updatePreview(text, markdownProcessor) {
        if (text) {
            const html = markdownProcessor.toHtml(text);
            this.dom.setHtml('markdownPreview', html);
            this.state.set('translatedHtml', html);
            
            // Trigger syntax highlighting if available
            setTimeout(() => {
                if (typeof Prism !== 'undefined') {
                    Prism.highlightAll();
                }
            }, 0);
        } else {
            this.dom.setHtml('markdownPreview', '');
            this.state.set('translatedHtml', '');
        }
    }

    async updateModelDropdown(models) {
        this.dom.clearChildren('modelName');
        
        if (models.length === 0) {
            // Add default options when no models found
            this.dom.appendChild('modelName', 
                this.dom.createOption('', 'モデルが見つかりません'));
            this.dom.appendChild('modelName', 
                this.dom.createOption('local-model', 'local-model (デフォルト)'));
            this.dom.appendChild('modelName', 
                this.dom.createOption('plamo-2-translate', 'plamo-2-translate'));
        } else {
            models.forEach((model, index) => {
                const value = model.id || model.name || model;
                const text = model.id || model.name || model;
                const option = this.dom.createOption(value, text, index === 0);
                this.dom.appendChild('modelName', option);
            });
        }
    }

    markAsChanged() {
        this.state.markAsChanged();
    }

    clearChanges() {
        this.state.clearChanges();
    }
    
    get hasUnsavedChanges() {
        return this.state.get('hasUnsavedChanges');
    }

    downloadHtml(markdownProcessor) {
        const originalText = this.dom.getValue('inputText');
        const translatedText = this.dom.getValue('outputText');
        
        if (!originalText && !translatedText) return;
        
        // Convert to HTML
        const originalHtml = originalText ? 
            markdownProcessor.toHtml(originalText) : null;
        const translatedHtml = translatedText ? 
            markdownProcessor.toHtml(translatedText) : null;
        
        // Generate HTML content
        const htmlContent = this.htmlGenerator.generateTranslationHtml(
            originalHtml, 
            translatedHtml
        );
        
        // Download the file
        const filename = this.htmlGenerator.generateFilename('translation');
        this.htmlGenerator.downloadAsHtml(htmlContent, filename);
        
        this.clearChanges();
    }

    async copyToClipboard() {
        const outputText = this.dom.getValue('outputText');
        if (outputText) {
            await navigator.clipboard.writeText(outputText);
            this.dom.addClass('copyButton', 'copied');
            this.dom.setHtml('copyButton', `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `);
            
            setTimeout(() => {
                this.dom.removeClass('copyButton', 'copied');
                this.dom.setHtml('copyButton', `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                `);
            }, 2000);
        }
    }
    
    // Helper methods for backward compatibility
    getValue(elementName) {
        return this.dom.getValue(elementName);
    }
    
    setValue(elementName, value) {
        this.dom.setValue(elementName, value);
    }
}

export default UIManager;