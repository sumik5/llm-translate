// ==================== API Client ====================
import { API_CONFIG, ERROR_MESSAGES } from './constants.js';

class APIClient {
    constructor(configManager) {
        this.configManager = configManager;
        this.retryAttempts = API_CONFIG.RETRY_ATTEMPTS;
        this.retryDelay = API_CONFIG.RETRY_DELAY;
    }

    async translate(text, targetLanguage, apiUrl, modelName, signal = null) {
        const prompt = this.configManager.buildTranslationPrompt(text, targetLanguage);
        const config = this.configManager.getConfig();
        const baseUrl = apiUrl || config.api.defaultEndpoint;
        
        const requestBody = {
            model: modelName || API_CONFIG.DEFAULT_MODEL,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: config.api.temperature || API_CONFIG.TEMPERATURE,
            max_tokens: config.api.maxTokens || API_CONFIG.MAX_TOKENS,
            stream: false
        };

        return await this.makeRequestWithRetry(
            `${baseUrl}/v1/chat/completions`,
            requestBody,
            signal,
            'translate'
        );
    }

    async testConnection(apiUrl, modelName) {
        try {
            const baseUrl = apiUrl || API_CONFIG.DEFAULT_ENDPOINT;
            
            const testBody = {
                model: modelName || API_CONFIG.DEFAULT_MODEL,
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
                null,
                false
            );
            
            return response !== null;
        } catch (error) {
            return false;
        }
    }

    async fetchAvailableModels(apiUrl) {
        try {
            const baseUrl = apiUrl || API_CONFIG.DEFAULT_ENDPOINT;
            const response = await fetch(`${baseUrl}/v1/models`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000) // 10 second timeout for model fetch
            });

            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
            return [];
        } catch (error) {
            console.warn('Failed to fetch models:', error.message);
            return [];
        }
    }

    async makeRequestWithRetry(url, body, signal, operation = 'request') {
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const result = await this.makeRequest(url, body, signal, true);
                if (result !== null) {
                    return result;
                }
            } catch (error) {
                lastError = error;
                
                // Don't retry on abort or specific client errors
                if (error.name === 'AbortError' || 
                    error.message.includes('400') ||
                    error.message.includes('401') ||
                    error.message.includes('403')) {
                    throw error;
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

    async makeRequest(url, body, signal, parseResponse = true) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: signal || AbortSignal.timeout(API_CONFIG.TIMEOUT)
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
            
            return data.choices[0].message.content;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(ERROR_MESSAGES.API_TIMEOUT_ERROR);
            }
            throw error;
        }
    }

    async parseErrorResponse(response) {
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