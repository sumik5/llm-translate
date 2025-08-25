// ==================== Configuration Manager ====================
class ConfigManager {
    constructor() {
        this.promptConfig = null;
        this.defaultConfig = this.getDefaultConfig();
    }

    getDefaultConfig() {
        // デフォルトのAPI設定のみ保持
        return {
            api: {
                defaultEndpoint: "http://127.0.0.1:1234",
                defaultModel: "local-model",
                temperature: 0.3,
                maxTokens: 10000,
                chunkMaxTokens: 5000
            }
        };
    }

    loadPromptConfig() {
        // prompts.jsから設定を読み込み
        if (window.PROMPT_CONFIG) {
            this.promptConfig = window.PROMPT_CONFIG;
            return true;
        }
        
        throw new Error('プロンプト設定が読み込まれていません。prompts.jsファイルが存在することを確認してください。');
    }

    getConfig() {
        return this.promptConfig || this.defaultConfig;
    }

    buildTranslationPrompt(text, targetLanguage) {
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
}

export default ConfigManager;