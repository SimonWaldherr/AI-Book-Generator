/**
 * API module for AI Book Generator
 * Handles all OpenAI API interactions with error handling and retry logic
 */

import { CONFIG, PROMPTS, VALIDATION } from './config.js';
import { showAlert, updateProgress, setLoadingText } from './ui.js';

class APIManager {
    constructor() {
        this.apiKey = null;
        this.rateLimitInfo = {
            remaining: null,
            resetTime: null
        };
    }

    setApiKey(key) {
        // Use the exported VALIDATION object from config.js
        if (!VALIDATION || !VALIDATION.API_KEY || !VALIDATION.API_KEY.test(key)) {
            throw new Error('Invalid API key format');
        }
        this.apiKey = key;
    }

    getApiKey() {
        return this.apiKey;
    }

    async makeRequest(messages, options = {}) {
        if (!this.apiKey) {
            throw new Error('API key not set');
        }

        const requestOptions = {
            model: options.model || 'gpt-3.5-turbo',
            messages,
            temperature: options.temperature || CONFIG.GENERATION.temperature,
            max_tokens: options.maxTokens || CONFIG.GENERATION.maxTokensPerRequest,
            ...options.additionalParams
        };

        const response = await fetch(CONFIG.OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestOptions)
        });

        // Update rate limit info
        this.updateRateLimitInfo(response);

        if (!response.ok) {
            await this.handleAPIError(response);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    updateRateLimitInfo(response) {
        this.rateLimitInfo.remaining = response.headers.get('x-ratelimit-remaining-requests');
        this.rateLimitInfo.resetTime = response.headers.get('x-ratelimit-reset-requests');
    }

    async handleAPIError(response) {
        const errorData = await response.json().catch(() => ({}));
        
        switch (response.status) {
            case 401:
                throw new Error('Invalid API key. Please check your OpenAI API key.');
            case 429:
                const retryAfter = response.headers.get('retry-after') || 60;
                throw new Error(`Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
            case 500:
            case 502:
            case 503:
                throw new Error('OpenAI service temporarily unavailable. Please try again later.');
            default:
                throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
        }
    }

    async generateWithRetry(messages, options = {}, maxRetries = CONFIG.GENERATION.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                setLoadingText(`Generating content (attempt ${attempt}/${maxRetries})...`);
                return await this.makeRequest(messages, options);
            } catch (error) {
                lastError = error;
                
                if (error.message.includes('rate limit') && attempt < maxRetries) {
                    const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
                    setLoadingText(`Rate limited. Waiting ${waitTime/1000}s before retry...`);
                    await this.sleep(waitTime);
                    continue;
                }
                
                if (attempt === maxRetries) {
                    throw lastError;
                }
                
                // Wait before retry for other errors
                await this.sleep(1000 * attempt);
            }
        }
        
        throw lastError;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async generateConcept(params) {
        const messages = [
            {
                role: 'system',
                content: PROMPTS.CONCEPT.system(params.role)
            },
            {
                role: 'user',
                content: PROMPTS.CONCEPT.user(params)
            }
        ];

        return await this.generateWithRetry(messages, {
            model: params.model,
            temperature: 0.8 // Slightly higher for creativity
        });
    }

    async generateOutline(concept, params) {
        const messages = [
            {
                role: 'system',
                content: PROMPTS.OUTLINE.system(params.role)
            },
            {
                role: 'user',
                content: PROMPTS.OUTLINE.user(concept, params)
            }
        ];

        return await this.generateWithRetry(messages, {
            model: params.model,
            temperature: 0.7
        });
    }

    async generateChapter(chapterTitle, params, context) {
        const messages = [
            {
                role: 'system',
                content: PROMPTS.CHAPTER.system(params.role)
            },
            {
                role: 'user',
                content: PROMPTS.CHAPTER.user(chapterTitle, params, context)
            }
        ];

        return await this.generateWithRetry(messages, {
            model: params.model,
            temperature: 0.7,
            maxTokens: params.detailed ? 3000 : 2000
        });
    }

    getRateLimitStatus() {
        return this.rateLimitInfo;
    }

    async testApiKey() {
        const testMessages = [
            {
                role: 'user',
                content: 'Say "API key is valid" if you can read this message.'
            }
        ];

        try {
            const response = await this.makeRequest(testMessages, {
                model: 'gpt-3.5-turbo',
                max_tokens: 10
            });
            return response.includes('API key is valid');
        } catch (error) {
            throw error;
        }
    }
}

// Export singleton instance
export const apiManager = new APIManager();