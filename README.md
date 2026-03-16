# AI Book Generator
Generate complete, publication-ready books with AI — step-by-step or fully automated via Agent Mode.

## Features

- **Multi-LLM Support** — OpenAI GPT (4o, o4-mini, GPT-5), Anthropic Claude (3.5 Sonnet, 3.5 Haiku, Opus, Sonnet 4.5, Opus 4.5), and Google Gemini (1.5 Flash/Pro, 2.0 Flash, 2.5 Pro)
- **Agent Mode** — One-click "Generate Complete Book" button that autonomously generates title suggestions, book concept, chapter outline, and all chapter content in sequence
- **Step-by-Step Workflow** — Manual control with individual steps: concept → outline → chapters
- **Rich Init-Prompting** — Structured, chain-of-thought system prompts that produce higher-quality, more consistent output
- **Live Streaming** — Watch chapters appear word-by-word as they're generated (OpenAI Chat API)
- **Cover Image Generation** — AI-generated cover art via OpenAI Images API
- **Multiple Export Formats** — TXT, HTML, Markdown, JSON, PDF, and clipboard copy
- **Dark/Light Theme** — Auto-detected or manually toggled
- **Auto-Save & Drafts** — Projects are automatically saved to browser local storage
- **Keyboard Shortcuts** — `Ctrl+S` (save), `Ctrl+G` (generate concept), `Ctrl+O` (outline)

## Quick Start

1. **Get API keys** for the providers you want to use:
   - **OpenAI** (required for GPT models & cover images): [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Anthropic** (for Claude models): [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
   - **Google** (for Gemini models): [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

2. **Run locally**:
   ```bash
   python3 -m http.server 8080
   # then open http://localhost:8080
   ```
   Or: `npm start`

3. **Enter your API key(s)** in the Key Settings modal when the app opens.

4. Fill in the book configuration fields, then either:
   - Click **Generate Complete Book** for fully automated agent mode, or
   - Click **Generate Concept → Create Outline → Write Chapters** step by step.

## Supported Models

| Provider | Models |
|---|---|
| OpenAI | GPT-4o mini, GPT-4o, o4-mini, GPT-5 mini, GPT-5, GPT-5 Pro |
| Anthropic | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus/Sonnet/Haiku, Claude Sonnet 4.5, Claude Opus 4.5 |
| Google | Gemini 2.5 Pro, Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash |

## Agent Mode

The **Generate Complete Book** button triggers an autonomous agent that:
1. Generates multiple title and description suggestions, applies the best one
2. Creates a rich book concept (logline, premise, themes, hooks, USPs)
3. Designs a full chapter outline with purpose-driven chapters
4. Writes all chapters sequentially with context-aware prompting
5. Shows a live log panel with per-step status and overall progress

You can cancel the agent at any point.

## Security

- API keys are stored locally in your browser (`localStorage`) using base64 encoding
- Keys are sent **only** to the respective provider's API endpoint (OpenAI, Anthropic, or Google)
- Keys are never sent to any third-party server

## Architecture

```
js/
  config.js   — Provider definitions, model registry, and structured prompts
  api.js      — Multi-provider API client (OpenAI Chat/Responses, Anthropic, Google Gemini)
  app.js      — Main application logic, agent mode orchestration
  ui.js       — DOM management, alerts, progress, live streaming UI
  storage.js  — localStorage persistence for keys, projects, and settings
  export.js   — TXT, HTML, Markdown, JSON, and PDF export
index.html    — UI layout and Bootstrap components
styles.css    — Custom styles and dark mode
```

## Running Locally

```bash
# Python (no dependencies needed)
python3 -m http.server 8080

# Node.js
npm start
# or
npx serve .
```

Then open [http://localhost:8080](http://localhost:8080).

## Contributing

Pull requests and issues are welcome! Areas for improvement include:
- Streaming for Anthropic and Gemini APIs
- Additional export formats (EPUB, DOCX)
- Chapter quality self-review loop using the model as editor
- Project management (multiple simultaneous projects)

