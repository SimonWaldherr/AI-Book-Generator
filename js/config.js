/**
 * Configuration module for AI Book Generator
 * Handles application settings and constants
 */

export const CONFIG = {
    // API Configuration
    OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
    
    // Model configurations
    MODELS: {
        'gpt-3.5-turbo': {
            name: 'GPT-3.5 Turbo',
            maxTokens: 4096,
            costPer1kTokens: 0.0015
        },
        'gpt-4': {
            name: 'GPT-4',
            maxTokens: 8192,
            costPer1kTokens: 0.03
        },
        'gpt-4-turbo': {
            name: 'GPT-4 Turbo',
            maxTokens: 32768,
            costPer1kTokens: 0.01
        }
    },
    
    // Generation settings
    GENERATION: {
        chapterDelay: 1000, // Delay between chapter generations (ms)
        maxRetries: 3,
        temperature: 0.7,
        maxTokensPerRequest: 2000
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
        JSON: 'application/json'
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
        system: (role) => `You are ${role}. Generate engaging and well-structured book concepts.`,
        user: (params) => `Generate a detailed concept for a ${params.length} ${params.genre} book targeting ${params.audience} audience. The book should incorporate these keywords: ${params.keywords.join(', ')}. 
        
        Provide:
        1. A compelling title
        2. A detailed premise (2-3 paragraphs)
        3. Main themes and messages
        4. Target audience appeal
        5. Unique selling points
        
        Write in an engaging, professional tone.`
    },
    
    OUTLINE: {
        system: (role) => `You are ${role}. Create detailed, well-structured book outlines.`,
        user: (concept, params) => `Based on this book concept: "${concept}"
        
        Create a comprehensive table of contents for a ${params.genre} book. Each chapter should:
        1. Have a compelling title
        2. Include 2-3 sentence description of content
        3. Show logical progression
        4. Maintain consistent pacing
        
        Format as:
        Chapter 1: [Title] - [Description]
        Chapter 2: [Title] - [Description]
        etc.
        
        Aim for ${params.chapterCount || '8-12'} chapters that tell a complete story or cover the topic comprehensively.`
    },
    
    CHAPTER: {
        system: (role) => `You are ${role}. Write engaging, detailed chapters that captivate readers.`,
        user: (chapterTitle, params, context) => `Write a full chapter for the book titled "${context.title || 'Untitled'}" with this chapter title: "${chapterTitle}"
        
        Context:
        - Genre: ${params.genre}
        - Target audience: ${params.audience}
        - Book concept: ${context.concept}
        - Previous chapters context: ${context.previousChapters || 'This is the first chapter'}
        
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
    API_KEY: /^sk-[a-zA-Z0-9]{48,}$/,
    WORD_COUNT: {
        min: 1000,
        max: 200000
    },
    CHAPTER_COUNT: {
        min: 3,
        max: 50
    }
};