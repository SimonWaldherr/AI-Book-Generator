/**
 * API Key Configuration for AI Book Generator
 * 
 * SECURITY NOTICE:
 * This file is for development/demo purposes only.
 * In production, you should:
 * 1. Remove your API key from this file
 * 2. Use environment variables or a secure backend
 * 3. Never commit API keys to version control
 * 
 * The application now handles API keys securely through the UI.
 */

// For development/testing only - remove in production
const developmentApiKey = null; // Set to your key for testing

// Export for backward compatibility
if (typeof window !== 'undefined') {
    // Browser environment
    window.apiKey = developmentApiKey;
} else if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = { apiKey: developmentApiKey };
}

// Warning message
console.warn('🔒 SECURITY WARNING: API keys should not be stored in client-side code in production!');
console.info('ℹ️  Please enter your API key through the secure modal when the application starts.');
