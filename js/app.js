/**
 * Main application module for AI Book Generator
 * Coordinates all functionality and handles user interactions
 */

import { CONFIG } from './config.js';
import { apiManager } from './api.js';
import { uiManager, showAlert, showLoading, hideLoading, setLoadingText, showSection, enableButton, setButtonLoading } from './ui.js';
import { storageManager } from './storage.js';
import { exportManager } from './export.js';

class BookGenerator {
    constructor() {
        this.currentProject = {
            concept: '',
            tableOfContents: '',
            chapters: [],
            settings: {},
            metadata: {}
        };
        
        this.generationState = {
            isGenerating: false,
            currentStep: '',
            chapterIndex: 0,
            autoGenerate: false
        };

        this.initialize();
    }

    async initialize() {
        // Load saved settings
        this.loadSettings();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize UI components
        this.initializeUI();
        
        // Check for saved API key
        await this.checkApiKey();
        
        // Load last project if available
        this.loadLastProject();
        
        // Setup auto-save
        this.setupAutoSave();
        
        console.log('AI Book Generator initialized');
    }

    loadSettings() {
        const settings = storageManager.getSettings();
        this.currentProject.settings = settings;
        
        // Apply settings to UI
        document.getElementById('gpt-model').value = settings.defaultModel;
        document.getElementById('auto-gen').checked = settings.autoGenerate;
        document.getElementById('detailed-chapters').checked = settings.detailedChapters;
        document.getElementById('include-images').checked = settings.includeImages;
    }

    setupEventListeners() {
        // Form submission prevention
        document.getElementById('book-form').addEventListener('submit', (e) => {
            e.preventDefault();
        });

        // Generation buttons
        document.getElementById('concept-btn').addEventListener('click', () => this.generateConcept());
        document.getElementById('content-btn').addEventListener('click', () => this.generateOutline());
        document.getElementById('chapters-btn').addEventListener('click', () => this.generateChapters());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetProject());

        // Export buttons
        document.getElementById('export-txt-btn').addEventListener('click', () => this.exportBook('txt'));
        document.getElementById('export-html-btn').addEventListener('click', () => this.exportBook('html'));
        document.getElementById('export-md-btn').addEventListener('click', () => this.exportBook('md'));
        document.getElementById('export-json-btn').addEventListener('click', () => this.exportBook('json'));

        // Edit mode buttons
        this.setupEditModeListeners();

        // API key modal
        document.getElementById('save-api-key').addEventListener('click', () => this.saveApiKey());
        
        // Form validation
        this.setupFormValidation();

        // Auto-save on content changes
        this.setupContentChangeListeners();
    }

    setupEditModeListeners() {
        // Concept editing
        uiManager.setupEditMode('concept', 'edit-concept-btn', 'save-concept-btn');
        document.getElementById('concept').addEventListener('contentSaved', (e) => {
            this.currentProject.concept = e.detail.content;
            this.saveProject();
        });

        // TOC editing
        uiManager.setupEditMode('contents', 'edit-toc-btn', 'save-toc-btn');
        document.getElementById('contents').addEventListener('contentSaved', (e) => {
            this.currentProject.tableOfContents = e.detail.content;
            this.saveProject();
        });
    }

    setupFormValidation() {
        const inputs = document.querySelectorAll('#book-form input, #book-form select, #book-form textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => uiManager.validateForm());
            input.addEventListener('change', () => uiManager.validateForm());
        });
    }

    setupContentChangeListeners() {
        // Listen for settings changes
        document.getElementById('auto-gen').addEventListener('change', (e) => {
            this.currentProject.settings.autoGenerate = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('detailed-chapters').addEventListener('change', (e) => {
            this.currentProject.settings.detailedChapters = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('include-images').addEventListener('change', (e) => {
            this.currentProject.settings.includeImages = e.target.checked;
            this.saveSettings();
        });
    }

    initializeUI() {
        // Initialize tooltips and popovers
        uiManager.initializeTooltips();
        uiManager.initializePopovers();
        
        // Set initial button states
        enableButton('concept-btn');
        
        // Validate form initially
        uiManager.validateForm();
    }

    async checkApiKey() {
        const savedKey = storageManager.getApiKey();
        
        if (savedKey) {
            try {
                apiManager.setApiKey(savedKey);
                await apiManager.testApiKey();
                showAlert('API key loaded successfully', 'success', true, 3000);
            } catch (error) {
                showAlert('Saved API key is invalid. Please enter a new one.', 'warning');
                this.showApiKeyModal();
            }
        } else {
            this.showApiKeyModal();
        }
    }

    showApiKeyModal() {
        const modal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
        modal.show();
    }

    async saveApiKey() {
        const apiKeyInput = document.getElementById('api-key-input');
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showAlert('Please enter a valid API key', 'error');
            return;
        }

        try {
            setLoadingText('Validating API key...');
            showLoading('Validating API key...', 1);
            
            apiManager.setApiKey(apiKey);
            await apiManager.testApiKey();
            
            storageManager.saveApiKey(apiKey);
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyModal'));
            modal.hide();
            
            showAlert('API key saved successfully!', 'success');
            apiKeyInput.value = '';
        } catch (error) {
            showAlert(`API key validation failed: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    loadLastProject() {
        const lastProject = storageManager.getLastProject();
        
        if (lastProject && lastProject.concept) {
            if (confirm('Would you like to load your last project?')) {
                this.currentProject = lastProject;
                this.updateUIFromProject();
                showAlert('Previous project loaded', 'info', true, 3000);
            }
        }
    }

    updateUIFromProject() {
        // Update concept
        if (this.currentProject.concept) {
            showSection('concept-section', this.currentProject.concept);
            enableButton('content-btn');
        }
        
        // Update table of contents
        if (this.currentProject.tableOfContents) {
            showSection('toc-section', this.currentProject.tableOfContents);
            enableButton('chapters-btn');
        }
        
        // Update chapters
        if (this.currentProject.chapters && this.currentProject.chapters.length > 0) {
            this.updateChaptersDisplay();
            showSection('chapters-section');
            showSection('export-section');
        }
    }

    async generateConcept() {
        if (this.generationState.isGenerating) return;
        
        try {
            this.generationState.isGenerating = true;
            setButtonLoading('concept-btn', true);
            showLoading('Generating book concept...', 1);
            
            const params = this.getGenerationParams();
            const concept = await apiManager.generateConcept(params);
            
            this.currentProject.concept = concept;
            this.currentProject.metadata.conceptGeneratedAt = new Date().toISOString();
            
            showSection('concept-section', concept);
            enableButton('content-btn');
            
            this.saveProject();
            showAlert('Book concept generated successfully!', 'success');
            
        } catch (error) {
            showAlert(`Failed to generate concept: ${error.message}`, 'error');
        } finally {
            this.generationState.isGenerating = false;
            setButtonLoading('concept-btn', false);
            hideLoading();
        }
    }

    async generateOutline() {
        if (this.generationState.isGenerating || !this.currentProject.concept) return;
        
        try {
            this.generationState.isGenerating = true;
            setButtonLoading('content-btn', true);
            showLoading('Generating table of contents...', 1);
            
            const params = this.getGenerationParams();
            const outline = await apiManager.generateOutline(this.currentProject.concept, params);
            
            this.currentProject.tableOfContents = outline;
            this.currentProject.metadata.outlineGeneratedAt = new Date().toISOString();
            
            showSection('toc-section', outline);
            enableButton('chapters-btn');
            
            this.saveProject();
            showAlert('Table of contents generated successfully!', 'success');
            
        } catch (error) {
            showAlert(`Failed to generate outline: ${error.message}`, 'error');
        } finally {
            this.generationState.isGenerating = false;
            setButtonLoading('content-btn', false);
            hideLoading();
        }
    }

    async generateChapters() {
        if (this.generationState.isGenerating || !this.currentProject.tableOfContents) return;
        
        try {
            this.generationState.isGenerating = true;
            this.generationState.autoGenerate = document.getElementById('auto-gen').checked;
            
            const chapters = this.parseTableOfContents();
            const totalChapters = chapters.length;
            
            if (totalChapters === 0) {
                throw new Error('No chapters found in table of contents');
            }
            
            setButtonLoading('chapters-btn', true);
            showLoading('Generating chapters...', totalChapters);
            
            // Initialize chapters array if needed
            if (!this.currentProject.chapters) {
                this.currentProject.chapters = [];
            }
            
            const startIndex = this.generationState.chapterIndex;
            
            for (let i = startIndex; i < chapters.length; i++) {
                this.generationState.chapterIndex = i;
                
                setLoadingText(`Generating Chapter ${i + 1}: ${chapters[i]}...`);
                
                const params = this.getGenerationParams();
                const context = this.getChapterContext(i);
                
                const chapterContent = await apiManager.generateChapter(chapters[i], params, context);
                
                const chapterData = {
                    title: chapters[i],
                    content: chapterContent,
                    generatedAt: new Date().toISOString(),
                    wordCount: this.countWords(chapterContent)
                };
                
                // Add or update chapter
                this.currentProject.chapters[i] = chapterData;
                
                // Update UI
                this.updateChaptersDisplay();
                uiManager.incrementProgress();
                
                // Auto-save progress
                this.saveProject();
                
                // Rate limiting delay
                if (i < chapters.length - 1) {
                    await this.sleep(CONFIG.GENERATION.chapterDelay);
                }
                
                // Check if auto-generation is disabled
                if (!this.generationState.autoGenerate && i === startIndex) {
                    break;
                }
            }
            
            // Show sections if not already visible
            showSection('chapters-section');
            showSection('export-section');
            
            const completedChapters = this.generationState.chapterIndex + 1;
            showAlert(`Generated ${completedChapters} chapter${completedChapters > 1 ? 's' : ''} successfully!`, 'success');
            
        } catch (error) {
            showAlert(`Failed to generate chapters: ${error.message}`, 'error');
        } finally {
            this.generationState.isGenerating = false;
            setButtonLoading('chapters-btn', false);
            hideLoading();
        }
    }

    parseTableOfContents() {
        return this.currentProject.tableOfContents
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                // Extract chapter title (remove chapter numbers and descriptions)
                const match = line.match(/^(?:Chapter\s+\d+:?\s*)?(.+?)(?:\s*-\s*.+)?$/i);
                return match ? match[1].trim() : line;
            });
    }

    getChapterContext(chapterIndex) {
        const previousChapters = this.currentProject.chapters
            .slice(0, chapterIndex)
            .map(ch => `${ch.title}: ${ch.content.substring(0, 200)}...`)
            .join('\n\n');
        
        return {
            title: this.extractBookTitle(),
            concept: this.currentProject.concept,
            previousChapters: previousChapters || 'This is the first chapter'
        };
    }

    extractBookTitle() {
        // Try to extract title from concept
        if (!this.currentProject.concept) return 'Untitled Book';
        
        const lines = this.currentProject.concept.split('\n');
        for (const line of lines) {
            const titleMatch = line.match(/(?:Title|Book):\s*(.+)/i);
            if (titleMatch) {
                return titleMatch[1].trim();
            }
        }
        
        return 'AI Generated Book';
    }

    updateChaptersDisplay() {
        const chaptersContainer = document.getElementById('chapters');
        chaptersContainer.innerHTML = '';
        
        if (!this.currentProject.chapters || this.currentProject.chapters.length === 0) {
            return;
        }
        
        this.currentProject.chapters.forEach((chapter, index) => {
            const chapterElement = uiManager.createChapterElement(chapter.title, chapter.content, index);
            chaptersContainer.appendChild(chapterElement);
        });
        
        // Update chapter counter
        uiManager.updateChapterCounter(this.currentProject.chapters.length);
        
        // Setup chapter editing
        this.setupChapterEditing();
    }

    setupChapterEditing() {
        // Edit chapter buttons
        document.querySelectorAll('.edit-chapter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.editChapter(index);
            });
        });
        
        // Save chapter buttons
        document.querySelectorAll('.save-chapter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.saveChapter(index);
            });
        });
        
        // Cancel edit buttons
        document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.cancelEditChapter(index);
            });
        });
        
        // Delete chapter buttons
        document.querySelectorAll('.delete-chapter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.deleteChapter(index);
            });
        });
    }

    editChapter(index) {
        const chapterElement = document.querySelector(`[data-chapter-index="${index}"]`);
        const textDiv = chapterElement.querySelector('.chapter-text');
        const editor = chapterElement.querySelector('.chapter-editor');
        const footer = chapterElement.querySelector('.chapter-footer');
        
        textDiv.classList.add('d-none');
        editor.classList.remove('d-none');
        footer.classList.remove('d-none');
        
        editor.focus();
    }

    saveChapter(index) {
        const chapterElement = document.querySelector(`[data-chapter-index="${index}"]`);
        const textDiv = chapterElement.querySelector('.chapter-text');
        const editor = chapterElement.querySelector('.chapter-editor');
        const footer = chapterElement.querySelector('.chapter-footer');
        
        // Update chapter content
        this.currentProject.chapters[index].content = editor.value;
        this.currentProject.chapters[index].modifiedAt = new Date().toISOString();
        
        // Update display
        textDiv.innerHTML = uiManager.formatChapterContent(editor.value);
        
        // Hide editor
        textDiv.classList.remove('d-none');
        editor.classList.add('d-none');
        footer.classList.add('d-none');
        
        this.saveProject();
        showAlert('Chapter saved successfully', 'success', true, 2000);
    }

    cancelEditChapter(index) {
        const chapterElement = document.querySelector(`[data-chapter-index="${index}"]`);
        const textDiv = chapterElement.querySelector('.chapter-text');
        const editor = chapterElement.querySelector('.chapter-editor');
        const footer = chapterElement.querySelector('.chapter-footer');
        
        // Reset editor content
        editor.value = this.currentProject.chapters[index].content;
        
        // Hide editor
        textDiv.classList.remove('d-none');
        editor.classList.add('d-none');
        footer.classList.add('d-none');
    }

    deleteChapter(index) {
        if (confirm('Are you sure you want to delete this chapter?')) {
            this.currentProject.chapters.splice(index, 1);
            this.updateChaptersDisplay();
            this.saveProject();
            showAlert('Chapter deleted', 'info', true, 2000);
        }
    }

    getGenerationParams() {
        const form = document.getElementById('book-form');
        const formData = new FormData(form);
        
        return {
            role: document.getElementById('gpt-role').value,
            model: document.getElementById('gpt-model').value,
            genre: this.getSelectedGenre(),
            length: this.getSelectedLength(),
            keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()),
            audience: document.getElementById('target-audience').value,
            detailed: document.getElementById('detailed-chapters').checked,
            includeImages: document.getElementById('include-images').checked
        };
    }

    getSelectedGenre() {
        const genreSelect = document.getElementById('genre');
        const customGenre = document.getElementById('custom-genre');
        
        return genreSelect.value === 'custom' ? customGenre.value : genreSelect.value;
    }

    getSelectedLength() {
        const lengthSelect = document.getElementById('book-length');
        const customLength = document.getElementById('custom-length');
        
        if (lengthSelect.value === 'custom') {
            return `${customLength.value} words`;
        }
        
        const lengthMap = {
            'short': '5,000-10,000 words',
            'medium': '15,000-25,000 words',
            'long': '50,000+ words'
        };
        
        return lengthMap[lengthSelect.value] || 'medium length';
    }

    exportBook(format) {
        exportManager.setBookData({
            title: this.extractBookTitle(),
            concept: this.currentProject.concept,
            tableOfContents: this.currentProject.tableOfContents,
            chapters: this.currentProject.chapters,
            metadata: {
                ...this.currentProject.metadata,
                statistics: exportManager.getBookStatistics()
            }
        });
        
        switch (format) {
            case 'txt':
                exportManager.exportAsText();
                break;
            case 'html':
                exportManager.exportAsHtml();
                break;
            case 'md':
                exportManager.exportAsMarkdown();
                break;
            case 'json':
                exportManager.exportAsJson();
                break;
            default:
                showAlert('Unknown export format', 'error');
        }
    }

    resetProject() {
        if (confirm('Are you sure you want to reset the entire project? This will clear all generated content.')) {
            this.currentProject = {
                concept: '',
                tableOfContents: '',
                chapters: [],
                settings: storageManager.getSettings(),
                metadata: {}
            };
            
            this.generationState = {
                isGenerating: false,
                currentStep: '',
                chapterIndex: 0,
                autoGenerate: false
            };
            
            // Clear UI
            document.getElementById('book-form').reset();
            document.querySelectorAll('.card.shadow-sm').forEach(card => {
                if (!card.querySelector('#book-form')) {
                    card.classList.add('d-none');
                }
            });
            
            // Reset button states
            enableButton('concept-btn');
            uiManager.disableButton('content-btn');
            uiManager.disableButton('chapters-btn');
            
            this.loadSettings();
            showAlert('Project reset successfully', 'info', true, 3000);
        }
    }

    saveProject() {
        if (this.currentProject.concept || this.currentProject.tableOfContents || this.currentProject.chapters.length > 0) {
            storageManager.saveProject(this.currentProject);
        }
    }

    saveSettings() {
        storageManager.saveSettings(this.currentProject.settings);
    }

    setupAutoSave() {
        setInterval(() => {
            if (this.currentProject.settings.autoSave) {
                this.saveProject();
            }
        }, CONFIG.UI.autoSaveInterval);
    }

    countWords(text) {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bookGenerator = new BookGenerator();
});