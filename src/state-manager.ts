// ==================== State Manager ====================
// Manages application state and change tracking

import type { 
    StateManager as StateManagerInterface,
    AppState,
    StateUpdates,
    StateChangeListener,
    StateChangeEvent,
    StateChangeType
} from './types/index.js';
import type { ErrorDetails, ErrorType } from './types/core.js';

/**
 * Simple state manager for tracking application state and change notifications
 */
export class StateManager implements StateManagerInterface {
    private readonly state: AppState;
    private readonly listeners: Map<keyof AppState, Set<StateChangeListener>>;

    constructor() {
        this.state = {
            hasUnsavedChanges: false,
            translatedHtml: '',
            isTranslating: false,
            currentProgress: 0,
            currentStatus: '',
            lastError: null
        } as AppState;
        
        this.listeners = new Map<keyof AppState, Set<StateChangeListener>>();
    }

    /**
     * Get a state value by key
     * @param key - State key to retrieve
     * @returns Current value of the state property
     */
    get<K extends keyof AppState>(key: K): AppState[K] {
        return this.state[key];
    }

    /**
     * Set a state value and notify listeners
     * @param key - State key to update
     * @param value - New value to set
     */
    set<K extends keyof AppState>(key: K, value: AppState[K]): void {
        const oldValue = this.state[key];
        (this.state as any)[key] = value;
        this.notify(key, value, oldValue);
    }

    /**
     * Update multiple state values at once
     * @param updates - Object containing state updates
     */
    update(updates: StateUpdates): void {
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                this.set(key as keyof AppState, value);
            }
        }
    }

    /**
     * Mark the current state as having unsaved changes
     */
    markAsChanged(): void {
        this.set('hasUnsavedChanges', true);
    }

    /**
     * Clear the unsaved changes flag
     */
    clearChanges(): void {
        this.set('hasUnsavedChanges', false);
    }

    /**
     * Set state for translation start
     */
    startTranslation(): void {
        this.update({
            isTranslating: true,
            currentProgress: 0,
            currentStatus: '翻訳を開始しています...',
            lastError: null
        });
    }

    /**
     * Set state for translation completion
     * @param html - Translated HTML content
     */
    completeTranslation(html: string = ''): void {
        this.update({
            isTranslating: false,
            currentProgress: 100,
            currentStatus: '翻訳が完了しました',
            translatedHtml: html,
            hasUnsavedChanges: true
        });
    }

    /**
     * Set error state
     * @param error - Error details or string message
     */
    setError(error: ErrorDetails | string | Error): void {
        let errorDetails: ErrorDetails;
        
        if (typeof error === 'string') {
            errorDetails = {
                type: 'unknown' as ErrorType,
                message: error,
                timestamp: new Date()
            } as ErrorDetails;
        } else if (error instanceof Error) {
            errorDetails = {
                type: 'runtime' as ErrorType,
                message: error.message,
                timestamp: new Date(),
                originalError: error
            } as ErrorDetails;
        } else {
            errorDetails = error;
        }

        this.update({
            isTranslating: false,
            lastError: errorDetails,
            currentStatus: 'エラーが発生しました'
        });
    }

    /**
     * Update progress information
     * @param percentage - Progress percentage (0-100)
     * @param message - Optional status message
     */
    updateProgress(percentage: number, message?: string): void {
        this.update({
            currentProgress: Math.max(0, Math.min(100, percentage)),
            currentStatus: message || this.state.currentStatus
        });
    }

    /**
     * Subscribe to state changes for a specific key
     * @param key - State key to watch
     * @param callback - Function to call on state change
     * @returns Unsubscribe function
     */
    subscribe<K extends keyof AppState>(
        key: K,
        callback: StateChangeListener<AppState[K]>
    ): () => void {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        
        const callbacks = this.listeners.get(key)!;
        callbacks.add(callback as StateChangeListener);
        
        // Return unsubscribe function
        return () => {
            callbacks.delete(callback as StateChangeListener);
        };
    }

    /**
     * Notify all listeners of a state change
     * @param key - Changed state key
     * @param newValue - New value
     * @param oldValue - Previous value
     */
    private notify<K extends keyof AppState>(
        key: K,
        newValue: AppState[K],
        oldValue: AppState[K]
    ): void {
        const callbacks = this.listeners.get(key);
        if (callbacks && callbacks.size > 0) {
            const event: StateChangeEvent<AppState[K]> = {
                type: this.getChangeType(key),
                key,
                newValue,
                oldValue,
                timestamp: new Date()
            };

            callbacks.forEach(callback => {
                try {
                    callback(newValue, oldValue, event);
                } catch (error) {
                    console.error(`Error in state change listener for key "${String(key)}":`, error);
                }
            });
        }
    }

    /**
     * Determine the change type based on the key and context
     * @param key - State key that changed
     * @returns Appropriate change type
     */
    private getChangeType(key: keyof AppState): StateChangeType {
        switch (key) {
            case 'isTranslating':
                return this.state.isTranslating ? 'translation-start' : 'translation-complete';
            case 'lastError':
                return 'translation-error';
            case 'currentProgress':
                return 'progress-update';
            default:
                return 'update';
        }
    }

    /**
     * Reset state to initial values
     */
    reset(): void {
        const oldState = { ...this.state };
        
        Object.assign(this.state, {
            hasUnsavedChanges: false,
            translatedHtml: '',
            isTranslating: false,
            currentProgress: 0,
            currentStatus: '',
            lastError: null
        });

        // Notify listeners of reset
        for (const key of Object.keys(this.state) as (keyof AppState)[]) {
            if (oldState[key] !== this.state[key]) {
                this.notify(key, this.state[key], oldState[key]);
            }
        }
    }

    /**
     * Get a read-only snapshot of the current state
     * @returns Immutable state object
     */
    getSnapshot(): Readonly<AppState> {
        return Object.freeze({ ...this.state });
    }

    /**
     * Check if there are any active subscriptions
     * @param key - Optional key to check specific subscriptions
     * @returns True if there are active listeners
     */
    hasListeners(key?: keyof AppState): boolean {
        if (key) {
            const callbacks = this.listeners.get(key);
            return callbacks ? callbacks.size > 0 : false;
        }
        
        for (const callbacks of this.listeners.values()) {
            if (callbacks.size > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Remove all listeners for a specific key or all keys
     * @param key - Optional key to clear specific listeners
     */
    clearListeners(key?: keyof AppState): void {
        if (key) {
            this.listeners.delete(key);
        } else {
            this.listeners.clear();
        }
    }
}

export default StateManager;