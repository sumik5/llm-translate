// ==================== UI Manager ====================
import { DOMController } from './dom-controller.js';
import { StateManager } from './state-manager.js';
import { HTMLGenerator } from './html-generator.js';
import type MarkdownProcessor from './markdown-processor.js';
import type { ImageManager } from './image-manager.js';

interface Model {
    id?: string;
    name?: string;
}

type ModelArray = (Model | string)[];

export interface ProgressCallback {
    (percentage: number, message: string): void;
}

export interface ChunkCompleteCallback {
    (chunkIndex: number, totalChunks: number, translatedChunk: string): void;
}

export interface ExportOptions {
    title?: string;
    subtitle?: string;
    styles?: string;
}

export class UIManager {
    private readonly dom: DOMController;
    private readonly state: StateManager;
    private readonly htmlGenerator: HTMLGenerator;
    public readonly elements: Record<string, HTMLElement>;

    constructor() {
        this.dom = new DOMController();
        this.state = new StateManager();
        this.htmlGenerator = new HTMLGenerator();
        this.elements = this.dom.elements; // For backward compatibility
        this.setupStateListeners();
    }

    private setupStateListeners(): void {
        // Subscribe to state changes
        this.state.subscribe('currentProgress', (progress: number) => {
            this.dom.setStyle('progressFill', 'width', `${progress}%`);
        });
        
        this.state.subscribe('currentStatus', (status: string) => {
            this.dom.setText('statusMessage', status);
        });
        
        this.state.subscribe('isTranslating', (isTranslating: boolean) => {
            if (isTranslating) {
                this.dom.show('progressInfo');
            } else {
                setTimeout(() => this.dom.hide('progressInfo'), 2000);
            }
        });
    }

    updateCharCount(element: HTMLInputElement | HTMLTextAreaElement, countElement: HTMLElement): void {
        const count = element.value.length;
        countElement.textContent = `${count}文字`;
    }
    
    updateInputCharCount(): void {
        const count = this.dom.getValue('inputText').length;
        this.dom.setText('inputCharCount', `${count}文字`);
    }
    
    updateOutputCharCount(): void {
        const count = this.dom.getValue('outputText').length;
        this.dom.setText('outputCharCount', `${count}文字`);
    }

    showError(message: string): void {
        this.dom.setText('errorMessage', message);
        this.dom.addClass('errorMessage', 'show');
        this.state.setError(message);
        
        setTimeout(() => {
            this.dom.removeClass('errorMessage', 'show');
        }, 5000);
    }

    hideError(): void {
        this.dom.removeClass('errorMessage', 'show');
        this.state.set('lastError', null);
    }

    updateProgress(percentage: number, message: string): void {
        this.state.updateProgress(percentage, message);
    }

    showProgressBar(): void {
        this.dom.show('progressInfo');
    }

    hideProgressBar(): void {
        this.dom.hide('progressInfo');
    }

    updatePreview(text: string, markdownProcessor: MarkdownProcessor): void {
        if (text) {
            const html = markdownProcessor.toHtml(text);
            this.dom.setHtml('markdownPreview', html);
            this.state.set('translatedHtml', html);
            
            // Trigger syntax highlighting if available
            setTimeout(() => {
                if (typeof window !== 'undefined' && window.Prism) {
                    window.Prism.highlightAll();
                }
            }, 0);
        } else {
            this.dom.setHtml('markdownPreview', '');
            this.state.set('translatedHtml', '');
        }
    }

    async updateModelDropdown(models: ModelArray): Promise<void> {
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
                const value = typeof model === 'object' ? (model.id || model.name || '') : model;
                const text = typeof model === 'object' ? (model.id || model.name || '') : model;
                const option = this.dom.createOption(value, text, index === 0);
                this.dom.appendChild('modelName', option);
            });
        }
    }

    markAsChanged(): void {
        this.state.markAsChanged();
    }

    clearChanges(): void {
        this.state.clearChanges();
    }
    
    get hasUnsavedChanges(): boolean {
        return this.state.get('hasUnsavedChanges');
    }

    downloadHtml(markdownProcessor: MarkdownProcessor, imageManager: ImageManager | null = null): void {
        // Show modal instead of directly downloading
        this.showExportModal(markdownProcessor, imageManager);
    }

    private showExportModal(markdownProcessor: MarkdownProcessor, imageManager: ImageManager | null = null): void {
        const modal = document.getElementById('exportModal');
        if (!modal) return;
        
        modal.classList.add('active');
        
        // Set up event listeners for modal buttons
        const cancelBtn = document.getElementById('cancelExport');
        const confirmBtn = document.getElementById('confirmExport');
        
        const handleCancel = (): void => {
            modal.classList.remove('active');
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
            if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
        };
        
        const handleConfirm = (): void => {
            const selectedOption = document.querySelector('input[name="exportType"]:checked') as HTMLInputElement;
            const exportType = selectedOption ? selectedOption.value : 'translation-only';
            
            this.performExport(markdownProcessor, exportType, imageManager);
            
            modal.classList.remove('active');
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
            if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
        };
        
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
        if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
        
        // Close on overlay click
        modal.addEventListener('click', (e: MouseEvent) => {
            if (e.target === modal) {
                handleCancel();
            }
        });
    }
    
    private performExport(
        markdownProcessor: MarkdownProcessor, 
        exportType: string, 
        imageManager: ImageManager | null = null
    ): void {
        let originalText = this.dom.getValue('inputText');
        let translatedText = this.dom.getValue('outputText');
        
        // Restore images if imageManager is available
        if (imageManager) {
            originalText = imageManager.restoreImages(originalText);
            translatedText = imageManager.restoreImages(translatedText);
        }
        
        if (!translatedText) {
            alert('翻訳結果がありません');
            return;
        }
        
        // Get the filename from file input or use default
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        let baseFilename = 'translation';
        if (fileInput && fileInput.files && fileInput.files[0]) {
            baseFilename = fileInput.files[0].name.replace(/\.[^/.]+$/, '');
        }
        
        const translatedHtml = markdownProcessor.toHtml(translatedText);
        let htmlContent: string;
        let filename: string;
        
        if (exportType === 'translation-only') {
            // Export translation only
            htmlContent = this.htmlGenerator.generateSingleColumnHtml(
                translatedHtml, 
                {
                    title: baseFilename,
                    styles: this.htmlGenerator.getTranslationOnlyStyles()
                }
            );
            filename = this.htmlGenerator.generateFilename(baseFilename + '_translated');
        } else {
            // Export side-by-side
            const originalHtml = originalText ? 
                markdownProcessor.toHtml(originalText) : null;
            
            htmlContent = this.htmlGenerator.generateTranslationHtml(
                originalHtml, 
                translatedHtml,
                {
                    title: baseFilename,
                    originalLabel: '原文',
                    translatedLabel: '翻訳',
                    styles: this.htmlGenerator.getWideLayoutStyles()
                }
            );
            filename = this.htmlGenerator.generateFilename(baseFilename + '_comparison');
        }
        
        // Download the file
        this.htmlGenerator.downloadAsHtml(htmlContent, filename);
        
        this.clearChanges();
    }

    
    // Helper methods for backward compatibility
    getValue(elementName: string): string {
        return this.dom.getValue(elementName);
    }
    
    setValue(elementName: string, value: string): void {
        this.dom.setValue(elementName, value);
    }
}

export default UIManager;