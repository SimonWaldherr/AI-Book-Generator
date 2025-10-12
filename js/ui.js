/**
 * UI module for AI Book Generator
 * Handles all user interface interactions and updates
 */

import { CONFIG } from './config.js';

class UIManager {
    constructor() {
        this.progressBar = null;
        this.loadingOverlay = null;
        this.loadingText = null;
        this.currentStep = 0;
        this.totalSteps = 0;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.progressBar = document.getElementById('progress-bar');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = document.getElementById('loading-text');
        this.alertContainer = document.getElementById('alert-container');
        this.liveWriterArea = document.getElementById('live-writer');
    }

    setupEventListeners() {
        // Custom select handlers
        this.setupCustomSelects();
        
        // Form validation
        this.setupFormValidation();
        
        // Modal handlers
        this.setupModalHandlers();
    }

    setupCustomSelects() {
        const bookLengthSelect = document.getElementById('book-length');
        const customLengthInput = document.getElementById('custom-length');
        
        bookLengthSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customLengthInput.classList.remove('d-none');
                customLengthInput.required = true;
            } else {
                customLengthInput.classList.add('d-none');
                customLengthInput.required = false;
            }
        });

        const genreSelect = document.getElementById('genre');
        const customGenreInput = document.getElementById('custom-genre');
        
        genreSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customGenreInput.classList.remove('d-none');
                customGenreInput.required = true;
            } else {
                customGenreInput.classList.add('d-none');
                customGenreInput.required = false;
            }
        });
    }

    setupFormValidation() {
        const form = document.getElementById('book-form');
        form?.addEventListener('input', () => {
            this.validateForm();
        });
    }

    setupModalHandlers() {
        // API key modal auto-focus
        const apiKeyModal = document.getElementById('apiKeyModal');
        const apiKeyInput = document.getElementById('api-key-input');
        
        apiKeyModal?.addEventListener('shown.bs.modal', () => {
            apiKeyInput?.focus();
        });
    }

    validateForm() {
        // Keep the Generate Concept button enabled by default so users can create a concept
        // even if not all optional fields are filled. Other controls may still rely on
        // full form validity elsewhere.
        const form = document.getElementById('book-form');
        if (!form) return;
        // (Optional) we could enable/disable other action buttons here in the future.
    }

    showLoading(text = 'Loading...', steps = 1) {
        this.currentStep = 0;
        this.totalSteps = steps;
        
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
        
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('d-none');
        }
        
        this.updateProgress(0);
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('d-none');
        }
        this.updateProgress(0);
    }

    setLoadingText(text) {
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
    }

    updateProgress(percentage) {
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
            this.progressBar.setAttribute('aria-valuenow', percentage);
        }
    }

    incrementProgress() {
        this.currentStep++;
        const percentage = (this.currentStep / this.totalSteps) * 100;
        this.updateProgress(Math.min(100, percentage));
    }

    // Live writer: show streaming content for the currently generating chapter
    showLiveChapter(chapterIndex, title) {
        if (!this.liveWriterArea) return;
        this.liveWriterArea.innerHTML = `
            <div class="live-writer-header d-flex justify-content-between align-items-center mb-2">
                <strong>Writing Chapter ${chapterIndex + 1}: ${this.escapeHtml(title)}</strong>
                <span class="badge bg-primary">Live</span>
            </div>
            <div id="live-writer-content" class="live-writer-content border rounded p-3" style="min-height:120px; white-space:pre-wrap;">` +
            `</div>`;
    }

    appendLiveChapterText(text) {
        const el = document.getElementById('live-writer-content');
        if (!el) return;
        el.textContent = text;
        // auto-scroll
        el.scrollTop = el.scrollHeight;
    }

    clearLiveChapter() {
        if (!this.liveWriterArea) return;
        this.liveWriterArea.innerHTML = '';
    }

    escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = String(text || '');
        return d.innerHTML;
    }

    showAlert(message, type = 'info', dismissible = true, timeout = 5000) {
        if (!this.alertContainer) return;

        // Map our semantic 'error' -> Bootstrap 'danger'
        const bsType = type === 'error' ? 'danger' : type;

        const alertId = `alert-${Date.now()}`;
        const alertHTML = `
            <div id="${alertId}" class="alert alert-${bsType} ${dismissible ? 'alert-dismissible' : ''} fade show" role="alert">
                <i class="fas fa-${this.getAlertIcon(type)} me-2"></i>
                ${message}
                ${dismissible ? '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' : ''}
            </div>
        `;

        this.alertContainer.insertAdjacentHTML('beforeend', alertHTML);

        // Auto-dismiss after timeout
        if (timeout > 0) {
            setTimeout(() => {
                const alertElement = document.getElementById(alertId);
                if (alertElement) {
                    const bsAlert = new bootstrap.Alert(alertElement);
                    bsAlert.close();
                }
            }, timeout);
        }

        return alertId;
    }

    getAlertIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    clearAlerts() {
        if (this.alertContainer) {
            this.alertContainer.innerHTML = '';
        }
    }

    showSection(sectionId, content = null) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        section.classList.remove('d-none');
        
        // Add smooth animation
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            section.style.transition = `all ${CONFIG.UI.animationDuration}ms ease`;
            section.style.opacity = '1';
            section.style.transform = 'translateY(0)';
        }, 10);

        if (content !== null) {
            this.updateSectionContent(sectionId, content);
        }

        // Scroll to section
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, CONFIG.UI.animationDuration);
    }

    hideSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        section.style.transition = `all ${CONFIG.UI.animationDuration}ms ease`;
        section.style.opacity = '0';
        section.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            section.classList.add('d-none');
            section.style.transform = 'translateY(20px)';
        }, CONFIG.UI.animationDuration || CONFIG.UI.animationDuration);
    }

    updateSectionContent(sectionId, content) {
        const contentMap = {
            'concept-section': 'concept',
            'toc-section': 'contents',
            'chapters-section': 'chapters'
        };

        const elementId = contentMap[sectionId];
        const element = document.getElementById(elementId);
        
        if (element) {
            if (elementId === 'chapters') {
                element.innerHTML = content;
            } else {
                element.value = content;
            }
        }
    }

    enableButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = false;
            button.classList.remove('btn-outline-secondary');
            button.classList.add('btn-outline-primary');
        }
    }

    disableButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = true;
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-outline-secondary');
        }
    }

    setButtonLoading(buttonId, loading = true) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (loading) {
            button.disabled = true;
            const originalText = button.innerHTML;
            button.dataset.originalText = originalText;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
        } else {
            button.disabled = false;
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    updateChapterCounter(count) {
        const counter = document.getElementById('chapter-counter');
        if (counter) {
            counter.textContent = `${count} chapter${count !== 1 ? 's' : ''}`;
        }
    }

    setupEditMode(textareaId, editBtnId, saveBtnId) {
        const textarea = document.getElementById(textareaId);
        const editBtn = document.getElementById(editBtnId);
        const saveBtn = document.getElementById(saveBtnId);

        if (!textarea || !editBtn || !saveBtn) return;

        editBtn.addEventListener('click', () => {
            textarea.readOnly = false;
            textarea.focus();
            editBtn.classList.add('d-none');
            saveBtn.classList.remove('d-none');
        });

        saveBtn.addEventListener('click', () => {
            textarea.readOnly = true;
            editBtn.classList.remove('d-none');
            saveBtn.classList.add('d-none');
            
            textarea.dispatchEvent(new CustomEvent('contentSaved', {
                detail: { content: textarea.value }
            }));
        });
    }

    createChapterElement(title, content, index) {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'chapter-item mb-4 p-3 border rounded';
        chapterDiv.dataset.chapterIndex = index;
        
        chapterDiv.innerHTML = `
            <div class="chapter-header d-flex justify-content-between align-items-center mb-3">
                <h4 class="chapter-title mb-0">${title}</h4>
                <div class="chapter-actions">
                    <button class="btn btn-sm btn-outline-secondary edit-chapter-btn" data-index="${index}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-chapter-btn" data-index="${index}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="chapter-content">
                <div class="chapter-text">${this.formatChapterContent(content || '')}</div>
                <textarea class="form-control chapter-editor d-none" rows="15">${content || ''}</textarea>
            </div>
            <div class="chapter-footer mt-3 d-none">
                <button class="btn btn-sm btn-success save-chapter-btn" data-index="${index}">
                    <i class="fas fa-save me-2"></i>Save
                </button>
                <button class="btn btn-sm btn-secondary cancel-edit-btn" data-index="${index}">
                    <i class="fas fa-times me-2"></i>Cancel
                </button>
            </div>
        `;

        return chapterDiv;
    }

    formatChapterContent(content) {
        return String(content || '')
            .split('\n\n')
            .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
            .join('');
    }

    initializeTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }

    initializePopovers() {
        const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
        popoverTriggerList.map(function (popoverTriggerEl) {
            return new bootstrap.Popover(popoverTriggerEl);
        });
    }
}

export const uiManager = new UIManager();

export const showAlert = (message, type, dismissible, timeout) => 
    uiManager.showAlert(message, type, dismissible, timeout);
export const showLoading = (text, steps) => uiManager.showLoading(text, steps);
export const hideLoading = () => uiManager.hideLoading();
export const setLoadingText = (text) => uiManager.setLoadingText(text);
export const updateProgress = (percentage) => uiManager.updateProgress(percentage);
export const showSection = (sectionId, content) => uiManager.showSection(sectionId, content);
export const enableButton = (buttonId) => uiManager.enableButton(buttonId);
export const setButtonLoading = (buttonId, loading) => uiManager.setButtonLoading(buttonId, loading);
