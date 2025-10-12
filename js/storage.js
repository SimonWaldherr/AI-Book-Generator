/**
 * Storage module for AI Book Generator
 * Handles local storage operations and data persistence
 */

import { CONFIG } from './config.js';

class StorageManager {
    constructor() {
        this.isAvailable = this.checkStorageAvailability();
    }

    checkStorageAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            console.warn('Local storage not available:', e);
            return false;
        }
    }

    // API Key management
    saveApiKey(apiKey) {
        if (!this.isAvailable) return false;
        try {
            const encrypted = btoa(apiKey);
            localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, encrypted);
            return true;
        } catch (e) {
            console.error('Failed to save API key:', e);
            return false;
        }
    }

    getApiKey() {
        if (!this.isAvailable) return null;
        try {
            const encrypted = localStorage.getItem(CONFIG.STORAGE_KEYS.API_KEY);
            return encrypted ? atob(encrypted) : null;
        } catch (e) {
            console.error('Failed to retrieve API key:', e);
            return null;
        }
    }

    removeApiKey() {
        if (!this.isAvailable) return false;
        try {
            localStorage.removeItem(CONFIG.STORAGE_KEYS.API_KEY);
            return true;
        } catch (e) {
            console.error('Failed to remove API key:', e);
            return false;
        }
    }

    // Project management
    saveProject(projectData) {
        if (!this.isAvailable) return false;
        try {
            const projectWithTimestamp = {
                ...projectData,
                lastModified: new Date().toISOString(),
                version: '2.1'
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_PROJECT, JSON.stringify(projectWithTimestamp));
            // Also save to drafts
            this.saveDraft(projectData);
            return true;
        } catch (e) {
            console.error('Failed to save project:', e);
            return false;
        }
    }

    getLastProject() {
        if (!this.isAvailable) return null;
        try {
            const projectJson = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_PROJECT);
            return projectJson ? JSON.parse(projectJson) : null;
        } catch (e) {
            console.error('Failed to retrieve last project:', e);
            return null;
        }
    }

    // Draft management
    saveDraft(projectData) {
        if (!this.isAvailable) return false;
        try {
            const drafts = this.getDrafts();
            const draftId = this.generateDraftId(projectData);
            drafts[draftId] = {
                ...projectData,
                id: draftId,
                savedAt: new Date().toISOString(),
                title: projectData.concept ? this.extractTitle(projectData.concept) : 'Untitled Project'
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
            return draftId;
        } catch (e) {
            console.error('Failed to save draft:', e);
            return false;
        }
    }

    getDrafts() {
        if (!this.isAvailable) return {};
        try {
            const draftsJson = localStorage.getItem(CONFIG.STORAGE_KEYS.DRAFTS);
            return draftsJson ? JSON.parse(draftsJson) : {};
        } catch (e) {
            console.error('Failed to retrieve drafts:', e);
            return {};
        }
    }

    getDraft(draftId) {
        const drafts = this.getDrafts();
        return drafts[draftId] || null;
    }

    deleteDraft(draftId) {
        if (!this.isAvailable) return false;
        try {
            const drafts = this.getDrafts();
            delete drafts[draftId];
            localStorage.setItem(CONFIG.STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
            return true;
        } catch (e) {
            console.error('Failed to delete draft:', e);
            return false;
        }
    }

    // Settings management
    saveSettings(settings) {
        if (!this.isAvailable) return false;
        try {
            const currentSettings = this.getSettings();
            const mergedSettings = { ...currentSettings, ...settings };
            localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(mergedSettings));
            return true;
        } catch (e) {
            console.error('Failed to save settings:', e);
            return false;
        }
    }

    getSettings() {
        if (!this.isAvailable) return this.getDefaultSettings();
        try {
            const settingsJson = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
            const settings = settingsJson ? JSON.parse(settingsJson) : {};
            return { ...this.getDefaultSettings(), ...settings };
        } catch (e) {
            console.error('Failed to retrieve settings:', e);
            return this.getDefaultSettings();
        }
    }

    getDefaultSettings() {
        return {
            autoSave: true,
            defaultModel: 'gpt-4o-mini',
            defaultGenre: '',
            defaultLength: 'medium',
            theme: 'light',
            autoGenerate: true,
            detailedChapters: false,
            includeImages: false
        };
    }

    // Utility methods
    generateDraftId(projectData) {
        const timestamp = Date.now();
        const hash = this.simpleHash(JSON.stringify(projectData));
        return `draft_${timestamp}_${hash}`;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    extractTitle(concept) {
        const lines = concept.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('Title:') && trimmed.length < 100) {
                const titleMatch = trimmed.match(/^(?:Title:\s*)?["']?([^"']+)["']?/);
                if (titleMatch) return titleMatch[1].substring(0, 50);
            }
        }
        const firstLine = lines[0]?.trim();
        return firstLine ? firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : '') : 'Untitled Project';
    }

    exportData() {
        const data = {
            projects: this.getDrafts(),
            settings: this.getSettings(),
            lastProject: this.getLastProject(),
            exportedAt: new Date().toISOString(),
            version: '2.1'
        };
        return JSON.stringify(data, null, 2);
    }

    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.version !== '2.1') throw new Error('Incompatible data version');
            if (data.projects) localStorage.setItem(CONFIG.STORAGE_KEYS.DRAFTS, JSON.stringify(data.projects));
            if (data.settings) localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
            if (data.lastProject) localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_PROJECT, JSON.stringify(data.lastProject));
            return true;
        } catch (e) {
            console.error('Failed to import data:', e);
            return false;
        }
    }

    clearAllData() {
        if (!this.isAvailable) return false;
        try {
            Object.values(CONFIG.STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
            return true;
        } catch (e) {
            console.error('Failed to clear data:', e);
            return false;
        }
    }

    getStorageUsage() {
        if (!this.isAvailable) return { used: 0, available: 0, percentage: 0 };
        try {
            let totalSize = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    totalSize += localStorage[key].length + key.length;
                }
            }
            const estimated = 5 * 1024 * 1024;
            return { used: totalSize, available: estimated, percentage: (totalSize / estimated) * 100 };
        } catch (e) {
            console.error('Failed to calculate storage usage:', e);
            return { used: 0, available: 0, percentage: 0 };
        }
    }
}

export const storageManager = new StorageManager();
