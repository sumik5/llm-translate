// ==================== State Manager ====================
// Manages application state and change tracking
export class StateManager {
    constructor() {
        this.state = {
            hasUnsavedChanges: false,
            translatedHtml: '',
            isTranslating: false,
            currentProgress: 0,
            currentStatus: '',
            lastError: null
        };
        
        this.listeners = new Map();
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.notify(key, value, oldValue);
    }

    update(updates) {
        for (const [key, value] of Object.entries(updates)) {
            this.set(key, value);
        }
    }

    markAsChanged() {
        this.set('hasUnsavedChanges', true);
    }

    clearChanges() {
        this.set('hasUnsavedChanges', false);
    }

    startTranslation() {
        this.update({
            isTranslating: true,
            currentProgress: 0,
            currentStatus: '翻訳を開始しています...',
            lastError: null
        });
    }

    completeTranslation(html = '') {
        this.update({
            isTranslating: false,
            currentProgress: 100,
            currentStatus: '翻訳が完了しました',
            translatedHtml: html,
            hasUnsavedChanges: true
        });
    }

    setError(error) {
        this.update({
            isTranslating: false,
            lastError: error,
            currentStatus: 'エラーが発生しました'
        });
    }

    updateProgress(percentage, message) {
        this.update({
            currentProgress: percentage,
            currentStatus: message || this.state.currentStatus
        });
    }

    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(key);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    }

    notify(key, newValue, oldValue) {
        const callbacks = this.listeners.get(key);
        if (callbacks) {
            callbacks.forEach(callback => {
                callback(newValue, oldValue);
            });
        }
    }

    reset() {
        this.state = {
            hasUnsavedChanges: false,
            translatedHtml: '',
            isTranslating: false,
            currentProgress: 0,
            currentStatus: '',
            lastError: null
        };
    }
}