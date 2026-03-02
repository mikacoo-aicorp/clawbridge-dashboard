/**
 * Workspace Manager
 * Handles tab navigation and workspace loading
 */

class WorkspaceManager {
    constructor() {
        this.workspaces = {
            main: {
                html: '/workspaces/main/index.html',
                css: '/workspaces/main/css/main.css',
                scripts: ['/workspaces/main/js/main.js']
            },
            finance: {
                html: '/workspaces/finance/index.html',
                css: '/workspaces/finance/css/finance.css',
                scripts: ['/workspaces/finance/js/finance.js']
            }
        };

        const saved = this.loadFromStorage();
        this.activeWorkspace = this.workspaces[saved] ? saved : 'main';

        this.currentCssLink = null;
        this.loadedWorkspaces = new Set();
        this.loadedScripts = new Set();

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    async setup() {
        this.bindTabs();
        await this.loadWorkspace(this.activeWorkspace);
        this.updateTabs();
    }

    bindTabs() {
        const tabs = document.querySelectorAll('.workspace-tabs .tab');
        tabs.forEach(tab => {
            const key = tab.dataset.workspace;
            if (!this.workspaces[key]) return;
            tab.addEventListener('click', () => this.switchWorkspace(key));
        });
    }

    updateTabs() {
        document.querySelectorAll('.workspace-tabs .tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.workspace === this.activeWorkspace);
        });
    }

    async switchWorkspace(workspaceName) {
        if (workspaceName === this.activeWorkspace) return;

        await this.loadWorkspace(workspaceName);
        this.updateTabs();
        this.saveToStorage(workspaceName);
    }

    async loadWorkspace(workspaceName) {
        const workspace = this.workspaces[workspaceName];
        const container = document.getElementById('workspace-container');
        if (!workspace || !container) return;

        try {
            if (!this.loadedWorkspaces.has(workspaceName)) {
                const response = await fetch(workspace.html);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const html = await response.text();

                const pane = document.createElement('div');
                pane.className = 'workspace-pane';
                pane.dataset.workspace = workspaceName;
                pane.innerHTML = html;
                container.appendChild(pane);

                await this.loadWorkspaceScriptsOnce(workspace.scripts);
                this.loadedWorkspaces.add(workspaceName);
            }

            this.showWorkspace(workspaceName);
            this.loadWorkspaceCss(workspace.css);
            this.activeWorkspace = workspaceName;
        } catch (error) {
            console.error(`Error loading workspace ${workspaceName}:`, error);
            container.innerHTML = `<div class="error-message">Failed to load workspace: ${error.message}</div>`;
        }
    }

    showWorkspace(workspaceName) {
        document.querySelectorAll('#workspace-container .workspace-pane').forEach(pane => {
            pane.style.display = pane.dataset.workspace === workspaceName ? 'block' : 'none';
        });
    }

    loadWorkspaceCss(cssUrl) {
        if (this.currentCssLink) this.currentCssLink.remove();

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssUrl;
        link.dataset.workspaceCss = 'true';
        document.head.appendChild(link);

        this.currentCssLink = link;
    }

    async loadWorkspaceScriptsOnce(scriptUrls = []) {
        for (const src of scriptUrls) {
            if (this.loadedScripts.has(src)) continue;

            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.dataset.workspaceScript = 'true';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
                document.body.appendChild(script);
            });

            this.loadedScripts.add(src);
        }
    }

    loadFromStorage() {
        try {
            return localStorage.getItem('activeWorkspace');
        } catch (e) {
            return null;
        }
    }

    saveToStorage(workspaceName) {
        try {
            localStorage.setItem('activeWorkspace', workspaceName);
        } catch (e) {
            console.warn('Could not save workspace to localStorage');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.workspaceManager = new WorkspaceManager();
});
