// ==================== API Client ====================
import { API_CONFIG, ERROR_MESSAGES } from './constants.js';
import type { 
    APIClient as APIClientInterface,
    ChatCompletionRequest,
    // APIMessage, // Unused import
    ModelInfo,
    ModelsResponse
} from './types/index.js';

/**
 * Configuration manager interface for dependency injection
 */
interface ConfigManager {
    buildTranslationPrompt(text: string, targetLanguage: string): string;
    getConfig(): {
        api: {
            temperature?: number;
            maxTokens?: number;
            defaultEndpoint?: string;
        };
    };
}

/**
 * API client for handling translation requests and model management
 */
class APIClient implements APIClientInterface {
    private readonly configManager: ConfigManager;
    private readonly retryAttempts: number;
    private readonly retryDelay: number;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.retryAttempts = API_CONFIG.retryAttempts;
        this.retryDelay = API_CONFIG.retryDelay;
    }

    /**
     * Translate text using the configured API
     * @param text - Text to translate
     * @param targetLanguage - Target language for translation
     * @param apiUrl - Optional API URL override
     * @param modelName - Optional model name override
     * @param signal - Optional AbortSignal for cancellation
     * @returns Promise resolving to translated text
     */
    async translate(
        text: string, 
        targetLanguage: string, 
        apiUrl?: string, 
        modelName?: string, 
        signal?: AbortSignal
    ): Promise<string> {
        const prompt = this.configManager.buildTranslationPrompt(text, targetLanguage);
        const config = this.configManager.getConfig();
        const baseUrl = apiUrl || config.api.defaultEndpoint || API_CONFIG.defaultEndpoint;
        
        const requestBody: ChatCompletionRequest = {
            model: modelName || (API_CONFIG as any).DEFAULT_MODEL,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: config.api.temperature || (API_CONFIG as any).TEMPERATURE,
            max_tokens: config.api.maxTokens || API_CONFIG.maxTokens,
            stream: false
        };

        return await this.makeRequestWithRetry(
            `${baseUrl}/v1/chat/completions`,
            requestBody,
            signal,
            'translate'
        );
    }

    /**
     * Test API connection with a simple request
     * @param apiUrl - API URL to test
     * @param modelName - Model name to test with
     * @returns Promise resolving to connection status
     */
    async testConnection(apiUrl: string, modelName: string): Promise<boolean> {
        try {
            const baseUrl = apiUrl || API_CONFIG.defaultEndpoint;
            
            
            const testBody: ChatCompletionRequest = {
                model: modelName || API_CONFIG.defaultModel,
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                temperature: 0.1,
                max_tokens: 1,
                stream: false
            };
            
            
            const response = await this.makeRequest(
                `${baseUrl}/v1/chat/completions`,
                testBody,
                undefined,
                false
            );
            
            
            // For test connection, we only care if we got a valid response
            // The response is a Response object when parseResponse is false
            return response !== null && response !== undefined;
        } catch (error) {
            return false;
        }
    }

    /**
     * Fetch available models from the API
     * @param apiUrl - API URL to fetch models from
     * @returns Promise resolving to array of available models
     */
    async fetchAvailableModels(apiUrl: string): Promise<readonly ModelInfo[]> {
        try {
            const baseUrl = apiUrl || API_CONFIG.defaultEndpoint;
            const response = await fetch(`${baseUrl}/v1/models`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000) // 10 second timeout for model fetch
            });

            if (response.ok) {
                const data: ModelsResponse = await response.json();
                return data.data || [];
            }
            return [];
        } catch (error) {
            console.warn('Failed to fetch models:', (error as Error).message);
            return [];
        }
    }

    /**
     * Make HTTP request with retry logic
     * @param url - Request URL
     * @param body - Request body
     * @param signal - AbortSignal for cancellation
     * @param operation - Operation type for error context
     * @returns Promise resolving to response content
     * @throws Error if all retry attempts fail
     */
    private async makeRequestWithRetry(
        url: string, 
        body: ChatCompletionRequest, 
        signal: AbortSignal | undefined, 
        _operation?: string
    ): Promise<string> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const result = await this.makeRequest(url, body, signal, true);
                if (result !== null && typeof result === 'string') {
                    return result;
                }
            } catch (error) {
                lastError = error as Error;
                
                // Don't retry on abort or specific client errors
                if (lastError.name === 'AbortError' || 
                    lastError.message.includes('400') ||
                    lastError.message.includes('401') ||
                    lastError.message.includes('403')) {
                    throw lastError;
                }
                
                // Wait before retry (exponential backoff)
                if (attempt < this.retryAttempts) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw new Error(`${ERROR_MESSAGES.API_CONNECTION_ERROR}: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Make a single HTTP request
     * @param url - Request URL
     * @param body - Request body
     * @param signal - AbortSignal for cancellation
     * @param parseResponse - Whether to parse and return content
     * @returns Promise resolving to response content or Response object
     * @throws Error for HTTP errors or network issues
     */
    private async makeRequest(
        url: string, 
        body: ChatCompletionRequest, 
        signal: AbortSignal | undefined, 
        parseResponse: boolean = true
    ): Promise<string | Response | null> {
        try {
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: signal || AbortSignal.timeout(API_CONFIG.timeout || 30000)
            });


            if (!response.ok) {
                const errorDetails = await this.parseErrorResponse(response);
                throw new Error(`HTTP ${response.status}: ${errorDetails}`);
            }

            if (!parseResponse) {
                return response;
            }

            const data = await response.json();
            
            // Validate response structure
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error(ERROR_MESSAGES.API_RESPONSE_ERROR);
            }
            
            const content = data.choices[0].message.content;
            return content;
        } catch (error) {
            const err = error as Error;
            if (err.name === 'AbortError') {
                throw new Error(ERROR_MESSAGES.API_TIMEOUT_ERROR);
            }
            throw err;
        }
    }

    /**
     * Parse error response from API
     * @param response - Failed HTTP response
     * @returns Promise resolving to error message
     */
    private async parseErrorResponse(response: Response): Promise<string> {
        try {
            const errorData = await response.json();
            if (errorData.error) {
                if (typeof errorData.error === 'string') {
                    return errorData.error;
                } else if (errorData.error.message) {
                    return errorData.error.message;
                }
            }
            return await response.text();
        } catch {
            return `Status ${response.status}`;
        }
    }
}

export default APIClient;