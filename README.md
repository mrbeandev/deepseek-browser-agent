<p align="center">
  <img src="public/icons/icon128.png" width="128" height="128" alt="Deepseek Browser Agent Logo" />
</p>

<h1 align="center">🐋 Deepseek Browser Agent</h1>

<p align="center">
  <strong>An advanced, premium browser side panel extension powered by the Deepseek V4 API.</strong>
</p>

<p align="center">
  <img width="100%" alt="Deepseek Browser Agent Banner" src="https://github.com/user-attachments/assets/9ba9df41-30e6-4837-b2c1-dfb76fba7d4f" />
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/bfcmnoalfofnkgkjkpkjgckodmkijndf">
    <img src="https://img.shields.io/badge/Chrome%20Web%20Store-Active-brightgreen?logo=googlechrome&logoColor=white&style=flat-square" alt="Chrome Web Store Status" />
  </a>
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Licence-MIT-orange?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20Local-emerald?logo=shield&style=flat-square" alt="100% Local Privacy" />
  <img src="https://img.shields.io/badge/Engine-Deepseek%20V4-cyan?style=flat-square" alt="Deepseek V4 Engine" />
</p>

<p align="center">
  Supercharge your daily workflows! Autonomously browse pages, scrape content, switch tabs, fill out inputs, and stream Chain-of-Thought (CoT) reasoning under granular human-in-the-loop safety switches and glassmorphic UI controls.
</p>

---

## 🎬 Live Demo

Watch Deepseek Browser Agent in action! Check out our live demo videos showing various browser automation scenarios (including technical documentation research, Trilium Notes local setup, device details tool permission prompts, and settings drawer customizations):

👉 **[Watch the Live Demo Videos on Google Drive](https://drive.google.com/drive/folders/1PgjFFVeX4oi-YD2UL1c_QVmKMTlaHV6U?usp=sharing)**

---

## 🛍️ Try It Now (Chrome Web Store)

Deepseek Browser Agent has been officially submitted to the Chrome Web Store! Once it has been approved by the Google review team, you will be able to install and try the live extension directly from the store:

👉 **[Install Deepseek Browser Agent on the Chrome Web Store](https://chromewebstore.google.com/detail/bfcmnoalfofnkgkjkpkjgckodmkijndf)**

---

## 🌟 Key Features

### 🧠 1. Fully Agentic Browser Control (Tool Calling)
Deepseek Browser Agent doesn't just read the page—it *controls* the browser! Equipped with autonomous client tools, the agent can:
*   **Scrape Page Text**: Extract the primary readable content from any webpage instantly for summary or analysis.
*   **Extract Page Links**: Gather, group, and map out all hyperlinks on the active document.
*   **Query DOM Structure**: Inspect CSS selectors and document layout structures.
*   **Click & Fill**: Interact directly with web buttons, inputs, and text fields.
*   **Navigate & Switch Tabs**: Dynamically browse to new URLs, search all open tabs, and switch focus between tabs under direct AI command.
*   **Highlight Match Query**: Search and highlight occurrences of specific keywords in the DOM.

### 🎨 2. Premium Glassmorphic Dual Themes
*   **Dark Mode (Default)**: Deep carbon backdrops with neon brand highlights and subtle glassmorphic blurs.
*   **Light Mode**: A beautiful, pristine, high-contrast off-white theme with fully refined alert contrast, soft card borders, and elegant brand color highlights.
*   **Shadcn Tooltips**: Customized Radix UI portals with an **instant 10ms hover delay** for fluid and responsive visual feedback.

### ⏱️ 3. Real-Time Security & Smart Navigation Guardrails
*   **Tab Switch Warning System**: Automatically alerts the user if the browser tab changes mid-session to protect active context.
*   **Smart Auto-Dismissal**: When switching tabs back to the original conversing webpage, the warning popup automatically and silently closes!
*   **Protected System Scopes**: Safely flags restricted browser domains (`chrome://`, `devtools://`, Chrome Web Store) where content script executions are locked.

### 💾 4. Session History & Settings Panel
*   **Auto-Saved Sessions**: Chat logs are preserved under local scopes (`website-specific`, `domain-level`, or `global`).
*   **AI Session Auto-Naming**: Generates creative titles for your conversation logs automatically.
*   **Cost & Usage Balance Tracker**: Directly fetch your Deepseek account balance, token allocation limits, and server statuses.
*   **Reasoning effort toggles**: Stream reasoning chain-of-thought CoT blocks and select from `Low`, `Medium`, and `High` reasoning effort levels.
*   **Detailed Tool Calls toggle**: Control whether detailed, collapsible tool parameters and execution results are displayed. When disabled, it condenses tool call logs into an elegant, professional separating element containing the exact action count (e.g. `--- 10 tool calls ---`), fading beautifully on both sides to keep the conversation clean.

---

## 🛠️ Tech Stack
*   **Core Logic**: React 19, JavaScript (ES6+), Vite 8
*   **Styling**: Tailwind CSS 3, Vanilla CSS Post-Processing (for custom theme portals)
*   **Portals & Icons**: Radix UI Select & Tooltip Portals, Lucide React Icons
*   **Packaging**: Chrome Extensions Manifest V3 Specification

---

## 🚀 Quick Start / Developer Installation

Follow these steps to set up and run the extension locally in developer mode:

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher) and `npm` installed.

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/deepseek-browser-agent.git
cd deepseek-browser-agent
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Development Server
This runs Vite in hot-reloading development mode:
```bash
npm run dev
```

### 5. Build for Production
Compiles and bundles the highly optimized production extension files into the `dist/` directory:
```bash
npm run build
```

---

## 📦 Loading into Google Chrome

To install the built extension in your Google Chrome browser:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** by toggling the switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`dist`** folder inside your project directory (the folder created by running `npm run build`).
5. **Success!** The extension icon will now appear in your browser toolbar. Click it or right-click any page and select **Summarize Page** to launch the sidebar panel!

---

## 🤝 Contributing Guidelines

We love contributions! If you want to help make Deepseek Browser Agent even better, please follow these guidelines:

### How to Contribute
1.  **Fork** the repository and create your feature branch:
    ```bash
    git checkout -b feature/amazing-new-feature
    ```
2.  **Lint your changes** before committing to ensure there are no ESLint syntax or purity errors:
    ```bash
    npm run lint
    ```
3.  **Validate your build** to guarantee compiling is 100% green and compatible:
    ```bash
    npm run build
    ```
4.  **Commit** your changes with clear, concise, and structured commit messages.
5.  **Push** to your branch and open a **Pull Request** explaining your enhancements and visual verification.

### Coding Standards
*   **Purity**: Ensure all helper functions are pure and declared outside of React render contexts to prevent render-phase lints.
*   **Contrast**: When adding UI colors, ensure they adapt perfectly to both `.light` and `.dark` body classes (avoid hardcoded dark values in light mode elements).
*   **Accessibility**: Always wrap functional buttons inside `<Tooltip>` containers with instant delay duration parameters for optimal developer usability.

---

## 🗺️ Custom Skills & Extension Roadmap

We are planning to turn Deepseek Browser Agent into a highly modular, customizable AI copilot. Below is our active roadmap, focusing heavily on equipping the agent with dynamic **Modular Markdown Skills** and browser automation capabilities. We welcome any contributions or pull requests aiming to check off these items!

### 🔌 Modular Skills Engine (Markdown Skills)
*   **[ ] Markdown-Based Skill Files (`.md`)**:
    *   Equip the agent with the capability to read and execute custom modular Skill files written in Markdown (using standard YAML frontmatter defining name, description, and required parameters).
    *   Let developers and users drop new `.md` skill files into a `/skills` directory to dynamically register specialized workflows (e.g., code review, SEO optimization, form auto-filling) that the agent will read and run exactly as documented.
*   **[ ] Dynamic UserScript / Automation Skill**:
    *   Let users write or install custom JavaScript "skills" (similar to Greasemonkey/Tampermonkey scripts) that the agent can execute autonomously on specific domains.
    *   *Example*: An "Auto-Invoice Downloader" skill for Stripe billing portals.
*   **[ ] Model Context Protocol (MCP) Client**:
    *   Integrate an MCP client inside the sidebar to allow the Deepseek Browser Agent to communicate with local or remote MCP servers (GitHub, local databases, Google Docs, calendars).
    *   *Example*: Equip the agent with a "Local Terminal" skill or a "Database Query" skill.

### 🎙️ Advanced Interaction & AI Capabilities
*   **[ ] Visual Snapshot OCR & Image Decoding Skill**:
    *   Add a snapshot OCR decoding feature that will capture webpage elements or regions, use a 3rd party vision/OCR service (yet to be decided) to convert the images into detailed text descriptions, and feed them into Deepseek (since the current models do not support native image inputs).
*   **[ ] Real-Time Voice & Speech Skill**:
    *   Integrate Chrome's built-in Web Speech API (transcription & synthesis) to enable fully hands-free browser automation through voice commands.
*   **[ ] Cost-Efficiency & Token Dashboards**:
    *   Implement a visual card rendering exact token metrics, reasoning output tokens, cache hit rates, and total cost estimates per chat session.

---

## 📄 License
This project is licensed under the MIT License. Feel free to use, modify, and distribute it.

