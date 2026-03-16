/**
 * API module for AI Book Generator
 * Handles multi-provider LLM API interactions with error handling and retry logic
 * Supported providers: OpenAI, Anthropic (Claude), Google (Gemini)
 */

import { CONFIG, PROMPTS, VALIDATION } from './config.js';
import { setLoadingText } from './ui.js';

class APIManager {
    constructor() {
        // Per-provider API keys
        this.apiKeys = { openai: null, anthropic: null, google: null };
        this.rateLimitInfo = { remaining: null, resetTime: null };
        this.chatUrl = CONFIG.OPENAI_API_URLS.CHAT_COMPLETIONS;
        this.responsesUrl = CONFIG.OPENAI_API_URLS.RESPONSES;
        this.imagesUrl = CONFIG.OPENAI_API_URLS.IMAGES;
        // Allowed parameter sets per endpoint to avoid sending unsupported params
        this.OPENAI_CHAT_ALLOWED = new Set([
            'model', 'messages', 'temperature', 'max_tokens', 'top_p', 'presence_penalty', 'frequency_penalty', 'n', 'stop', 'logit_bias', 'user', 'stream'
        ]);
        this.OPENAI_RESPONSES_ALLOWED = new Set([
            'model', 'input', 'instructions', 'temperature', 'top_p', 'max_output_tokens', 'text', 'seed', 'stream', 'metadata', 'reasoning', 'tool_choice', 'tools', 'parallel_tool_calls'
        ]);
        this.ANTHROPIC_ALLOWED = new Set([
            'model', 'messages', 'max_tokens', 'temperature', 'top_p', 'stop', 'stop_sequences', 'system'
        ]);
        this.GOOGLE_GENERATE_ALLOWED = new Set([
            'contents', 'generationConfig'
        ]);
        this.GOOGLE_GENERATION_ALLOWED = new Set([
            'temperature', 'maxOutputTokens', 'topP', 'candidateCount'
        ]);
    }

    // ---- Key management -------------------------------------------------------

    setApiKey(key, provider = 'openai') {
        if (typeof key !== 'string' || key.trim().length < 8) {
            throw new Error('Invalid API key format');
        }
        this.apiKeys[provider] = key.trim();
        // Legacy: keep .apiKey pointing at openai for backward compat
        if (provider === 'openai') this.apiKey = key.trim();
    }

    getApiKey(provider = 'openai') {
        return this.apiKeys[provider] || null;
    }

    // Determine provider from model name
    getProvider(model) {
        return CONFIG.MODELS[model]?.provider || 'openai';
    }

    // Get the correct API key for a model
    getKeyForModel(model) {
        const provider = this.getProvider(model);
        return this.apiKeys[provider];
    }

    // Decide which OpenAI sub-API to use based on model
    preferResponsesAPI(model) {
        const m = CONFIG.MODELS[model];
        return m?.provider === 'openai' && m?.preferredApi === 'responses';
    }

    // --- Payload helpers -------------------------------------------------
    sanitizeObject(obj = {}, allowedSet = new Set(), additionalParams = {}) {
        const out = {};
        for (const k of Object.keys(obj)) {
            if (allowedSet.has(k) && obj[k] !== undefined) out[k] = obj[k];
        }
        for (const [k, v] of Object.entries(additionalParams || {})) {
            if (allowedSet.has(k) && v !== undefined) out[k] = v;
        }
        return out;
    }

    sanitizeGenerationConfig(cfg = {}) {
        const out = {};
        for (const k of Object.keys(cfg)) {
            if (this.GOOGLE_GENERATION_ALLOWED.has(k) && cfg[k] !== undefined) out[k] = cfg[k];
        }
        return out;
    }

    // Split system/developer text to instructions for Responses API, keep user/assistant in input
    prepareResponsesInput(messages = []) {
        const instructionParts = [];
        const input = [];
        for (const m of messages || []) {
            if (!m || !m.role) continue;
            if (m.role === 'system' || m.role === 'developer') {
                if (m.content) instructionParts.push(String(m.content));
                continue;
            }
            input.push({ role: m.role, content: m.content });
        }
        return {
            input,
            instructions: instructionParts.length ? instructionParts.join('\n\n') : undefined
        };
    }

    // Try several common locations for text output in the Responses API
    extractResponsesOutput(data) {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (data.output_text) return data.output_text;

        const tryPaths = [
            // output -> content -> text
            (d) => d.output?.map(o => (o.content || []).map(c => c.text || c.parts?.map(p=>p.text).join('') || '').join('')).join(''),
            // output -> content -> parts -> text
            (d) => d.output?.map(o => (o.content || []).map(c => (c.parts || []).map(p => p.text || '').join('')).join('')).join(''),
            // legacy fields
            (d) => d.choices?.map(c => c.message?.content || '').join(''),
            (d) => d.choices?.map(c => c.text || '').join(''),
            (d) => d.output?.map(o => o.text || '').join(''),
            (d) => d.output?.[0]?.content?.[0]?.text,
            (d) => d.output?.[0]?.text,
            (d) => d.data?.map(x => x.text).join('')
        ];

        for (const fn of tryPaths) {
            try {
                const v = fn(data);
                if (v && typeof v === 'string' && v.trim()) return v;
            } catch (e) { /* ignore */ }
        }

        // Fallback: if output contains a JSON object with chapters, try to serialize it
        try {
            const json = JSON.stringify(data);
            const match = json.match(/\{[\s\S]*\}/);
            if (match) return match[0];
        } catch (e) { /* ignore */ }

        console.warn('Unable to extract text from Responses API response object');
        return '';
    }

    // ---- Unified request dispatcher ------------------------------------------

    async makeRequest(messages, options = {}) {
        const model = options.model || 'gpt-4o-mini';
        const provider = this.getProvider(model);
        switch (provider) {
            case 'anthropic': return this.makeAnthropicRequest(messages, options);
            case 'google':    return this.makeGoogleRequest(messages, options);
            default:
                if (this.preferResponsesAPI(model)) {
                    return this.makeResponsesRequest(messages, options);
                }
                return this.makeChatRequest(messages, options);
        }
    }

    // ---- OpenAI Chat Completions ---------------------------------------------

    async makeChatRequest(messages, options = {}) {
        const key = this.apiKeys.openai;
        if (!key) throw new Error('OpenAI API key not set');

        const base = {
            model: options.model || 'gpt-4o-mini',
            messages,
            max_tokens: options.maxTokens ?? CONFIG.GENERATION.maxTokensPerRequest,
            stream: false
        };
        if (options.temperature !== undefined) base.temperature = options.temperature ?? CONFIG.GENERATION.temperature;
        if (options.presence_penalty !== undefined) base.presence_penalty = options.presence_penalty;
        if (options.frequency_penalty !== undefined) base.frequency_penalty = options.frequency_penalty;
        if (options.top_p !== undefined) base.top_p = options.top_p;

        const requestOptions = this.sanitizeObject(base, this.OPENAI_CHAT_ALLOWED, options.additionalParams);

        const response = await fetch(this.chatUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestOptions)
        });

        this.updateRateLimitInfo(response);
        if (!response.ok) await this.handleOpenAIError(response);
        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? '';
    }

    async streamChatRequest(messages, options = {}, onDelta) {
        const key = this.apiKeys.openai;
        if (!key) throw new Error('OpenAI API key not set');

        const base = {
            model: options.model || 'gpt-4o-mini',
            messages,
            max_tokens: options.maxTokens ?? CONFIG.GENERATION.maxTokensPerRequest,
            stream: true
        };
        if (options.temperature !== undefined) base.temperature = options.temperature ?? CONFIG.GENERATION.temperature;

        const requestOptions = this.sanitizeObject(base, this.OPENAI_CHAT_ALLOWED, options.additionalParams);

        const response = await fetch(this.chatUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestOptions)
        });

        this.updateRateLimitInfo(response);
        if (!response.ok) await this.handleOpenAIError(response);

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
        const key = this.apiKeys.openai;
        if (!key) throw new Error('OpenAI API key not set');

        const model = options.model || 'gpt-5-mini';
        const { input, instructions } = this.prepareResponsesInput(messages);
        // Some Responses-models (e.g. gpt-5-mini) reject the `temperature` param.
        // Only include temperature for models known to accept it.
        const skipTemperatureFor = new Set(['gpt-5-mini']);

        const requestOptions = {
            model,
            input,
            ...(instructions ? { instructions } : {}),
            max_output_tokens: options.maxTokens ?? CONFIG.GENERATION.maxTokensPerRequest,
            ...(CONFIG.GENERATION.seed !== undefined ? { seed: CONFIG.GENERATION.seed } : {}),
            ...(options.additionalParams || {})
        };

        if (!skipTemperatureFor.has(model)) {
            requestOptions.temperature = options.temperature ?? CONFIG.GENERATION.temperature;
        }
        if (options.top_p !== undefined) requestOptions.top_p = options.top_p;

        // Responses API moved structured output config under `text.format`.
        if (options.response_format) {
            requestOptions.text = { format: options.response_format };
        }

        // Sanitize to avoid sending unexpected keys to Responses API
        const sanitized = this.sanitizeObject(requestOptions, this.OPENAI_RESPONSES_ALLOWED, {});

        let response = await fetch(this.responsesUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sanitized)
        });

        // Automatic fallback for model-specific unsupported parameters.
        if (!response.ok && response.status === 400) {
            const errorData = await response.clone().json().catch(() => ({}));
            const msg = String(errorData?.error?.message || errorData?.message || '').toLowerCase();
            if (msg.includes('unsupported parameter')) {
                const retryPayload = { ...sanitized };
                let changed = false;
                if (msg.includes('temperature')) {
                    delete retryPayload.temperature;
                    changed = true;
                }
                if (msg.includes('response_format') || msg.includes('text.format') || msg.includes("'text'")) {
                    delete retryPayload.text;
                    changed = true;
                }
                if (msg.includes('top_p')) {
                    delete retryPayload.top_p;
                    changed = true;
                }
                if (changed) {
                    response = await fetch(this.responsesUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(retryPayload)
                    });
                }
            }
        }

        this.updateRateLimitInfo(response);
        if (!response.ok) await this.handleOpenAIError(response);
        const data = await response.json();
        const extracted = this.extractResponsesOutput(data);
        return extracted || '';
    }

    // ---- Anthropic Claude API ------------------------------------------------

    async makeAnthropicRequest(messages, options = {}) {
        const key = this.apiKeys.anthropic;
        if (!key) throw new Error('Anthropic API key not set. Please add your Anthropic key in the API Key settings.');

        // Anthropic separates the system message from the messages array
        let systemMessage = '';
        const filteredMessages = [];
        for (const m of messages) {
            if (m.role === 'system') {
                systemMessage = m.content;
            } else {
                filteredMessages.push({ role: m.role, content: m.content });
            }
        }

        const base = {
            model: options.model || 'claude-3-5-sonnet-20241022',
            max_tokens: options.maxTokens ?? 4096,
            messages: filteredMessages
        };
        if (systemMessage) base.system = systemMessage;
        if (options.temperature !== undefined) base.temperature = options.temperature ?? CONFIG.GENERATION.temperature;
        if (options.top_p !== undefined) base.top_p = options.top_p;

        const body = this.sanitizeObject(base, this.ANTHROPIC_ALLOWED, options.additionalParams);

        const response = await fetch(CONFIG.ANTHROPIC_API_URLS.MESSAGES, {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                // This header is required for direct browser access to the Anthropic API.
                // For production deployments, route requests through a backend proxy instead
                // to avoid exposing API keys in the browser environment.
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) await this.handleAnthropicError(response);
        const data = await response.json();
        return data.content?.[0]?.text || '';
    }

    // ---- Google Gemini API ---------------------------------------------------

    async makeGoogleRequest(messages, options = {}) {
        const key = this.apiKeys.google;
        if (!key) throw new Error('Google API key not set. Please add your Google Gemini key in the API Key settings.');

        const model = options.model || 'gemini-1.5-flash';
        // Use the base URL without the key in the query string for security.
        // The key is passed via the x-goog-api-key header instead.
        const url = CONFIG.GOOGLE_API_URLS.GENERATE_CONTENT.replace('{model}', model);

        // Extract system instruction
        let systemInstruction = null;
        const contents = [];
        for (const m of messages) {
            if (m.role === 'system') {
                systemInstruction = { parts: [{ text: m.content }] };
            } else {
                // Gemini uses "user" and "model" roles
                const role = m.role === 'assistant' ? 'model' : 'user';
                contents.push({ role, parts: [{ text: m.content }] });
            }
        }

        const generationBase = {
            temperature: options.temperature ?? CONFIG.GENERATION.temperature,
            maxOutputTokens: options.maxTokens ?? 4096,
            topP: options.top_p,
            candidateCount: options.candidateCount
        };
        const generationConfig = this.sanitizeGenerationConfig(generationBase);

        const body = {
            contents,
            ...(Object.keys(generationConfig).length ? { generationConfig } : {})
        };
        if (systemInstruction) body.systemInstruction = systemInstruction;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) await this.handleGoogleError(response);
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // ---- Image generation (OpenAI only) --------------------------------------

    async generateImage(prompt, { size = '1024x1536', model = 'gpt-image-1' } = {}) {
        const key = this.apiKeys.openai;
        if (!key) throw new Error('OpenAI API key not set');
        let body = { model, prompt, size, n: 1, response_format: 'b64_json' };

        let response = await fetch(this.imagesUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            const errMsg = (errJson.error?.message || errJson.message || '').toString().toLowerCase();
            if (errMsg.includes('unknown parameter') && errMsg.includes('response_format')) {
                body = { model, prompt, size, n: 1 };
                response = await fetch(this.imagesUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
        }

        if (!response.ok) await this.handleOpenAIError(response);
        const data = await response.json();
        const b64 = data.data?.[0]?.b64_json || data.data?.[0]?.b64 || data[0]?.b64_json || data[0]?.b64;
        if (!b64) throw new Error('Image generation returned no data');
        return `data:image/png;base64,${b64}`;
    }

    // ---- Error handlers -------------------------------------------------------

    updateRateLimitInfo(response) {
        this.rateLimitInfo.remaining = response.headers.get('x-ratelimit-remaining-requests');
        this.rateLimitInfo.resetTime = response.headers.get('x-ratelimit-reset-requests');
    }

    async handleOpenAIError(response) {
        const errorData = await response.json().catch(() => ({}));
        switch (response.status) {
            case 401: throw new Error('Invalid OpenAI API key. Please check your key in the API settings.');
            case 429: {
                const retryAfter = response.headers.get('retry-after') || 60;
                throw new Error(`OpenAI rate limit exceeded. Please wait ${retryAfter} seconds.`);
            }
            case 500: case 502: case 503:
                throw new Error('OpenAI service temporarily unavailable. Please try again later.');
            default:
                throw new Error(errorData.error?.message || `OpenAI API request failed (${response.status})`);
        }
    }

    async handleAnthropicError(response) {
        const errorData = await response.json().catch(() => ({}));
        switch (response.status) {
            case 401: throw new Error('Invalid Anthropic API key. Please check your key in the API settings.');
            case 429: throw new Error('Anthropic rate limit exceeded. Please wait before retrying.');
            case 500: case 529: throw new Error('Anthropic service temporarily unavailable. Please try again later.');
            default:
                throw new Error(errorData.error?.message || `Anthropic API request failed (${response.status})`);
        }
    }

    async handleGoogleError(response) {
        const errorData = await response.json().catch(() => ({}));
        switch (response.status) {
            case 400: throw new Error(`Google Gemini API error: ${errorData.error?.message || 'Bad request'}`);
            case 403: throw new Error('Invalid Google API key or insufficient permissions. Check your key in API settings.');
            case 429: throw new Error('Google Gemini rate limit exceeded. Please wait before retrying.');
            default:
                throw new Error(errorData.error?.message || `Google Gemini API request failed (${response.status})`);
        }
    }

    // ---- Retry wrapper -------------------------------------------------------

    async generateWithRetry(fn, maxRetries = CONFIG.GENERATION.maxRetries) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
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

    // ---- Public high-level methods -------------------------------------------

    async generateTitleSuggestions(params) {
        const messages = [
            { role: 'system', content: PROMPTS.TITLES.system() },
            { role: 'user', content: PROMPTS.TITLES.user(params) }
        ];

        const opts = { model: params.model, temperature: 0.8 };
        // Prefer structured JSON responses when configured or when prompt requests JSON
        if (params?.jsonMode || CONFIG.GENERATION.useJsonConceptWhenAvailable) {
            opts.response_format = { type: 'json_object' };
        }
        const call = () => this.makeRequest(messages, opts);
        const raw = await this.generateWithRetry(call);
        try {
            const json = JSON.parse(raw);
            if (json && Array.isArray(json.options)) return json.options;
            if (Array.isArray(json)) return json;
        } catch {}
        const match = String(raw).match(/\{[\s\S]*\}/);
        if (match) {
            try {
                const json2 = JSON.parse(match[0]);
                if (json2 && Array.isArray(json2.options)) return json2.options;
            } catch {}
        }
        return [{ title: 'Untitled', subtitle: '', description: String(raw).trim() }];
    }

    async generateConcept(params) {
        const messages = [
            { role: 'system', content: PROMPTS.CONCEPT.system(params.role, params) },
            { role: 'user', content: PROMPTS.CONCEPT.user(params) }
        ];
        const opts = { model: params.model, temperature: params.temperature ?? 0.8 };
        if (params?.jsonMode || CONFIG.GENERATION.useJsonConceptWhenAvailable) opts.response_format = { type: 'json_object' };
        const call = () => this.makeRequest(messages, opts);
        return await this.generateWithRetry(call);
    }

    async generateOutline(concept, params) {
        const messages = [
            { role: 'system', content: PROMPTS.OUTLINE.system(params.role, params) },
            { role: 'user', content: PROMPTS.OUTLINE.user(concept, params) }
        ];
        const opts = { model: params.model, temperature: params.temperature ?? 0.7 };
        if (params?.jsonMode || CONFIG.GENERATION.useJsonOutlineWhenAvailable) opts.response_format = { type: 'json_object' };
        const call = () => this.makeRequest(messages, opts);
        return await this.generateWithRetry(call);
    }

    async generateChapter(chapterTitle, params, context) {
        const messages = [
            { role: 'system', content: PROMPTS.CHAPTER.system(params.role, params) },
            { role: 'user', content: PROMPTS.CHAPTER.user(chapterTitle, params, context) }
        ];

        const model = params.model;
        const provider = this.getProvider(model);
        const maxTokens = params.detailed ? 4000 : 2500;

        // Stream only for OpenAI chat models
        if (provider === 'openai' && !this.preferResponsesAPI(model) && CONFIG.GENERATION.streamChapters && params.onToken) {
            const call = () => this.streamChatRequest(messages, {
                model, temperature: params.temperature ?? 0.7, maxTokens
            }, params.onToken);
            return await this.generateWithRetry(call);
        }

        const call = () => this.makeRequest(messages, {
            model, temperature: params.temperature ?? 0.7, maxTokens
        });
        return await this.generateWithRetry(call);
    }

    async testApiKey(provider = 'openai') {
        const testMsg = [{ role: 'user', content: 'Reply with exactly: API key is valid' }];
        const testOpts = { temperature: 0, maxTokens: 10 };

        switch (provider) {
            case 'anthropic': {
                // Try Claude models
                const claudeModels = ['claude-3-5-haiku-20241022', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022'];
                for (const m of claudeModels) {
                    try {
                        const res = await this.makeAnthropicRequest(testMsg, { ...testOpts, model: m });
                        if (res) return true;
                    } catch { /* try next */ }
                }
                throw new Error('Anthropic API test failed for all tried models.');
            }
            case 'google': {
                const geminiModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
                for (const m of geminiModels) {
                    try {
                        const res = await this.makeGoogleRequest(testMsg, { ...testOpts, model: m });
                        if (res) return true;
                    } catch { /* try next */ }
                }
                throw new Error('Google Gemini API test failed for all tried models.');
            }
            default: {
                const openAIModels = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
                for (const m of openAIModels) {
                    try {
                        const useR = this.preferResponsesAPI(m);
                        const res = useR
                            ? await this.makeResponsesRequest(testMsg, { ...testOpts, model: m })
                            : await this.makeChatRequest(testMsg, { ...testOpts, model: m });
                        if (res) return true;
                    } catch { /* try next */ }
                }
                throw new Error('OpenAI API test failed for all tried models.');
            }
        }
    }
}

// Export singleton instance
export const apiManager = new APIManager();
