// ==================== Configuration Manager ====================

import type { 
    ConfigManager as ConfigManagerInterface,
    AppConfig,
    // APIConfig, // Used in implementation
    // TranslationConfig, // Used in implementation
    // PromptSettings // Used in implementation
} from './types/index.js';

/**
 * Global configuration interface for window object
 */
declare global {
    interface Window {
        PROMPT_CONFIG?: AppConfig;
    }
}

/**
 * Configuration manager for handling application settings and prompt building
 */
class ConfigManager implements ConfigManagerInterface {
    private promptConfig: AppConfig | null;
    private readonly defaultConfig: AppConfig;

    constructor() {
        this.promptConfig = null;
        this.defaultConfig = this.getDefaultConfig();
    }

    /**
     * Get default configuration values
     * @returns Default application configuration
     */
    private getDefaultConfig(): AppConfig {
        return {
            api: {
                defaultEndpoint: 'http://127.0.0.1:1234',
                defaultModel: 'local-model',
                temperature: 0.3,
                maxTokens: 10000,
                chunkMaxTokens: 5000,
                timeout: 30000,
                retryAttempts: 3,
                retryDelay: 1000
            },
            translation: {
                system: 'あなたは技術文書専門の翻訳者です。\n' +
                        '【翻訳ルール - 必ず守ってください】\n' +
                        '1. [SIMPLETABLE数字] や [INDENTNUM数字] の形式は絶対に変更・翻訳しないでください\n' +
                        '2. 通常の文章を新たにコードブロック（```）で囲まないでください\n' +
                        '3. 既存のコードブロック（```で囲まれた部分）のみをコードブロックとして維持\n' +
                        '4. ##や#などのヘッダーマークを勝手に追加しないでください\n' +
                        '5. Count, generate_series等の技術用語は翻訳しないでください\n' +
                        '6. 関数定義（例：generate_series (...)）はそのまま残してください',
                markdown: {
                    template: '{system}\n\n{instruction}\n\n{text}',
                    instruction: '{targetLanguage}に翻訳してください。[SIMPLETABLE]や[INDENTNUM]で始まるプレースホルダーは絶対に変更しないでください。'
                }
            },
            tokenEstimation: {
                japaneseMultiplier: 1.0,
                englishMultiplier: 0.25,
                otherMultiplier: 0.5,
                defaultChunkSize: 3000,
                maxChunkSize: 5000,
                translationCompressionRatio: {
                    JA_TO_EN: 0.8,
                    EN_TO_JA: 1.2,
                    DEFAULT: 1.0
                }
            }
        };
    }

    /**
     * Load prompt configuration from global window object
     * @returns True if configuration was successfully loaded
     * @throws {Error} If prompt configuration is not available
     */
    loadPromptConfig(): boolean {
        // prompts.jsから設定を読み込み
        if (window.PROMPT_CONFIG) {
            this.promptConfig = window.PROMPT_CONFIG;
            return true;
        }
        
        throw new Error('プロンプト設定が読み込まれていません。prompts.jsファイルが存在することを確認してください。');
    }

    /**
     * Get current configuration, using loaded config or defaults
     * @returns Current application configuration
     */
    getConfig(): AppConfig {
        return this.promptConfig || this.defaultConfig;
    }

    /**
     * Build translation prompt from template
     * @param text - Text to translate
     * @param targetLanguage - Target language for translation
     * @returns Formatted prompt string
     * @throws {Error} If configuration is invalid
     */
    buildTranslationPrompt(text: string, targetLanguage: string): string {
        const config = this.getConfig();
        
        if (!config || !config.translation) {
            throw new Error('プロンプト設定が読み込まれていません');
        }
        
        // Always use markdown settings
        const promptSettings = config.translation.markdown;
        
        if (!promptSettings || !promptSettings.template) {
            throw new Error('プロンプトテンプレートが設定されていません');
        }
        
        return promptSettings.template
            .replace(/\{system\}/g, config.translation.system)
            .replace(/\{targetLanguage\}/g, targetLanguage)
            .replace(/\{instruction\}/g, promptSettings.instruction)
            .replace(/\{text\}/g, text);
    }

    /**
     * Check if configuration is loaded
     * @returns True if prompt configuration is loaded
     */
    isConfigLoaded(): boolean {
        return this.promptConfig !== null;
    }

    /**
     * Update configuration (for testing or runtime updates)
     * @param config - New configuration to merge
     */
    updateConfig(config: Partial<AppConfig>): void {
        if (!this.promptConfig) {
            this.promptConfig = { ...this.defaultConfig };
        }
        
        this.promptConfig = this.mergeConfig(this.promptConfig, config);
    }

    /**
     * Reset configuration to defaults
     */
    resetToDefaults(): void {
        this.promptConfig = null;
    }

    /**
     * Deep merge configuration objects
     * @param target - Target configuration
     * @param source - Source configuration to merge
     * @returns Merged configuration
     */
    private mergeConfig(target: AppConfig, source: Partial<AppConfig>): AppConfig {
        const result = { ...target };
        
        if (source.api) {
            result.api = { ...result.api, ...source.api };
        }
        
        if (source.translation) {
            result.translation = { ...result.translation, ...source.translation };
            if (source.translation.markdown) {
                (result.translation as any).markdown = { ...result.translation.markdown, ...source.translation.markdown };
            }
        }
        
        if (source.tokenEstimation) {
            result.tokenEstimation = { ...result.tokenEstimation, ...source.tokenEstimation };
            if (source.tokenEstimation.translationCompressionRatio) {
                (result.tokenEstimation as any).translationCompressionRatio = {
                    ...result.tokenEstimation.translationCompressionRatio,
                    ...source.tokenEstimation.translationCompressionRatio
                };
            }
        }
        
        return result;
    }

    /**
     * Validate current configuration
     * @returns Validation result
     */
    validateConfig(): { isValid: boolean; errors: string[] } {
        const config = this.getConfig();
        const errors: string[] = [];

        // Validate API configuration
        if (!config.api) {
            errors.push('API設定がありません');
        } else {
            if (!config.api.defaultEndpoint) {
                errors.push('デフォルトエンドポイントが設定されていません');
            }
            if (!config.api.defaultModel) {
                errors.push('デフォルトモデルが設定されていません');
            }
            if (config.api.temperature < 0 || config.api.temperature > 2) {
                errors.push('温度設定は0-2の範囲で設定してください');
            }
        }

        // Validate translation configuration
        if (!config.translation) {
            errors.push('翻訳設定がありません');
        } else {
            if (!config.translation.system) {
                errors.push('システムプロンプトが設定されていません');
            }
            if (!config.translation.markdown || !config.translation.markdown.template) {
                errors.push('マークダウンテンプレートが設定されていません');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default ConfigManager;