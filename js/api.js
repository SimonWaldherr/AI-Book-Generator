/**
 * API module for AI Book Generator
 * Handles all OpenAI API interactions with error handling and retry logic
 */

import { CONFIG, PROMPTS, VALIDATION } from './config.js';
import { setLoadingText } from './ui.js';

class APIManager {
    constructor() {
        this.apiKey = null;
        this.rateLimitInfo = { remaining: null, resetTime: null };
        this.chatUrl = CONFIG.OPENAI_API_URLS.CHAT_COMPLETIONS;
        this.responsesUrl = CONFIG.OPENAI_API_URLS.RESPONSES;
        this.imagesUrl = CONFIG.OPENAI_API_URLS.IMAGES;
    }

    setApiKey(key) {
        // Accept if it matches validation or at least looks like a key
        if (VALIDATION?.API_KEY && VALIDATION.API_KEY.test(key)) {
            this.apiKey = key;
            return;
        }
        if (typeof key === 'string' && key.trim().length >= 16) {
            this.apiKey = key.trim();
            return;
        }
        throw new Error('Invalid API key format');
    }

    getApiKey() {
        return this.apiKey;
    }

    // Decide which API to use based on model
    preferResponsesAPI(model) {
        const m = CONFIG.MODELS[model];
        return m?.preferredApi === 'responses';
    }

    // --- Core request helpers -------------------------------------------------

    async makeChatRequest(messages, options = {}) {
        if (!this.apiKey) throw new Error('API key not set');

        const requestOptions = {
            model: options.model || 'gpt-4o-mini',
            messages,
            temperature: options.temperature ?? CONFIG.GENERATION.temperature,
            max_tokens: options.maxTokens ?? CONFIG.GENERATION.maxTokensPerRequest,
            presence_penalty: options.presence_penalty,
            frequency_penalty: options.frequency_penalty,
            top_p: options.top_p,
            stream: false,
            ...(CONFIG.GENERATION.seed !== undefined ? { seed: CONFIG.GENERATION.seed } : {}),
            // Note: Chat completions / chat API does not accept a `response_format` parameter.
            // `response_format` is supported by the newer Responses API. We intentionally
            // do NOT forward options.response_format here to avoid server errors like
            // "Unknown parameter: 'response_format'".
            ...(options.additionalParams || {})
        };

        const response = await fetch(this.chatUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestOptions)
        });

        this.updateRateLimitInfo(response);
        if (!response.ok) await this.handleAPIError(response);
        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? '';
    }

    async streamChatRequest(messages, options = {}, onDelta) {
        if (!this.apiKey) throw new Error('API key not set');

        const requestOptions = {
            model: options.model || 'gpt-4o-mini',
            messages,
            temperature: options.temperature ?? CONFIG.GENERATION.temperature,
            max_tokens: options.maxTokens ?? CONFIG.GENERATION.maxTokensPerRequest,
            stream: true,
            ...(CONFIG.GENERATION.seed !== undefined ? { seed: CONFIG.GENERATION.seed } : {}),
            ...(options.additionalParams || {})
        };

        const response = await fetch(this.chatUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestOptions)
        });

        this.updateRateLimitInfo(response);
        if (!response.ok) await this.handleAPIError(response);

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let aggregated = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });

            const lines = chunk.split('\n');
            for (const raw of lines) {
                const line = raw.trim();
                if (!line.startsWith('data:')) continue;
                const data = line.replace(/^data:\s*/, '');
                if (data === '[DONE]') {
                    onDelta && onDelta('', aggregated, true);
                    return aggregated;
                }
                try {
                    const payload = JSON.parse(data);
                    const token = payload.choices?.[0]?.delta?.content || '';
                    if (token) {
                        aggregated += token;
                        onDelta && onDelta(token, aggregated, false);
                    }
                } catch {
                    // ignore
                }
            }
        }

        return aggregated;
    }

    async makeResponsesRequest(messages, options = {}) {
        if (!this.apiKey) throw new Error('API key not set');

        // Responses API uses "input" rather than "messages", but accepts the same semantics
        const requestOptions = {
            model: options.model || 'gpt-5-mini',
            input: messages, // pass role/content objects
            temperature: options.temperature ?? CONFIG.GENERATION.temperature,
            max_output_tokens: options.maxTokens ?? CONFIG.GENERATION.maxTokensPerRequest,
            ...(CONFIG.GENERATION.seed !== undefined ? { seed: CONFIG.GENERATION.seed } : {}),
            ...(options.response_format ? { response_format: options.response_format } : {}),
            ...(options.additionalParams || {})
        };

        const response = await fetch(this.responsesUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestOptions)
        });

        this.updateRateLimitInfo(response);
        if (!response.ok) await this.handleAPIError(response);
        const data = await response.json();
        // The Responses API returns output_text or output[0].content
        const text = data.output_text || data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
        return text;
    }

    async generateImage(prompt, { size = '1024x1536', model = 'gpt-image-1' } = {}) {
        if (!this.apiKey) throw new Error('API key not set');
        // First try: request base64 JSON (legacy clients sometimes expect b64_json)
        let body = {
            model,
            prompt,
            size,
            n: 1,
            response_format: 'b64_json'
        };

        let response = await fetch(this.imagesUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        // If the server rejects `response_format` (some endpoints don't accept it),
        // retry without that parameter.
        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            const errMsg = (errJson.error?.message || errJson.message || '').toString().toLowerCase();
            if (errMsg.includes('unknown parameter') && errMsg.includes('response_format')) {
                // Retry without response_format
                body = { model, prompt, size, n: 1 };
                response = await fetch(this.imagesUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
            }
        }

        if (!response.ok) await this.handleAPIError(response);
        const data = await response.json();

        // Prefer b64_json if present, otherwise try other common fields
        const b64 = data.data?.[0]?.b64_json || data.data?.[0]?.b64 || data[0]?.b64_json || data[0]?.b64;
        if (!b64) throw new Error('Image generation returned no data');
        return `data:image/png;base64,${b64}`;
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
            case 429: {
                const retryAfter = response.headers.get('retry-after') || 60;
                throw new Error(`Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
            }
            case 500:
            case 502:
            case 503:
                throw new Error('OpenAI service temporarily unavailable. Please try again later.');
            default:
                throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
        }
    }

    async generateWithRetry(fn, maxRetries = CONFIG.GENERATION.maxRetries) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                setLoadingText(`Generating content (attempt ${attempt}/${maxRetries})...`);
                return await fn();
            } catch (error) {
                lastError = error;
                const msg = String(error?.message || '').toLowerCase();
                if (msg.includes('rate limit') && attempt < maxRetries) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    setLoadingText(`Rate limited. Waiting ${waitTime / 1000}s before retry...`);
                    await this.sleep(waitTime);
                    continue;
                }
                if (attempt === maxRetries) throw lastError;
                await this.sleep(1000 * attempt);
            }
        }
        throw lastError;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Public high-level methods -------------------------------------------

    async generateTitleSuggestions(params) {
        const messages = [
            { role: 'system', content: PROMPTS.TITLES.system() },
            { role: 'user', content: PROMPTS.TITLES.user(params) }
        ];

        const useResponses = this.preferResponsesAPI(params.model);
        const call = () => useResponses
            ? this.makeResponsesRequest(messages, { model: params.model, temperature: 0.8, response_format: { type: 'json_object' } })
            : this.makeChatRequest(messages, { model: params.model, temperature: 0.8 /* no response_format for chat */ });
        const raw = await this.generateWithRetry(call);
        try {
            const json = JSON.parse(raw);
            if (json && Array.isArray(json.options)) return json.options;
            if (Array.isArray(json)) return json; // accept bare array
        } catch {}
        // Fallback: try to extract JSON block
        const match = String(raw).match(/\{[\s\S]*\}/);
        if (match) {
            try {
                const json2 = JSON.parse(match[0]);
                if (json2 && Array.isArray(json2.options)) return json2.options;
            } catch {}
        }
        // Last resort: return a single option using the raw text
        return [{ title: 'Untitled', subtitle: '', description: String(raw).trim() }];
    }

    async generateConcept(params) {
        const messages = [
            { role: 'system', content: PROMPTS.CONCEPT.system(params.role) },
            { role: 'user', content: PROMPTS.CONCEPT.user(params) }
        ];

        const useResponses = this.preferResponsesAPI(params.model);
        const jsonMode = !!params.jsonMode;
        const call = () => useResponses
            ? this.makeResponsesRequest(messages, { model: params.model, temperature: params.temperature ?? 0.8, response_format: jsonMode ? { type: 'json_object' } : undefined })
            : this.makeChatRequest(messages, { model: params.model, temperature: params.temperature ?? 0.8 /* chat API: no response_format */ });
        return await this.generateWithRetry(call);
    }

    async generateOutline(concept, params) {
        const messages = [
            { role: 'system', content: PROMPTS.OUTLINE.system(params.role) },
            { role: 'user', content: PROMPTS.OUTLINE.user(concept, { ...params, jsonMode: CONFIG.GENERATION.useJsonOutlineWhenAvailable }) }
        ];
        const wantsJson = CONFIG.GENERATION.useJsonOutlineWhenAvailable;
        const useResponses = this.preferResponsesAPI(params.model);
        const call = () => useResponses
            ? this.makeResponsesRequest(messages, { model: params.model, temperature: params.temperature ?? 0.7, response_format: wantsJson ? { type: 'json_object' } : undefined })
            : this.makeChatRequest(messages, { model: params.model, temperature: params.temperature ?? 0.7, response_format: wantsJson ? { type: 'json_object' } : undefined });
        return await this.generateWithRetry(call);
    }

    async generateChapter(chapterTitle, params, context) {
        const messages = [
            { role: 'system', content: PROMPTS.CHAPTER.system(params.role) },
            { role: 'user', content: PROMPTS.CHAPTER.user(chapterTitle, params, context) }
        ];

        const useResponses = this.preferResponsesAPI(params.model);
        if (useResponses) {
            const call = () => this.makeResponsesRequest(messages, {
                model: params.model,
                temperature: params.temperature ?? 0.7,
                maxTokens: params.detailed ? 3000 : 2000
            });
            return await this.generateWithRetry(call);
        }

        if (CONFIG.GENERATION.streamChapters) {
            const call = () => this.streamChatRequest(messages, {
                model: params.model,
                temperature: params.temperature ?? 0.7,
                maxTokens: params.detailed ? 3000 : 2000
            }, params.onToken);
            return await this.generateWithRetry(call);
        } else {
            const call = () => this.makeChatRequest(messages, {
                model: params.model,
                temperature: params.temperature ?? 0.7,
                maxTokens: params.detailed ? 3000 : 2000
            });
            return await this.generateWithRetry(call);
        }
    }

    async testApiKey() {
        const candidates = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        const probeChat = async (model) => {
            const res = await this.makeChatRequest([{ role: 'user', content: 'Reply with exactly: API key is valid' }], { model, maxTokens: 5, temperature: 0 });
            return /api key is valid/i.test(res);
        };
        const probeResponses = async (model) => {
            const res = await this.makeResponsesRequest([{ role: 'user', content: 'Reply with exactly: API key is valid' }], { model, maxTokens: 5, temperature: 0 });
            return /api key is valid/i.test(res);
        };
        for (const m of candidates) {
            try {
                const useR = this.preferResponsesAPI(m);
                const ok = useR ? await probeResponses(m) : await probeChat(m);
                if (ok) return true;
            } catch {
                // try next model
            }
        }
        throw new Error('API test failed for all tried models.');
    }
}

// Export singleton instance
export const apiManager = new APIManager();
