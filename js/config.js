/**
 * Configuration module for AI Book Generator
 * Handles application settings and constants
 */

export const PROVIDERS = {
    openai: { name: 'OpenAI', apiKeyLabel: 'OpenAI API Key', apiKeyPlaceholder: 'sk-...', apiKeyHint: 'Get your key at platform.openai.com/api-keys', apiKeyLink: 'https://platform.openai.com/api-keys' },
    anthropic: { name: 'Anthropic (Claude)', apiKeyLabel: 'Anthropic API Key', apiKeyPlaceholder: 'sk-ant-...', apiKeyHint: 'Get your key at console.anthropic.com', apiKeyLink: 'https://console.anthropic.com/settings/keys' },
    google: { name: 'Google (Gemini)', apiKeyLabel: 'Google AI API Key', apiKeyPlaceholder: 'AIza...', apiKeyHint: 'Get your key at aistudio.google.com', apiKeyLink: 'https://aistudio.google.com/app/apikey' }
};

export const CONFIG = {
    // API endpoints
    OPENAI_API_URLS: {
        CHAT_COMPLETIONS: 'https://api.openai.com/v1/chat/completions',
        RESPONSES: 'https://api.openai.com/v1/responses',
        IMAGES: 'https://api.openai.com/v1/images/generations'
    },

    ANTHROPIC_API_URLS: {
        MESSAGES: 'https://api.anthropic.com/v1/messages'
    },

    GOOGLE_API_URLS: {
        // API key passed via x-goog-api-key header (not in URL) for security
        GENERATE_CONTENT: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    },

    // Model configurations
    MODELS: {
        // --- OpenAI ---
        'gpt-4o-mini': { name: 'GPT-4o mini', provider: 'openai', family: 'gpt-4o', preferredApi: 'chat' },
        'gpt-4o':      { name: 'GPT-4o', provider: 'openai', family: 'gpt-4o', preferredApi: 'chat' },
        'o4-mini':     { name: 'o4-mini (Reasoning)', provider: 'openai', family: 'o', preferredApi: 'responses' },
        'gpt-5-mini':  { name: 'GPT-5 mini', provider: 'openai', family: 'gpt-5', preferredApi: 'responses' },
        'gpt-5':       { name: 'GPT-5', provider: 'openai', family: 'gpt-5', preferredApi: 'responses' },
        'gpt-5-pro':   { name: 'GPT-5 Pro', provider: 'openai', family: 'gpt-5', preferredApi: 'responses' },
        'gpt-4-turbo': { name: 'GPT-4 Turbo (Legacy)', provider: 'openai', family: 'gpt-4', preferredApi: 'chat' },
        'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo (Legacy)', provider: 'openai', family: 'gpt-3.5', preferredApi: 'chat' },

        // --- Anthropic Claude ---
        'claude-opus-4-5':          { name: 'Claude Opus 4.5', provider: 'anthropic', family: 'claude-opus' },
        'claude-sonnet-4-5':        { name: 'Claude Sonnet 4.5', provider: 'anthropic', family: 'claude-sonnet' },
        'claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet', provider: 'anthropic', family: 'claude-3.5' },
        'claude-3-5-haiku-20241022':  { name: 'Claude 3.5 Haiku (Fast)', provider: 'anthropic', family: 'claude-3.5' },
        'claude-3-opus-20240229':     { name: 'Claude 3 Opus', provider: 'anthropic', family: 'claude-3' },
        'claude-3-haiku-20240307':    { name: 'Claude 3 Haiku (Fast)', provider: 'anthropic', family: 'claude-3' },

        // --- Google Gemini ---
        'gemini-2.5-pro':         { name: 'Gemini 2.5 Pro', provider: 'google', family: 'gemini-2.5' },
        'gemini-2.0-flash':       { name: 'Gemini 2.0 Flash (Fast)', provider: 'google', family: 'gemini-2.0' },
        'gemini-1.5-pro':         { name: 'Gemini 1.5 Pro', provider: 'google', family: 'gemini-1.5' },
        'gemini-1.5-flash':       { name: 'Gemini 1.5 Flash (Fast)', provider: 'google', family: 'gemini-1.5' }
    },

    // Generation settings
    GENERATION: {
        chapterDelay: 800, // Delay between chapter generations (ms)
        maxRetries: 3,
        temperature: 0.7,
        maxTokensPerRequest: 2000,
        streamChapters: true,        // progressively render chapter content (OpenAI chat API only)
        useJsonOutlineWhenAvailable: true,
        useJsonConceptWhenAvailable: true,
        seed: undefined              // set number for deterministic runs on supported models
    },

    // UI settings
    UI: {
        animationDuration: 300,
        progressUpdateInterval: 100,
        autoSaveInterval: 30000 // Auto-save every 30 seconds
    },

    // Export formats
    EXPORT_FORMATS: {
        TXT: 'text/plain',
        HTML: 'text/html',
        MARKDOWN: 'text/markdown',
        JSON: 'application/json',
        PDF: 'application/pdf'
    },

    // Storage keys
    STORAGE_KEYS: {
        API_KEY: 'aiBookGen_apiKey',
        API_KEY_ANTHROPIC: 'aiBookGen_apiKey_anthropic',
        API_KEY_GOOGLE: 'aiBookGen_apiKey_google',
        LAST_PROJECT: 'aiBookGen_lastProject',
        SETTINGS: 'aiBookGen_settings',
        DRAFTS: 'aiBookGen_drafts'
    }
};

export const PROMPTS = {
    CONCEPT: {
        system: (role, params) => {
            const langNote = params?.language && params.language !== 'en' ? ` Write ALL output in ${params.language}.` : '';
            return `You are ${role} — a seasoned author and creative strategist.${langNote}
Your task is to develop a compelling, commercially viable book concept with depth and originality.
Think carefully: What makes this book unique? What emotional journey will readers take? What core insight or story drives every page?
Respond ONLY with a valid JSON object — no prose, no markdown fences, no explanation.`;
        },
        user: (params) => `Develop a rich, original book concept for a ${params.length} ${params.genre} book.

User-provided context:
${params.title ? `• Working Title: "${params.title}"` : ''}${params.subtitle ? `\n• Subtitle hint: "${params.subtitle}"` : ''}
• Target Audience: ${params.audience}
${params.authorName ? `• Author Byline: ${params.authorName}` : ''}${(params.keywords && params.keywords.length) ? `\n• Keywords/Themes: ${params.keywords.join(', ')}` : ''}
• Writing Persona/Tone: ${params.role}
${params.language && params.language !== 'en' ? `• Output Language: ${params.language}` : ''}

Think step by step:
1. What central conflict or core idea anchors this book?
2. What makes it stand out in the ${params.genre} genre?
3. What emotional or intellectual transformation will readers experience?

Return ONLY a JSON object with exactly these keys (no extra text):
{
    "title": "string — compelling working title",
    "subtitle": "string — clarifying subtitle",
    "genre": "string",
    "audience": "string",
    "persona": "string — author voice and tone",
    "logline": "string — 1–2 sentence hook that captures the essence",
    "premise": "string — 2–3 paragraph story/argument summary",
    "themes": ["string", "..."],
    "hooks": ["string — specific reader intrigue points", "..."],
    "usps": ["string — unique selling points vs. similar books", "..."],
    "keywords": ["string", "..."]
}`
    },

    TITLES: {
        system: () => `You are an expert book marketing consultant who has helped dozens of bestsellers reach market.
You craft titles that are memorable, SEO-friendly, and speak directly to reader desires.
Respond ONLY with a valid JSON object — no prose, no markdown fences.`,
        user: ({ description, genre, audience, keywords, count = 6, authorName = '', language } = {}) => `Generate ${count} distinct, marketable book title options.

Context:
• Genre: ${genre}
• Target Audience: ${audience}${keywords && keywords.length ? `\n• Core Keywords: ${keywords.join(', ')}` : ''}${authorName ? `\n• Author: ${authorName}` : ''}${language && language !== 'en' ? `\n• Language: ${language}` : ''}
• Brief concept: ${description || '(not provided)'}

For each option craft:
- A title that is punchy, memorable, and searchable
- A subtitle that adds clarity and SEO value
- A 2–3 sentence back-cover description that hooks the reader
- An appropriate author persona/tone

Return ONLY JSON:
{
    "options": [
        {
            "title": "string",
            "subtitle": "string",
            "description": "string — 2–3 sentences",
            "genre": "string",
            "audience": "string",
            "persona": "string — recommended author voice",
            "keywords": "string — comma-separated"
        }
    ]
}`
    },

    OUTLINE: {
        system: (role, params) => {
            const langNote = params?.language && params.language !== 'en' ? ` All output in ${params.language}.` : '';
            return `You are ${role} — a master storyteller and structural editor.${langNote}
You understand pacing, narrative arcs, and how to guide readers from curiosity to satisfaction.
Design chapter outlines that build momentum and ensure no chapter feels filler.
Respond ONLY with a valid JSON object — no prose, no markdown fences.`;
        },
        user: (concept, params) => {
            return `Design a comprehensive, compelling chapter outline for this book concept:

---
${concept}
---

Requirements:
• Genre: ${params.genre}
• Chapters: approximately ${params.chapterCount || 10} (adjust if dramatically better)
• Each chapter must have: a gripping title, a 2–3 sentence description of what happens/is argued, and a clear purpose in the overall arc
${params.authorName ? `• Author voice: ${params.authorName}` : ''}
${params.language && params.language !== 'en' ? `• Language: ${params.language}` : ''}

Think step by step:
1. Identify the opening hook chapter
2. Plan the rising action / argument development
3. Place a mid-point shift or revelation
4. Build to a satisfying climax/conclusion

Return ONLY JSON:
{
    "title": "string",
    "chapters": [
        { "number": 1, "title": "string", "description": "string — 2–3 sentences", "purpose": "string — role in the arc" }
    ]
}`.trim();
        }
    },

    CHAPTER: {
        system: (role, params) => {
            const langNote = params?.language && params.language !== 'en' ? ` Write entirely in ${params.language}.` : '';
            return `You are ${role} — a professional author writing a complete, publication-ready chapter.${langNote}
Write with vivid sensory detail, authentic dialogue (where appropriate), and purposeful pacing.
Every paragraph must earn its place. No filler, no padding, no meta-commentary.
Begin directly with the chapter content — no chapter number header, no title repetition.`;
        },
        user: (chapterTitle, params, context) => `Write the complete chapter "${chapterTitle}" for the book "${context.title || 'Untitled'}".

Book context:
• Genre: ${params.genre}
• Target audience: ${params.audience}
• Author voice: ${params.authorName || params.role || 'N/A'}
• Core concept: ${context.concept ? context.concept.substring(0, 400) : 'N/A'}
${context.chapterPurpose ? `• Chapter purpose in the overall arc: ${context.chapterPurpose}` : ''}
${context.previousChapters && context.previousChapters !== 'This is the first chapter' ? `• Story so far (previous chapters summary): ${context.previousChapters}` : '• This is the opening chapter — establish the world and hook the reader immediately.'}
${params.language && params.language !== 'en' ? `• Language: ${params.language}` : ''}

Writing requirements:
• Length: ${params.detailed ? '2,000–3,000' : '1,200–1,800'} words
• Maintain a consistent voice and style throughout
• Open with a compelling hook — action, dialogue, or striking observation
• Close with a micro-cliffhanger or forward momentum that pulls readers to the next chapter
${params.includeImages ? '• Include [IMAGE: detailed description] placeholders where illustrations would enhance understanding' : ''}

Write the full chapter content now:`
    },

    // Agent self-review prompt for quality improvement
    REVIEW: {
        system: () => `You are a senior editor at a major publishing house. You evaluate chapters for quality, consistency, and reader engagement.
Respond ONLY with a valid JSON object.`,
        user: (chapterTitle, content, concept) => `Review this chapter excerpt from a book and provide concise editorial feedback.

Chapter: "${chapterTitle}"
Book concept (brief): ${concept ? concept.substring(0, 300) : 'N/A'}

Chapter content (first 600 chars):
${content ? content.substring(0, 600) : '(empty)'}

Evaluate and return ONLY JSON:
{
    "score": number (1–10),
    "strengths": ["string"],
    "improvements": ["string"],
    "verdict": "string — one sentence summary"
}`
    }
};

export const VALIDATION = {
    // OpenAI: sk- prefix with sufficient length
    API_KEY_OPENAI: /^sk-[A-Za-z0-9_\-]{16,}$/i,
    // Anthropic: sk-ant- prefix
    API_KEY_ANTHROPIC: /^sk-ant-[A-Za-z0-9_\-]{16,}$/i,
    // Google Gemini: AIza prefix
    API_KEY_GOOGLE: /^AIza[A-Za-z0-9_\-]{30,}$/i,
    // Generic fallback: at least 16 printable chars
    API_KEY_GENERIC: /^[A-Za-z0-9_\-\.]{16,}$/i,
    WORD_COUNT: {
        min: 1000,
        max: 200000
    },
    CHAPTER_COUNT: {
        min: 3,
        max: 50
    }
};
