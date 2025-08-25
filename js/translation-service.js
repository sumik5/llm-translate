// ==================== Translation Service ====================
import TextProcessor from './text-processor.js';
import { ERROR_MESSAGES, API_CONFIG } from './constants.js';

export class TranslationService {
    constructor(apiClient, configManager) {
        this.apiClient = apiClient;
        this.configManager = configManager;
        this.abortController = null;
    }

    async translateText(text, targetLanguage, options = {}) {
        const {
            apiUrl = null,
            modelName = null,
            onProgress = null,
            onChunkComplete = null,
            maxChunkTokens: userChunkSize = null
        } = options;

        // Validate input
        const validation = TextProcessor.validateInput(text);
        if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
        }

        // Sanitize text
        const sanitizedText = TextProcessor.sanitizeText(text);

        // Check if chunking is needed
        const config = this.configManager.getConfig();
        // Use user-provided chunk size if available, otherwise use config
        const maxChunkTokens = userChunkSize || config.api.chunkMaxTokens || API_CONFIG.CHUNK_MAX_TOKENS;
        
        if (validation.metadata.estimatedTokens <= maxChunkTokens) {
            // Single translation
            return await this.translateSingle(
                sanitizedText, 
                targetLanguage, 
                apiUrl, 
                modelName
            );
        } else {
            // Chunked translation
            return await this.translateChunked(
                sanitizedText, 
                targetLanguage, 
                apiUrl, 
                modelName,
                maxChunkTokens,
                onProgress,
                onChunkComplete
            );
        }
    }

    async translateSingle(text, targetLanguage, apiUrl, modelName) {
        try {
            this.abortController = new AbortController();
            
            const translatedText = await this.apiClient.translate(
                text,
                targetLanguage,
                apiUrl,
                modelName,
                this.abortController.signal
            );

            return TextProcessor.postProcessTranslation(translatedText);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(ERROR_MESSAGES.TRANSLATION_ABORTED);
            }
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    async translateChunked(text, targetLanguage, apiUrl, modelName, maxChunkTokens, onProgress, onChunkComplete) {
        const chunks = TextProcessor.splitTextIntoChunks(text, maxChunkTokens);
        const translatedChunks = [];
        const totalChunks = chunks.length;

        try {
            this.abortController = new AbortController();

            for (let i = 0; i < chunks.length; i++) {
                if (this.abortController.signal.aborted) {
                    throw new Error(ERROR_MESSAGES.TRANSLATION_ABORTED);
                }

                const chunk = chunks[i];
                const progress = ((i + 1) / totalChunks) * 100;
                
                // Notify progress
                if (onProgress) {
                    onProgress(progress, `チャンク ${i + 1}/${totalChunks} を翻訳中...`);
                }

                // Translate chunk
                const translatedChunk = await this.apiClient.translate(
                    chunk,
                    targetLanguage,
                    apiUrl,
                    modelName,
                    this.abortController.signal
                );

                const processedChunk = TextProcessor.postProcessTranslation(translatedChunk);
                translatedChunks.push(processedChunk);

                // Notify chunk completion
                if (onChunkComplete) {
                    onChunkComplete(i + 1, totalChunks, processedChunk);
                }
            }

            return translatedChunks.join('\n\n');
        } catch (error) {
            if (error.name === 'AbortError' || error.message === ERROR_MESSAGES.TRANSLATION_ABORTED) {
                throw new Error(ERROR_MESSAGES.TRANSLATION_ABORTED);
            }
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    async translateFile(fileContent, fileType, targetLanguage, options = {}) {
        const {
            processor = null,
            ...translationOptions
        } = options;

        if (!processor) {
            throw new Error('File processor is required for file translation');
        }

        try {
            // Parse file to markdown
            const markdownContent = await processor.parse(fileContent);
            
            // Translate the markdown content
            const translatedContent = await this.translateText(
                markdownContent,
                targetLanguage,
                translationOptions
            );

            return translatedContent;
        } catch (error) {
            throw new Error(`${ERROR_MESSAGES.FILE_READ_ERROR(error.message)}`);
        }
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            return true;
        }
        return false;
    }

    isTranslating() {
        return this.abortController !== null;
    }

    async testConnection(apiUrl, modelName) {
        return await this.apiClient.testConnection(apiUrl, modelName);
    }

    async fetchAvailableModels(apiUrl) {
        return await this.apiClient.fetchAvailableModels(apiUrl);
    }
}