// ==================== Translation Service ====================
import TextProcessor from './text-processor.js';
import { ERROR_MESSAGES, API_CONFIG } from './constants.js';
import type APIClient from './api-client.js';
import type ConfigManager from './config-manager.js';
import type { ImageManager } from './image-manager.js';
import type { ProtectedPattern } from './text-protection-utils.js';

export interface ProgressCallback {
    (percentage: number, message: string): void;
}

export interface ChunkCompleteCallback {
    (chunkIndex: number, totalChunks: number, processedChunk: string): void;
}

export interface TranslationOptions {
    apiUrl?: string | null;
    modelName?: string | null;
    onProgress?: ProgressCallback | null;
    onChunkComplete?: ChunkCompleteCallback | null;
    maxChunkTokens?: number | null;
    imageManager?: ImageManager | null;
}

export interface FileTranslationOptions extends TranslationOptions {
    processor?: FileProcessor | null;
}

export interface FileProcessor {
    parse(content: string): Promise<string>;
}

export class TranslationService {
    private readonly apiClient: APIClient;
    private readonly configManager: ConfigManager;
    private abortController: AbortController | null = null;

    constructor(apiClient: APIClient, configManager: ConfigManager) {
        this.apiClient = apiClient;
        this.configManager = configManager;
        this.abortController = null;
    }

    async translateText(text: string, targetLanguage: string, options: TranslationOptions = {}): Promise<string> {
        const {
            apiUrl = null,
            modelName = null,
            onProgress = null,
            onChunkComplete = null,
            maxChunkTokens: userChunkSize = null,
            imageManager = null
        } = options;

        // Validate input (pass targetLanguage for better token estimation)
        const validation = TextProcessor.validateInput(text);
        if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
        }
        
        // Pre-process text to protect technical patterns
        const { protectedText, patterns } = TextProcessor.preProcessForTranslation(text);
        
        // Re-estimate tokens with target language for more accurate chunking (use protected text)
        const estimatedTokens = TextProcessor.estimateTokens(protectedText, targetLanguage);

        // Sanitize text
        let sanitizedText = TextProcessor.sanitizeText(protectedText);
        
        if (imageManager) {
            sanitizedText = sanitizedText.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, (_match) => {
                return '[[IMAGE_REMOVED]]';
            });
        }

        const config = this.configManager.getConfig();
        const maxChunkTokens = userChunkSize || config.api.chunkMaxTokens || API_CONFIG.chunkMaxTokens;
        
        if (estimatedTokens <= maxChunkTokens) {
            return await this.translateSingle(
                sanitizedText, 
                targetLanguage, 
                apiUrl, 
                modelName,
                patterns
            );
        } else {
            return await this.translateChunked(
                sanitizedText,
                targetLanguage,
                apiUrl,
                modelName,
                maxChunkTokens,
                onProgress,
                onChunkComplete,
                patterns,
                text.length  // 元のテキストの長さを渡す
            );
        }
    }

    private async translateSingle(
        text: string, 
        targetLanguage: string, 
        apiUrl: string | null, 
        modelName: string | null,
        protectedPatterns: ProtectedPattern[]
    ): Promise<string> {
        try {
            this.abortController = new AbortController();
            
            const translatedText = await this.apiClient.translate(
                text,
                targetLanguage,
                apiUrl || '',
                modelName || '',
                this.abortController.signal
            );

            return TextProcessor.postProcessTranslation(translatedText, protectedPatterns);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(ERROR_MESSAGES.TRANSLATION_ABORTED);
            }
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    private async translateChunked(
        text: string,
        targetLanguage: string,
        apiUrl: string | null,
        modelName: string | null,
        maxChunkTokens: number,
        onProgress: ProgressCallback | null,
        onChunkComplete: ChunkCompleteCallback | null,
        protectedPatterns: ProtectedPattern[],
        originalTextLength?: number  // 元のテキストの長さ（オプション）
    ): Promise<string> {
        const chunks = TextProcessor.splitTextIntoChunks(text, maxChunkTokens, targetLanguage);
        const translatedChunks: string[] = [];

        // 目安のチャンク数を計算（文字数 ÷ (チャンクサイズ × 4)）
        // 1トークン≈4文字として計算
        // 元のテキストの長さを使用（前処理前の長さ）
        const textLengthForEstimate = originalTextLength || text.length;
        const estimatedChunks = Math.ceil(textLengthForEstimate / (maxChunkTokens * 4));


        try {
            this.abortController = new AbortController();

            for (let i = 0; i < chunks.length; i++) {
                if (this.abortController.signal.aborted) {
                    throw new Error(ERROR_MESSAGES.TRANSLATION_ABORTED);
                }

                const chunk = chunks[i];
                const progress = ((i + 1) / chunks.length) * 100;

                if (onProgress) {
                    onProgress(progress, `チャンク ${i + 1}/${estimatedChunks}（目安） を翻訳中...`);
                }

                const translatedChunk = await this.apiClient.translate(
                    chunk || '',
                    targetLanguage,
                    apiUrl || '',
                    modelName || '',
                    this.abortController.signal
                );

                const processedChunk = TextProcessor.postProcessTranslation(translatedChunk, protectedPatterns);
                translatedChunks.push(processedChunk);

                if (onChunkComplete) {
                    onChunkComplete(i + 1, estimatedChunks, processedChunk);
                }
            }

            return '';
        } catch (error) {
            if (error instanceof Error && (error.name === 'AbortError' || error.message === ERROR_MESSAGES.TRANSLATION_ABORTED)) {
                throw new Error(ERROR_MESSAGES.TRANSLATION_ABORTED);
            }
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    async translateFile(
        fileContent: string, 
        _fileType: string, 
        targetLanguage: string, 
        options: FileTranslationOptions = {}
    ): Promise<string> {
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
            if (error instanceof Error) {
                throw new Error(`${ERROR_MESSAGES.FILE_READ_ERROR(error.message)}`);
            }
            throw new Error(`${ERROR_MESSAGES.FILE_READ_ERROR('Unknown error')}`);
        }
    }

    abort(): boolean {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            return true;
        }
        return false;
    }

    isTranslating(): boolean {
        return this.abortController !== null;
    }

    async testConnection(apiUrl: string, modelName: string): Promise<boolean> {
        return await this.apiClient.testConnection(apiUrl, modelName);
    }

    async fetchAvailableModels(apiUrl: string): Promise<string[]> {
        const models = await this.apiClient.fetchAvailableModels(apiUrl);
        return Array.isArray(models) ? [...models] : [];
    }
}