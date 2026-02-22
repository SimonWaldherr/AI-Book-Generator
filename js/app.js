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
            metadata: { title: '', subtitle: '', shortDescription: '', authorName: '', suggestions: [] }
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
        this.loadSettings();
        this.setupEventListeners();
        this.initializeUI();
        this.setupKeyboardShortcuts();
        this.setupThemeToggle();
        await this.checkApiKey();
        this.loadLastProject();
        this.setupAutoSave();
        this.updateStatsDashboard();
        console.log('AI Book Generator initialized');
    }

    loadSettings() {
        const settings = storageManager.getSettings();
        this.currentProject.settings = settings;
        
        const modelSelect = document.getElementById('gpt-model');
        if (modelSelect) {
            modelSelect.value = settings.defaultModel && [...modelSelect.options].some(o => o.value === settings.defaultModel)
                ? settings.defaultModel
                : modelSelect.options[0].value;
        }
        document.getElementById('auto-gen').checked = settings.autoGenerate;
        document.getElementById('detailed-chapters').checked = settings.detailedChapters;
        document.getElementById('include-images').checked = settings.includeImages;
    }

    setupEventListeners() {
        document.getElementById('book-form').addEventListener('submit', (e) => e.preventDefault());

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
        document.getElementById('export-pdf-btn').addEventListener('click', () => this.exportBook('pdf'));

        // Cover image
        document.getElementById('generate-cover-btn').addEventListener('click', () => this.generateCoverImage());
        document.getElementById('download-cover-btn').addEventListener('click', () => this.downloadCoverImage());
        document.getElementById('use-cover-in-pdf-btn').addEventListener('click', () => this.toggleCoverInPdf(true));

    // Title suggestions
    document.getElementById('generate-titles-btn').addEventListener('click', () => this.generateTitleSuggestions());
    document.getElementById('apply-title-selection-btn').addEventListener('click', () => this.applySelectedSuggestion());

        // Edit mode
        this.setupEditModeListeners();

        // API key modal
        document.getElementById('save-api-key').addEventListener('click', () => this.saveApiKey());
        
        // Form validation
        this.setupFormValidation();

        // Auto-save on content changes
        this.setupContentChangeListeners();
    }

    setupEditModeListeners() {
        uiManager.setupEditMode('concept', 'edit-concept-btn', 'save-concept-btn');
        document.getElementById('concept').addEventListener('contentSaved', (e) => {
            this.currentProject.concept = e.detail.content;
            this.saveProject();
            this.updateCoverPromptDefault();
        });

        uiManager.setupEditMode('contents', 'edit-toc-btn', 'save-toc-btn');
        document.getElementById('contents').addEventListener('contentSaved', (e) => {
            this.currentProject.tableOfContents = e.detail.content;
            this.saveProject();
        });

        // ToC JSON editor handlers
        const editJsonBtn = document.getElementById('edit-toc-json-btn');
        const saveJsonBtn = document.getElementById('save-toc-json-btn');
        const cancelJsonBtn = document.getElementById('cancel-toc-json-btn');
        const jsonEditor = document.getElementById('contents-json-editor');
        const ta = document.getElementById('contents-json');
        editJsonBtn?.addEventListener('click', () => {
            if (jsonEditor) jsonEditor.classList.remove('d-none');
            if (saveJsonBtn) saveJsonBtn.classList.remove('d-none');
            if (cancelJsonBtn) cancelJsonBtn.classList.remove('d-none');
            document.getElementById('contents')?.classList.add('d-none');
            ta.value = JSON.stringify(this.currentProject.metadata?.tocJson || this.parseTocToJson(this.currentProject.tableOfContents) || {}, null, 2);
        });
        saveJsonBtn?.addEventListener('click', () => {
            try {
                const obj = JSON.parse(ta.value);
                this.currentProject.metadata.tocJson = obj;
                // Also update readable contents textarea
                const contentsText = this.stringifyTocJson(obj);
                const contentsEl = document.getElementById('contents');
                if (contentsEl) contentsEl.value = contentsText;
                // Dispatch contentSaved for legacy listeners
                contentsEl?.dispatchEvent(new CustomEvent('contentSaved', { detail: { content: contentsText } }));
                this.currentProject.tableOfContents = contentsText;
                this.saveProject();
                showAlert('Outline JSON saved.', 'success', true, 2000);
            } catch (e) {
                showAlert('Invalid JSON in outline. Fix and try again.', 'error');
                return;
            } finally {
                if (jsonEditor) jsonEditor.classList.add('d-none');
                if (saveJsonBtn) saveJsonBtn.classList.add('d-none');
                if (cancelJsonBtn) cancelJsonBtn.classList.add('d-none');
                document.getElementById('contents')?.classList.remove('d-none');
            }
        });
        cancelJsonBtn?.addEventListener('click', () => {
            if (jsonEditor) jsonEditor.classList.add('d-none');
            if (saveJsonBtn) saveJsonBtn.classList.add('d-none');
            if (cancelJsonBtn) cancelJsonBtn.classList.add('d-none');
            document.getElementById('contents')?.classList.remove('d-none');
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

        const authorNameInput = document.getElementById('author-name');
        const titleInput = document.getElementById('book-title');
        const subtitleInput = document.getElementById('book-subtitle');
        const descInput = document.getElementById('short-description');
        if (authorNameInput) {
            authorNameInput.addEventListener('input', (e) => {
                this.currentProject.metadata.authorName = e.target.value;
                this.saveProject();
            });
        }
        titleInput.addEventListener('input', (e) => {
            this.currentProject.metadata.title = e.target.value;
            this.saveProject();
        });
        subtitleInput.addEventListener('input', (e) => {
            this.currentProject.metadata.subtitle = e.target.value;
            this.saveProject();
        });
        descInput.addEventListener('input', (e) => {
            this.currentProject.metadata.shortDescription = e.target.value;
            this.saveProject();
        });
    }

    initializeUI() {
        uiManager.initializeTooltips();
        uiManager.initializePopovers();
        enableButton('concept-btn');
        uiManager.validateForm();
    }

    async checkApiKey() {
        // Prefer saved key; fall back to optional development key on window
        let savedKey = storageManager.getApiKey();
        if (!savedKey && typeof window !== 'undefined' && window.apiKey) {
            savedKey = window.apiKey;
            storageManager.saveApiKey(savedKey);
        }
        if (savedKey) {
            try {
                apiManager.setApiKey(savedKey);
                await apiManager.testApiKey();
                showAlert('API key loaded successfully', 'success', true, 3000);
                // Show images section once API key is valid
                showSection('images-section');
                this.updateCoverPromptDefault();
            } catch (error) {
                // Do not block entire app; allow user to proceed and re-enter later
                showAlert('Saved API key could not be validated. You can re-enter it via the key modal.', 'warning');
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
            showLoading('Validating API key...', 1);
            apiManager.setApiKey(apiKey);
            await apiManager.testApiKey();
            storageManager.saveApiKey(apiKey);
            const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyModal'));
            modal.hide();
            showAlert('API key saved successfully!', 'success');
            apiKeyInput.value = '';
            showSection('images-section');
            this.updateCoverPromptDefault();
        } catch (error) {
            // Save anyway to localStorage to let the user proceed; API calls will still fail until corrected
            storageManager.saveApiKey(apiKey);
            const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyModal'));
            modal.hide();
            showAlert(`Saved key, but validation failed: ${error.message}. You can try again later.`, 'warning');
        } finally {
            hideLoading();
        }
    }

    loadLastProject() {
        const lastProject = storageManager.getLastProject();
        if (lastProject && lastProject.concept) {
            try {
                if (confirm('Would you like to load your last project?')) {
                    this.currentProject = lastProject;
                    this.updateUIFromProject();
                    showAlert('Previous project loaded', 'info', true, 3000);
                }
            } catch (e) {
                // ignore confirm errors
            }
        }
    }

    updateUIFromProject() {
        if (this.currentProject.concept) {
            showSection('concept-section', this.currentProject.concept);
            enableButton('content-btn');
        }
        if (this.currentProject.tableOfContents) {
            showSection('toc-section', this.currentProject.tableOfContents);
            enableButton('chapters-btn');
        }
        if (this.currentProject.chapters && this.currentProject.chapters.length > 0) {
            this.updateChaptersDisplay();
            showSection('chapters-section');
            showSection('export-section');
        }
        if (this.currentProject.metadata?.coverImage) {
            const img = document.getElementById('cover-image');
            img.src = this.currentProject.metadata.coverImage;
            img.classList.remove('d-none');
            document.getElementById('download-cover-btn').classList.remove('d-none');
            document.getElementById('use-cover-in-pdf-btn').classList.remove('d-none');
            showSection('images-section');
        }
        // Populate author/title/subtitle/description
        const authorEl = document.getElementById('author-name');
        if (authorEl) authorEl.value = this.currentProject.metadata?.authorName || '';
        document.getElementById('book-title').value = this.currentProject.metadata?.title || '';
        document.getElementById('book-subtitle').value = this.currentProject.metadata?.subtitle || '';
        document.getElementById('short-description').value = this.currentProject.metadata?.shortDescription || '';
        this.refreshStatsBadge();
    }

    async generateConcept() {
        if (this.generationState.isGenerating) return;
        try {
            this.generationState.isGenerating = true;
            setButtonLoading('concept-btn', true);
            showLoading('Generating book concept...', 1);
            // Ensure we have a title and description; if not, generate suggestions and apply the first
            await this.ensureTitleAndDescription();
            const params = this.getGenerationParams();
            // Include title/subtitle into params for prompt
            params.title = (this.currentProject.metadata?.title || document.getElementById('book-title').value || '').trim();
            params.subtitle = (this.currentProject.metadata?.subtitle || document.getElementById('book-subtitle').value || '').trim();
            // Request JSON concept when available
            const wantsJson = CONFIG.GENERATION.useJsonConceptWhenAvailable;
            const conceptRaw = await apiManager.generateConcept({ ...params, jsonMode: wantsJson });
            let concept = conceptRaw;
            let conceptObj = null;
            if (wantsJson) {
                try {
                    conceptObj = JSON.parse(conceptRaw);
                } catch {}
                if (!conceptObj) {
                    // Try to extract JSON object from text
                    const match = String(conceptRaw).match(/\{[\s\S]*\}/);
                    if (match) {
                        try { conceptObj = JSON.parse(match[0]); } catch {}
                    }
                }
                if (conceptObj) {
                    concept = this.stringifyConcept(conceptObj);
                    this.currentProject.metadata.conceptJson = conceptObj;
                }
            }
            this.currentProject.concept = concept;
            this.currentProject.metadata.conceptGeneratedAt = new Date().toISOString();
            showSection('concept-section', concept);
            this.renderConceptStructured(conceptObj || null);
            enableButton('content-btn');
            this.saveProject();
            this.updateCoverPromptDefault();
            this.updateStatsDashboard();
            showAlert('Book concept generated successfully!', 'success');
        } catch (error) {
            showAlert(`Failed to generate concept: ${error.message}`, 'error');
            this.showRetryButton('concept-btn', () => this.generateConcept());
        } finally {
            this.generationState.isGenerating = false;
            setButtonLoading('concept-btn', false);
            hideLoading();
        }
    }

    stringifyConcept(obj) {
        // Simple readable text representation for the legacy textarea and exports
        let out = `Title: ${obj.title || 'Untitled'}`;
        if (obj.subtitle) out += `\nSubtitle: ${obj.subtitle}`;
        out += `\nGenre: ${obj.genre || ''}`;
        out += `\nAudience: ${obj.audience || ''}`;
        if (obj.persona) out += `\nPersona: ${obj.persona}`;
        if (Array.isArray(obj.keywords)) out += `\nKeywords: ${obj.keywords.join(', ')}`;
        if (obj.logline) out += `\n\nLogline:\n${obj.logline}`;
        if (obj.premise) out += `\n\nPremise:\n${obj.premise}`;
        if (Array.isArray(obj.themes) && obj.themes.length) out += `\n\nThemes:\n- ${obj.themes.join('\n- ')}`;
        if (Array.isArray(obj.usps) && obj.usps.length) out += `\n\nUnique Selling Points:\n- ${obj.usps.join('\n- ')}`;
        if (Array.isArray(obj.hooks) && obj.hooks.length) out += `\n\nReader Hooks:\n- ${obj.hooks.join('\n- ')}`;
        return out;
    }

    renderConceptStructured(obj) {
        const section = document.getElementById('concept-section');
        if (!section) return;
        const has = !!obj;
        const view = document.getElementById('concept-structured');
        const editor = document.getElementById('concept-json-editor');
        const editBtn = document.getElementById('edit-concept-json-btn');
        const saveBtn = document.getElementById('save-concept-json-btn');
        const cancelBtn = document.getElementById('cancel-concept-json-btn');
        if (!view || !editBtn) return;
        // Populate view
        if (has) {
            document.getElementById('concept-title').textContent = obj.title || 'Untitled Book';
            document.getElementById('concept-subtitle').textContent = obj.subtitle || '';
            document.getElementById('concept-audience').textContent = obj.audience || 'General Audience';
            document.getElementById('concept-tone').textContent = obj.persona || 'Tone/Style';
            document.getElementById('concept-logline').textContent = obj.logline || '';
            document.getElementById('concept-premise').innerHTML = (obj.premise || '').split('\n\n').map(p => `<p>${this.escapeHtml(p)}</p>`).join('');
            const toList = (arr, id) => {
                const ul = document.getElementById(id);
                ul.innerHTML = '';
                (arr || []).forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item;
                    ul.appendChild(li);
                });
            };
            toList(obj.themes, 'concept-themes');
            toList(obj.usps, 'concept-usps');
            toList(obj.hooks, 'concept-hooks');
        }
        // Editor handlers
        editBtn.onclick = () => {
            if (editor) editor.classList.remove('d-none');
            if (saveBtn) saveBtn.classList.remove('d-none');
            if (cancelBtn) cancelBtn.classList.remove('d-none');
            if (view) view.classList.add('d-none');
            const ta = document.getElementById('concept-json');
            ta.value = JSON.stringify(this.currentProject.metadata?.conceptJson || obj || {}, null, 2);
        };
        saveBtn.onclick = () => {
            try {
                const ta = document.getElementById('concept-json');
                const newObj = JSON.parse(ta.value);
                this.currentProject.metadata.conceptJson = newObj;
                this.currentProject.concept = this.stringifyConcept(newObj);
                this.saveProject();
                const legacyConceptEl = document.getElementById('concept');
                if (legacyConceptEl) {
                    legacyConceptEl.value = this.currentProject.concept;
                    // Dispatch legacy event so older listeners pick up the change
                    legacyConceptEl.dispatchEvent(new CustomEvent('contentSaved', { detail: { content: legacyConceptEl.value } }));
                }
                this.renderConceptStructured(newObj);
                showAlert('Concept JSON saved.', 'success', true, 2000);
            } catch (e) {
                showAlert('Invalid JSON. Please fix and try again.', 'error');
                return;
            } finally {
                if (editor) editor.classList.add('d-none');
                if (saveBtn) saveBtn.classList.add('d-none');
                if (cancelBtn) cancelBtn.classList.add('d-none');
                if (view) view.classList.remove('d-none');
            }
        };
        cancelBtn.onclick = () => {
            if (editor) editor.classList.add('d-none');
            if (saveBtn) saveBtn.classList.add('d-none');
            if (cancelBtn) cancelBtn.classList.add('d-none');
            if (view) view.classList.remove('d-none');
        };
    }

    async ensureTitleAndDescription() {
        const title = (document.getElementById('book-title').value || '').trim();
        const desc = (document.getElementById('short-description').value || '').trim();
        if (title && desc) return; // nothing to do
        try {
            let description = desc;
            if (!description) {
                const concept = (this.currentProject.concept || '').trim();
                const kw = (document.getElementById('keywords').value || '').split(',').map(s => s.trim()).filter(Boolean);
                if (concept) description = concept.substring(0, 280);
                else if (kw.length) description = `A ${this.getSelectedGenre()} book focusing on ${kw.slice(0,5).join(', ')} for ${document.getElementById('target-audience').value} readers.`;
                else description = 'A compelling, marketable book concept.';
            }
            const params = this.getGenerationParams();
            const args = { description, genre: params.genre, audience: params.audience, keywords: params.keywords, count: 6, model: params.model, authorName: params.authorName };
            setLoadingText('Generating title and description suggestions...');
            const options = await apiManager.generateTitleSuggestions(args);
            if (Array.isArray(options) && options.length) {
                this.currentProject.metadata.suggestions = options;
                this.renderTitleSuggestions(options);
                document.getElementById('title-suggestions-section').classList.remove('d-none');
                // Apply the first suggestion by default to proceed
                this.applySuggestionObject(options[0]);
                this.saveProject();
            }
        } catch (e) {
            // Non-fatal: continue without
        }
    }

    async generateOutline() {
        if (this.generationState.isGenerating || !this.currentProject.concept) return;
        try {
            this.generationState.isGenerating = true;
            setButtonLoading('content-btn', true);
            showLoading('Generating table of contents...', 1);
            const params = { ...this.getGenerationParams() };
            const outlineRaw = await apiManager.generateOutline(this.currentProject.concept, params);
            let outlineText = outlineRaw;
            try {
                const json = JSON.parse(outlineRaw);
                this.currentProject.metadata.outlineJson = json;
                this.currentProject.metadata.tocJson = json;
                if (json && Array.isArray(json.chapters)) {
                    outlineText = json.chapters
                        .map(ch => `Chapter ${ch.number ?? ''}: ${ch.title} - ${ch.description}`.replace('Chapter :', 'Chapter'))
                        .join('\n');
                }
            } catch { /* keep outlineRaw */ }
            this.currentProject.tableOfContents = outlineText;
            this.currentProject.metadata.outlineGeneratedAt = new Date().toISOString();
            showSection('toc-section', outlineText);
            enableButton('chapters-btn');
            this.saveProject();
            this.updateStatsDashboard();
            showAlert('Table of contents generated successfully!', 'success');
        } catch (error) {
            showAlert(`Failed to generate outline: ${error.message}`, 'error');
            this.showRetryButton('content-btn', () => this.generateOutline());
        } finally {
            this.generationState.isGenerating = false;
            setButtonLoading('content-btn', false);
            hideLoading();
        }
    }

    showRetryButton(buttonId, retryCallback) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-redo me-2"></i>Retry';
        btn.classList.add('btn-warning');
        const retryHandler = () => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('btn-warning');
            btn.removeEventListener('click', retryHandler);
            retryCallback();
        };
        btn.addEventListener('click', retryHandler);
    }

    async generateChapters() {
        if (this.generationState.isGenerating || !this.currentProject.tableOfContents) return;
        try {
            this.generationState.isGenerating = true;
            this.generationState.autoGenerate = document.getElementById('auto-gen').checked;
            
            const chapters = this.parseTableOfContents();
            const totalChapters = chapters.length;
            if (totalChapters === 0) throw new Error('No chapters found in table of contents');
            
            setButtonLoading('chapters-btn', true);
            showLoading('Generating chapters...', totalChapters);
            
            if (!this.currentProject.chapters) this.currentProject.chapters = [];
            const startIndex = this.generationState.chapterIndex;

            for (let i = startIndex; i < chapters.length; i++) {
                this.generationState.chapterIndex = i;
                setLoadingText(`Generating Chapter ${i + 1}: ${chapters[i]}...`);
                const params = this.getGenerationParams();
                const context = this.getChapterContext(i);

                if (!this.currentProject.chapters[i]) {
                    this.currentProject.chapters[i] = { title: chapters[i], content: '', generatedAt: new Date().toISOString(), wordCount: 0 };
                }
                this.updateChaptersDisplay();

                const chapterElement = document.querySelector(`[data-chapter-index="${i}"]`);
                const textDiv = chapterElement?.querySelector('.chapter-text');
                let buffer = '';
                const onToken = (delta, full, done) => {
                    buffer = full;
                    this.currentProject.chapters[i].content = buffer;
                    if (textDiv) textDiv.innerHTML = uiManager.formatChapterContent(buffer);
                    if (done) this.currentProject.chapters[i].wordCount = this.countWords(buffer);
                };

                const chapterContent = await apiManager.generateChapter(chapters[i], { ...params, onToken }, context);
                this.currentProject.chapters[i] = {
                    ...this.currentProject.chapters[i],
                    content: chapterContent,
                    generatedAt: new Date().toISOString(),
                    wordCount: this.countWords(chapterContent)
                };

                this.updateChaptersDisplay();
                uiManager.incrementProgress();
                this.saveProject();
                if (i < chapters.length - 1) await this.sleep(CONFIG.GENERATION.chapterDelay);
                if (!this.generationState.autoGenerate && i === startIndex) break;
            }
            
            showSection('chapters-section');
            showSection('export-section');
            const completedChapters = this.generationState.chapterIndex + 1;
            this.refreshStatsBadge();
            this.updateStatsDashboard();
            showAlert(`Generated ${completedChapters} chapter${completedChapters > 1 ? 's' : ''} successfully!`, 'success');
        } catch (error) {
            showAlert(`Failed to generate chapters: ${error.message}`, 'error');
            this.showRetryButton('chapters-btn', () => this.generateChapters());
        } finally {
            this.generationState.isGenerating = false;
            setButtonLoading('chapters-btn', false);
            hideLoading();
        }
    }

    parseTableOfContents() {
        if (this.currentProject?.metadata?.outlineJson?.chapters) {
            return this.currentProject.metadata.outlineJson.chapters
                .map(ch => (typeof ch.title === 'string' ? ch.title.trim() : ''))
                .filter(Boolean);
        }
        return this.currentProject.tableOfContents
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                const match = line.match(/^(?:Chapter\s+\d+:?\s*)?(.+?)(?:\s*-\s*.+)?$/i);
                return match ? match[1].trim() : line;
            });
    }

    // Convert a simple contents text into a JSON outline (best-effort)
    parseTocToJson(text) {
        if (!text) return { chapters: [] };
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const chapters = lines.map((line, idx) => {
            const m = line.match(/^(?:Chapter\s+\d+:?\s*)?(.+?)(?:\s*-\s*(.+))?$/i);
            return { number: idx + 1, title: m ? m[1].trim() : line, description: m && m[2] ? m[2].trim() : '' };
        });
        return { title: this.extractBookTitle(), chapters };
    }

    stringifyTocJson(obj) {
        if (!obj || !Array.isArray(obj.chapters)) return '';
        return obj.chapters.map(ch => `Chapter ${ch.number || ''}: ${ch.title}${ch.description ? ' - ' + ch.description : ''}`.trim()).join('\n');
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
        // Prefer explicit title from metadata
        const explicit = this.currentProject.metadata?.title;
        if (explicit && explicit.trim()) return explicit.trim();
        if (!this.currentProject.concept) return 'Untitled Book';
        const lines = this.currentProject.concept.split('\n');
        for (const line of lines) {
            const titleMatch = line.match(/(?:Title|Book):\s*(.+)/i);
            if (titleMatch) return titleMatch[1].trim();
        }
        return 'AI Generated Book';
    }

    updateChaptersDisplay() {
        const chaptersContainer = document.getElementById('chapters');
        chaptersContainer.innerHTML = '';
        if (!this.currentProject.chapters || this.currentProject.chapters.length === 0) return;
        this.currentProject.chapters.forEach((chapter, index) => {
            const chapterElement = uiManager.createChapterElement(chapter.title, chapter.content, index);
            chaptersContainer.appendChild(chapterElement);
        });
        uiManager.updateChapterCounter(this.currentProject.chapters.length);
        this.setupChapterEditing();
    }

    saveChapter(index) {
        const chapterElement = document.querySelector(`[data-chapter-index="${index}"]`);
        const textDiv = chapterElement.querySelector('.chapter-text');
        const editor = chapterElement.querySelector('.chapter-editor');
        const footer = chapterElement.querySelector('.chapter-footer');
        this.currentProject.chapters[index].content = editor.value;
        this.currentProject.chapters[index].modifiedAt = new Date().toISOString();
        textDiv.innerHTML = uiManager.formatChapterContent(editor.value);
        textDiv.classList.remove('d-none');
        editor.classList.add('d-none');
        footer.classList.add('d-none');
        this.saveProject();
        showAlert('Chapter saved successfully', 'success', true, 2000);
        this.refreshStatsBadge();
    }

    cancelEditChapter(index) {
        const chapterElement = document.querySelector(`[data-chapter-index="${index}"]`);
        const textDiv = chapterElement.querySelector('.chapter-text');
        const editor = chapterElement.querySelector('.chapter-editor');
        const footer = chapterElement.querySelector('.chapter-footer');
        editor.value = this.currentProject.chapters[index].content;
        textDiv.classList.remove('d-none');
        editor.classList.add('d-none');
        footer.classList.add('d-none');
    }

    deleteChapter(index) {
        if (confirm('Are you sure you want to delete this chapter?')) {
            this.currentProject.chapters.splice(index, 1);
            this.updateChaptersDisplay();
            this.saveProject();
            this.refreshStatsBadge();
            showAlert('Chapter deleted', 'info', true, 2000);
        }
    }

    // Wire up chapter editing buttons (edit, save, cancel, delete) using event delegation
    setupChapterEditing() {
        const container = document.getElementById('chapters');
        if (!container) return;
        // prevent attaching multiple listeners
        if (container.dataset.chapterListenerAttached) return;

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const idxAttr = btn.dataset.index;
            const index = typeof idxAttr !== 'undefined' ? parseInt(idxAttr, 10) : null;

            if (btn.classList.contains('edit-chapter-btn')) {
                // Show editor for this chapter
                const chapterEl = btn.closest('.chapter-item');
                if (!chapterEl) return;
                const textDiv = chapterEl.querySelector('.chapter-text');
                const editor = chapterEl.querySelector('.chapter-editor');
                const footer = chapterEl.querySelector('.chapter-footer');
                if (textDiv && editor && footer) {
                    editor.value = this.currentProject.chapters[index]?.content || editor.value;
                    textDiv.classList.add('d-none');
                    editor.classList.remove('d-none');
                    footer.classList.remove('d-none');
                    editor.focus();
                }
                return;
            }

            if (btn.classList.contains('delete-chapter-btn')) {
                if (index !== null) this.deleteChapter(index);
                return;
            }

            if (btn.classList.contains('save-chapter-btn')) {
                if (index !== null) this.saveChapter(index);
                return;
            }

            if (btn.classList.contains('cancel-edit-btn')) {
                if (index !== null) this.cancelEditChapter(index);
                return;
            }
        });

        container.dataset.chapterListenerAttached = '1';
    }

    getGenerationParams() {
        const form = document.getElementById('book-form');
        // eslint-disable-next-line no-unused-vars
        const formData = new FormData(form);
        const rawGenre = this.getSelectedGenre();
        const genre = rawGenre && rawGenre.trim() ? rawGenre : 'General';
        let keywords = document.getElementById('keywords').value.split(',').map(k => k.trim()).filter(Boolean);
        if (keywords.length === 0) {
            const desc = (this.currentProject.metadata?.shortDescription || '').toLowerCase();
            const words = desc.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 3 && !['with','this','that','from','into','about','your','their','them','have','will','each','which','these','those','over','under','after','before','between','among','such','most','more','than','then','when','where','what','into','onto','also','into','for','and','the','are','you','our','your','they','them','this','that','book','story','guide'].includes(w));
            const unique = Array.from(new Set(words));
            keywords = unique.slice(0, 5);
        }
        return {
            role: document.getElementById('gpt-role').value,
            model: document.getElementById('gpt-model').value,
            genre,
            length: this.getSelectedLength(),
            keywords,
            audience: document.getElementById('target-audience').value,
            language: document.getElementById('language') ? document.getElementById('language').value : 'en',
            authorName: (this.currentProject.metadata?.authorName || '').trim(),
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
            coverImage: this.currentProject.metadata?.coverImage,
            metadata: {
                ...this.currentProject.metadata,
                statistics: exportManager.getBookStatistics()
            }
        });
        switch (format) {
            case 'txt': return exportManager.exportAsText();
            case 'html': return exportManager.exportAsHtml();
            case 'md': return exportManager.exportAsMarkdown();
            case 'json': return exportManager.exportAsJson();
            case 'pdf': return exportManager.exportAsPdf();
            default: showAlert('Unknown export format', 'error');
        }
    }

    resetProject() {
        if (confirm('Are you sure you want to reset the entire project? This will clear all generated content.')) {
            this.currentProject = {
                concept: '',
                tableOfContents: '',
                chapters: [],
                settings: storageManager.getSettings(),
                metadata: { title: '', subtitle: '', shortDescription: '', authorName: '', suggestions: [] }
            };
            this.generationState = { isGenerating: false, currentStep: '', chapterIndex: 0, autoGenerate: false };
            // Reset the HTML form fields (inputs/selects/textareas) but do not hide entire cards
            document.getElementById('book-form').reset();
            const inputs = document.querySelectorAll('#book-form input, #book-form select, #book-form textarea');
            inputs.forEach(i => {
                try {
                    if (i.type === 'checkbox' || i.type === 'radio') i.checked = false;
                    else i.value = '';
                } catch (e) { /* ignore readonly or special inputs */ }
            });

            // Hide dynamic sections and clear content areas
            ['title-suggestions-section','chapters-section','images-section','concept-json-editor','contents-json-editor','live-writer'].forEach(id => {
                document.getElementById(id)?.classList.add('d-none');
            });
            // Clear suggestions list and chapters container
            const sugContainer = document.getElementById('title-suggestions'); if (sugContainer) sugContainer.innerHTML = '';
            const chaptersContainer = document.getElementById('chapters'); if (chaptersContainer) chaptersContainer.innerHTML = '';
            const chapterCounter = document.getElementById('chapter-counter'); if (chapterCounter) chapterCounter.textContent = '0 chapters';

            // Clear cover image display
            const img = document.getElementById('cover-image');
            if (img) { img.src = ''; img.classList.add('d-none'); }
            document.getElementById('download-cover-btn')?.classList.add('d-none');
            document.getElementById('use-cover-in-pdf-btn')?.classList.add('d-none');

            // Reset metadata references
            if (this.currentProject.metadata) {
                this.currentProject.metadata.coverImage = '';
                this.currentProject.metadata.suggestions = [];
                this.currentProject.metadata.title = '';
                this.currentProject.metadata.subtitle = '';
                this.currentProject.metadata.shortDescription = '';
            }

            // Persist cleared project
            this.saveProject();
            enableButton('concept-btn');
            uiManager.disableButton('content-btn');
            uiManager.disableButton('chapters-btn');
            this.loadSettings();
            showAlert('Project reset successfully', 'info', true, 3000);
            this.refreshStatsBadge(true);
        }
    }

    saveProject() {
        if (this.currentProject.concept || this.currentProject.tableOfContents || (this.currentProject.chapters && this.currentProject.chapters.length > 0)) {
            storageManager.saveProject(this.currentProject);
            this.showAutoSaveIndicator();
            this.updateStatsDashboard();
        }
    }

    saveSettings() { 
        storageManager.saveSettings(this.currentProject.settings);
        this.showAutoSaveIndicator();
    }

    showAutoSaveIndicator() {
        const indicator = document.getElementById('auto-save-indicator');
        if (!indicator) return;
        indicator.classList.add('show');
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S: Save project
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveProject();
                showAlert('Project saved', 'success', true, 1500);
            }
            // Ctrl/Cmd + G: Generate concept
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                const conceptBtn = document.getElementById('concept-btn');
                if (!conceptBtn.disabled) this.generateConcept();
            }
            // Ctrl/Cmd + O: Generate outline
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                const outlineBtn = document.getElementById('content-btn');
                if (!outlineBtn.disabled) this.generateOutline();
            }
            // Ctrl/Cmd + H: Show keyboard shortcuts help
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                e.preventDefault();
                this.showKeyboardShortcutsHelp();
            }
        });
    }

    showKeyboardShortcutsHelp() {
        const shortcuts = `
            <h5>Keyboard Shortcuts</h5>
            <ul class="list-unstyled">
                <li><kbd>Ctrl/Cmd + S</kbd> - Save project</li>
                <li><kbd>Ctrl/Cmd + G</kbd> - Generate concept</li>
                <li><kbd>Ctrl/Cmd + O</kbd> - Generate outline</li>
                <li><kbd>Ctrl/Cmd + H</kbd> - Show this help</li>
            </ul>
        `;
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Keyboard Shortcuts</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">${shortcuts}</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    }

    setupThemeToggle() {
        const toggleBtn = document.getElementById('theme-toggle');
        const themeIcon = document.getElementById('theme-icon');
        
        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        themeIcon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

        toggleBtn?.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeIcon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        });
    }

    updateStatsDashboard() {
        const stats = this.getBookStatistics();
        document.getElementById('stat-words').textContent = stats.wordCount.toLocaleString();
        document.getElementById('stat-chapters').textContent = stats.chapterCount;
        document.getElementById('stat-reading').textContent = stats.readingTime;
        
        // Calculate completion percentage
        let completion = 0;
        if (this.currentProject.concept) completion += 25;
        if (this.currentProject.tableOfContents) completion += 25;
        if (this.currentProject.chapters?.length > 0) {
            const expectedChapters = this.parseTableOfContents().length || 10;
            completion += 50 * (this.currentProject.chapters.length / expectedChapters);
        }
        document.getElementById('stat-progress').textContent = Math.round(completion) + '%';
    }

    getBookStatistics() {
        const bookData = {
            title: this.extractBookTitle(),
            chapters: this.currentProject.chapters || []
        };
        const stats = exportManager.getBookStatistics(bookData);
        if (!stats) {
            console.warn('Book statistics unavailable; falling back to zeroed values.');
            return { wordCount: 0, chapterCount: 0, readingTime: '0 min', averageChapterLength: 0 };
        }
        return {
            wordCount: stats.wordCount,
            chapterCount: stats.chapterCount,
            readingTime: stats.readingTime || '0 minutes',
            averageChapterLength: stats.averageChapterLength || 0
        };
    }

    setupAutoSave() {
        setInterval(() => {
            if (this.currentProject.settings.autoSave) {
                this.saveProject();
            }
        }, CONFIG.UI.autoSaveInterval);
    }

    countWords(text) { return String(text || '').split(/\s+/).filter(word => word.length > 0).length; }
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // -------- Images (Cover) --------
    updateCoverPromptDefault() {
        const input = document.getElementById('cover-prompt');
        if (!input) return;
        if (!input.value) {
            const title = this.extractBookTitle();
            const by = (this.currentProject.metadata?.authorName || '').trim();
            const byText = by ? ` by ${by}` : '';
            input.value = `Book cover for "${title}"${byText} — evocative, high-contrast typography, clean layout, ${this.getSelectedGenre()} style`;
        }
    }

    // -------- Title Suggestions --------
    async generateTitleSuggestions() {
        try {
            let description = document.getElementById('short-description').value.trim();
            if (!description) {
                const concept = (this.currentProject.concept || '').trim();
                const kw = (document.getElementById('keywords').value || '').split(',').map(s => s.trim()).filter(Boolean);
                if (concept) {
                    description = concept.substring(0, 280);
                } else if (kw.length) {
                    description = `A ${this.getSelectedGenre()} book focusing on ${kw.slice(0,5).join(', ')} for ${document.getElementById('target-audience').value} readers.`;
                } else {
                    return showAlert('Please enter a short description first.', 'warning');
                }
            }
            const params = this.getGenerationParams();
            const args = {
                description,
                genre: params.genre,
                audience: params.audience,
                keywords: params.keywords,
                count: 6,
                model: params.model,
                authorName: params.authorName
            };
            setButtonLoading('generate-titles-btn', true);
            showLoading('Generating title and description suggestions...', 1);
            const options = await apiManager.generateTitleSuggestions(args);
            this.currentProject.metadata.suggestions = options;
            this.renderTitleSuggestions(options);
            document.getElementById('title-suggestions-section').classList.remove('d-none');
            this.saveProject();
            showAlert('Generated suggestions successfully.', 'success', true, 2500);
        } catch (e) {
            showAlert(`Failed to generate suggestions: ${e.message}`, 'error');
        } finally {
            setButtonLoading('generate-titles-btn', false);
            hideLoading();
        }
    }

    renderTitleSuggestions(options) {
        const container = document.getElementById('title-suggestions');
        container.innerHTML = '';
        options.forEach((opt, idx) => {
            const col = document.createElement('div');
            col.className = 'col-md-6';
            col.innerHTML = `
                <div class="border rounded p-3 h-100">
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="titleSuggestion" id="title-sel-${idx}" value="${idx}">
                        <label class="form-check-label fw-semibold" for="title-sel-${idx}">${this.escapeHtml(opt.title || '')}</label>
                    </div>
                    <div class="text-muted mb-2">${this.escapeHtml(opt.subtitle || '')}</div>
                    <div class="small">${this.escapeHtml(opt.description || '')}</div>
                </div>
            `;
            container.appendChild(col);
        });
    }

    applySelectedSuggestion() {
        const selected = document.querySelector('input[name="titleSuggestion"]:checked');
        if (!selected) return showAlert('Please select one option first.', 'warning');
        const idx = parseInt(selected.value, 10);
        const opt = this.currentProject.metadata?.suggestions?.[idx];
        if (!opt) return;
        this.applySuggestionObject(opt);
        this.saveProject();
        showAlert('Applied selected suggestion (title, description, and related fields).', 'success', true, 2000);
    }

    applySuggestionObject(opt) {
        document.getElementById('book-title').value = opt.title || '';
        document.getElementById('book-subtitle').value = opt.subtitle || '';
        document.getElementById('short-description').value = opt.description || '';
        this.currentProject.metadata.title = opt.title || '';
        this.currentProject.metadata.subtitle = opt.subtitle || '';
        this.currentProject.metadata.shortDescription = opt.description || '';
        // Try to apply additional inferred fields from suggestion
        try {
            // Keywords
            if (opt.keywords) {
                const kwStr = Array.isArray(opt.keywords) ? opt.keywords.join(', ') : String(opt.keywords);
                const kwInput = document.getElementById('keywords');
                if (kwInput && kwStr.trim()) kwInput.value = kwStr;
            }
            // Genre
            if (opt.genre) {
                const genreSelect = document.getElementById('genre');
                const customGenre = document.getElementById('custom-genre');
                const desired = String(opt.genre).trim().toLowerCase();
                let matchedValue = '';
                for (const o of genreSelect.options) {
                    if (String(o.textContent).trim().toLowerCase() === desired) { matchedValue = o.value; break; }
                }
                if (matchedValue) {
                    genreSelect.value = matchedValue;
                    if (customGenre) customGenre.classList.add('d-none');
                } else {
                    genreSelect.value = 'custom';
                    if (customGenre) {
                        customGenre.classList.remove('d-none');
                        customGenre.value = String(opt.genre);
                    }
                }
            }
            // Persona
            if (opt.persona) {
                const roleInput = document.getElementById('gpt-role');
                if (roleInput) roleInput.value = String(opt.persona);
            }
            // Audience
            if (opt.audience) {
                const audSel = document.getElementById('target-audience');
                const a = String(opt.audience).toLowerCase();
                let v = 'general';
                if (a.includes('child')) v = 'children';
                else if (a.includes('young')) v = 'young-adult';
                else if (a.includes('pro')) v = 'professional';
                else if (a.includes('academic') || a.includes('student')) v = 'academic';
                else v = 'general';
                if (audSel) audSel.value = v;
            }
        } catch (e) { /* ignore */ }
        // Also populate cover prompt and enable image UI so the user can generate a cover immediately
        try {
            const coverInput = document.getElementById('cover-prompt');
            const by = (this.currentProject.metadata?.authorName || '').trim();
            const byText = by ? ` by ${by}` : '';
            const coverText = `Book cover for "${opt.title || ''}"${byText}${opt.subtitle ? ' — ' + opt.subtitle : ''} — ${this.getSelectedGenre()}, high-contrast, clean layout`;
            if (coverInput) coverInput.value = coverText;
            // enable include-images checkbox and show images section
            const includeImagesCheckbox = document.getElementById('include-images');
            if (includeImagesCheckbox) includeImagesCheckbox.checked = true;
            document.getElementById('images-section')?.classList.remove('d-none');
        } catch (e) {
            // ignore UI update errors
        }
        // Collapse suggestions panel now that the suggestion has been applied
        try {
            document.getElementById('title-suggestions-section')?.classList.add('d-none');
            // Clear any selected radio
            const sel = document.querySelector('input[name="titleSuggestion"]:checked');
            if (sel) sel.checked = false;
        } catch (e) { /* ignore */ }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }

    async generateCoverImage() {
        try {
            const prompt = document.getElementById('cover-prompt').value.trim();
            const size = document.getElementById('cover-size').value;
            if (!prompt) return showAlert('Enter a cover prompt first.', 'warning');
            showLoading('Generating cover image...', 1);
            const dataUrl = await apiManager.generateImage(prompt, { size });
            const img = document.getElementById('cover-image');
            img.src = dataUrl;
            img.classList.remove('d-none');
            document.getElementById('download-cover-btn').classList.remove('d-none');
            document.getElementById('use-cover-in-pdf-btn').classList.remove('d-none');
            this.currentProject.metadata.coverImage = dataUrl;
            this.saveProject();
            showSection('images-section');
            showAlert('Cover image generated!', 'success', true, 2500);
        } catch (e) {
            showAlert(`Image generation failed: ${e.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    downloadCoverImage() {
        const dataUrl = this.currentProject.metadata?.coverImage;
        if (!dataUrl) return showAlert('No cover image yet.', 'warning');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'cover.png';
        a.click();
    }

    toggleCoverInPdf(enable) {
        if (enable) {
            showAlert('Cover image will be included in PDF exports.', 'info', true, 2000);
        }
        // nothing else needed; export manager reads cover from bookData
    }

    refreshStatsBadge(reset = false) {
        const badge = document.getElementById('stats-badge');
        if (!badge) return;
        if (reset || !this.currentProject?.chapters?.length) {
            badge.textContent = '–';
            badge.title = 'No statistics yet';
            this.updateStatsDashboard();
            return;
        }
        exportManager.setBookData({
            title: this.extractBookTitle(),
            chapters: this.currentProject.chapters
        });
        const stats = exportManager.getBookStatistics();
        if (!stats) return;
        badge.textContent = `${stats.wordCount.toLocaleString()} words • ${stats.readingTime}`;
        badge.title = `Chapters: ${stats.chapterCount} • Avg/Chapter: ${stats.averageChapterLength.toLocaleString()} words`;
        this.updateStatsDashboard();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bookGenerator = new BookGenerator();
});
