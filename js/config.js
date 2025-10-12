/**
 * Configuration module for AI Book Generator
 * Handles application settings and constants
 */

export const CONFIG = {
    // API endpoints
    OPENAI_API_URLS: {
        CHAT_COMPLETIONS: 'https://api.openai.com/v1/chat/completions',
        RESPONSES: 'https://api.openai.com/v1/responses',
        IMAGES: 'https://api.openai.com/v1/images/generations'
    },

    // Model configurations (display names only; pricing omitted to avoid staleness)
    MODELS: {
        // Newer
        'gpt-5-pro': { name: 'GPT-5 Pro', family: 'gpt-5', preferredApi: 'responses' },
        'gpt-5':     { name: 'GPT-5', family: 'gpt-5', preferredApi: 'responses' },
        'gpt-5-mini':{ name: 'GPT-5 mini', family: 'gpt-5', preferredApi: 'responses' },
        'gpt-5-nano':{ name: 'GPT-5 nano', family: 'gpt-5', preferredApi: 'responses' },

        // Strong current models
        'gpt-4o-mini': { name: 'GPT-4o mini', family: 'gpt-4o', preferredApi: 'chat' },
        'gpt-4o':      { name: 'GPT-4o', family: 'gpt-4o', preferredApi: 'chat' },
        'o4-mini':     { name: 'o4-mini', family: 'o', preferredApi: 'responses' },

        // Legacy (kept for compatibility)
        'gpt-4-turbo': { name: 'GPT-4 Turbo', family: 'gpt-4', preferredApi: 'chat' },
        'gpt-4':       { name: 'GPT-4', family: 'gpt-4', preferredApi: 'chat' },
        'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', family: 'gpt-3.5', preferredApi: 'chat' }
    },

    // Generation settings
    GENERATION: {
        chapterDelay: 800, // Delay between chapter generations (ms)
        maxRetries: 3,
        temperature: 0.7,
        maxTokensPerRequest: 2000,
        // New flags
        streamChapters: true,        // progressively render chapter content (chat API only)
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
        LAST_PROJECT: 'aiBookGen_lastProject',
        SETTINGS: 'aiBookGen_settings',
        DRAFTS: 'aiBookGen_drafts'
    }
};

export const PROMPTS = {
    CONCEPT: {
                system: (role) => `You are ${role}. Generate engaging and well-structured book concepts as JSON objects.`,
                user: (params) => `Create a complete book concept for a ${params.length} ${params.genre} book.
Details provided by the user:
${params.title ? `- Title: ${params.title}\n` : ''}${params.subtitle ? `- Subtitle: ${params.subtitle}\n` : ''}- Audience: ${params.audience}
${params.authorName ? `- Author: ${params.authorName}\n` : ''}${(params.keywords && params.keywords.length) ? `- Keywords: ${params.keywords.join(', ')}\n` : ''}- Persona/Tone: ${params.role}
${params.language ? `- Language: ${params.language}\n` : ''}

Return ONLY a JSON object with keys:
{
    "title": string,
    "subtitle": string,
    "genre": string,
    "audience": string,
    "persona": string,
    "logline": string,            // 1-2 sentence hook
    "premise": string,            // 2-3 paragraphs
    "themes": string[],
    "hooks": string[],            // reader hooks/intrigue points
    "usps": string[],             // unique selling points
    "keywords": string[]
}`
    },
        TITLES: {
                system: () => `You are a creative book marketing assistant. You craft catchy, marketable book titles, subtitles, and back-cover style blurbs.`,
                user: ({ description, genre, audience, keywords, count = 6, authorName = '', language } = {}) => `Based on the following details, generate ${count} distinct options.

Details:
- Genre: ${genre}
- Target audience: ${audience}
${(keywords && keywords.length) ? `- Keywords: ${keywords.join(', ')}` : ''}
${authorName ? `- Author: ${authorName}` : ''}
${language ? `- Language: ${language}` : ''}

For each option, return an object with:

Return ONLY JSON with this structure:
{
    "options": [
        { "title": string, "subtitle": string, "description": string, "genre": string, "audience": string, "persona": string, "keywords": string }
    ]
}`
        },

    OUTLINE: {
        system: (role) => `You are ${role}. Create detailed, well-structured book outlines.`,
                user: (concept, params) => {
            const jsonHint = params.jsonMode ? `
Return ONLY JSON that matches:
{
  "title": string,
  "chapters": [
    { "number": integer, "title": string, "description": string }
  ]
}
` : '';

            return `Based on this book concept: "${concept}"
            
Create a comprehensive table of contents for a ${params.genre} book. Each chapter should:
1. Have a compelling title
2. Include 2-3 sentence description of content
3. Show logical progression
4. Maintain consistent pacing
${params.authorName ? `\nAuthor: ${params.authorName}` : ''}

Format as:
Chapter 1: [Title] - [Description]
Chapter 2: [Title] - [Description]
etc.

Aim for ${params.chapterCount || '8-12'} chapters that tell a complete story or cover the topic comprehensively.
${jsonHint}`.trim();
        }
    },

    CHAPTER: {
        system: (role) => `You are ${role}. Write engaging, detailed chapters that captivate readers.`,
        user: (chapterTitle, params, context) => `Write a full chapter for the book titled "${context.title || 'Untitled'}" with this chapter title: "${chapterTitle}"
        
Context:
- Genre: ${params.genre}
- Target audience: ${params.audience}
- Author: ${params.authorName || 'N/A'}
- Book concept: ${context.concept}
- Previous chapters context: ${context.previousChapters || 'This is the first chapter'}
 - Language: ${params.language || 'en'}

Requirements:
- Write ${params.detailed ? '2000-3000' : '1000-1500'} words
- Maintain consistent tone and style
- Include vivid descriptions and engaging narrative
- Ensure smooth flow and proper pacing
- ${params.includeImages ? 'Include [IMAGE: description] placeholders for relevant illustrations' : ''}

Write the complete chapter content without any meta-commentary.`
    }
};

export const VALIDATION = {
    // Future-proof API key format (supports sk-live, sk-test, sk-proj, etc.)
    // Be permissive: accept any string starting with sk- and at least 16 more safe chars
    API_KEY: /^sk-[A-Za-z0-9_\-]{16,}$/i,
    WORD_COUNT: {
        min: 1000,
        max: 200000
    },
    CHAPTER_COUNT: {
        min: 3,
        max: 50
    }
};
