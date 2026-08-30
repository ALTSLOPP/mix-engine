import './hub.css';

const ICONS = {
  projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6.5h6l2 2h8v10H4z"/><path d="M4 6.5v-2h6l2 2"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5.5c3-1.2 5.7-.8 8 1.2 2.3-2 5-2.4 8-1.2v13c-3-1.2-5.7-.8-8 1.2-2.3-2-5-2.4-8-1.2z"/><path d="M12 6.7v13"/></svg>',
  marketplace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 9v11h14V9"/><path d="M3.5 9 5 4h14l1.5 5c-.7 1.3-1.7 2-3 2s-2.3-.7-3-2c-.6 1.3-1.4 2-2.5 2s-1.9-.7-2.5-2c-.7 1.3-1.7 2-3 2s-2.3-.7-3-2Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7v5h-5"/><path d="M18.2 16a8 8 0 1 1 .3-8.3L20 12"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3.5 6.5h6l2 2h9v10h-17z"/><path d="M7 14h10M12 11v6"/></svg>',
};

export interface HubProject {
  name: string;
  updatedAt?: number;
  createdAt?: number;
  entityCount?: number;
  sceneBytes?: number;
  hasScripts?: boolean;
}

interface ProjectsResponse {
  games?: string[];
  projects?: HubProject[];
}

interface ProjectHubOptions {
  version: string;
  onLaunch: (projectName: string) => void | Promise<void>;
}

function escapeMarkup(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char] ?? char);
}

function relativeTime(timestamp?: number): string {
  if (!timestamp) return 'Project ready';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (elapsed < minute) return 'Updated just now';
  if (elapsed < hour) return `Updated ${Math.floor(elapsed / minute)}m ago`;
  if (elapsed < day) return `Updated ${Math.floor(elapsed / hour)}h ago`;
  if (elapsed < day * 7) return `Updated ${Math.floor(elapsed / day)}d ago`;
  return `Updated ${new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'EMPTY SCENE';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function showProjectHub(options: ProjectHubOptions): void {
  const existing = document.getElementById('mix-project-hub');
  existing?.remove();
  document.body.classList.add('mix-hub-open');

  const hub = document.createElement('div');
  hub.id = 'mix-project-hub';
  hub.innerHTML = `
    <div class="hub-grain"></div>
    <div class="hub-shell">
      <aside class="hub-sidebar">
        <div class="hub-brand" aria-label="MIX Engine">
          <div class="hub-mark" aria-hidden="true"></div>
          <div class="hub-brand-copy"><strong>MIX</strong><span>Engine ${escapeMarkup(options.version)}</span></div>
        </div>
        <div class="hub-nav-label">Workspace</div>
        <nav class="hub-nav" aria-label="Hub sections">
          <button class="hub-nav-button active" type="button">${ICONS.projects}<span>Projects</span></button>
          <button class="hub-nav-button disabled" type="button" title="Documentation workspace coming soon">${ICONS.learn}<span>Learn</span><b class="hub-nav-badge">SOON</b></button>
          <button class="hub-nav-button disabled" type="button" title="Marketplace coming soon">${ICONS.marketplace}<span>Marketplace</span><b class="hub-nav-badge">SOON</b></button>
        </nav>
        <div class="hub-sidebar-foot">
          <div class="hub-system-line"><i class="hub-status-light"></i>Systems nominal</div>
          <div class="hub-system-line">CORE / ${escapeMarkup(options.version)}</div>
        </div>
      </aside>
      <main class="hub-main">
        <header class="hub-topbar">
          <div class="hub-topbar-title">Project Hub <span>Local workspace</span></div>
          <div class="hub-top-actions">
            <button id="hub-refresh" class="hub-icon-button" type="button" title="Refresh projects" aria-label="Refresh projects">${ICONS.refresh}</button>
          </div>
        </header>
        <div class="hub-content">
          <section class="hub-hero" aria-labelledby="hub-hero-title">
            <div class="hub-hero-art"></div>
            <div class="hub-hero-copy">
              <div class="hub-kicker">MIX Creation Suite</div>
              <h1 id="hub-hero-title">Build worlds.<br>Break limits.</h1>
              <p>Your command center for real-time worlds, cinematic systems, and AI-native gameplay. Pick up where you left off or forge something new.</p>
              <div class="hub-hero-actions">
                <button id="hub-new-project" class="hub-button primary" type="button"><span>＋</span> New Project</button>
                <button id="hub-open-recent" class="hub-button" type="button">Open Recent <span>↗</span></button>
              </div>
            </div>
          </section>

          <section class="hub-section" aria-labelledby="hub-projects-title">
            <div class="hub-section-head">
              <div class="hub-section-title">
                <div class="hub-section-kicker">Workspace index</div>
                <h2 id="hub-projects-title">Your projects</h2>
              </div>
              <div class="hub-project-tools">
                <label class="hub-search-wrap">
                  ${ICONS.search}
                  <input id="hub-project-search" class="hub-search" type="search" placeholder="Filter projects..." autocomplete="off" aria-label="Filter projects">
                </label>
              </div>
            </div>
            <div id="hub-project-grid" class="hub-project-grid" aria-live="polite">
              <div class="hub-empty"><div><strong>Scanning workspace</strong>Indexing local MIX projects…</div></div>
            </div>
          </section>
        </div>
      </main>
    </div>`;
  document.body.appendChild(hub);

  const grid = hub.querySelector('#hub-project-grid') as HTMLDivElement;
  const search = hub.querySelector('#hub-project-search') as HTMLInputElement;
  const newProjectButton = hub.querySelector('#hub-new-project') as HTMLButtonElement;
  const openRecentButton = hub.querySelector('#hub-open-recent') as HTMLButtonElement;
  const refreshButton = hub.querySelector('#hub-refresh') as HTMLButtonElement;
  let projects: HubProject[] = [];
  let activeProject: string | null = null;
  let launching = false;

  const showToast = (message: string): void => {
    hub.querySelector('.hub-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'hub-toast';
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    hub.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  };

  const launchProject = async (name: string): Promise<void> => {
    if (launching) return;
    launching = true;
    hub.querySelectorAll('button').forEach((button) => { (button as HTMLButtonElement).disabled = true; });
    try {
      const response = await fetch('/api/games/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: name }),
      });
      if (!response.ok) throw new Error(await parseError(response, 'Could not activate this project.'));
      hub.classList.add('is-launching');
      document.body.classList.remove('mix-hub-open');
      hub.remove();
      await options.onLaunch(name);
    } catch (error) {
      launching = false;
      hub.querySelectorAll('button').forEach((button) => { (button as HTMLButtonElement).disabled = false; });
      showToast(error instanceof Error ? error.message : 'Could not open this project.');
    }
  };

  const renderProjects = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = projects.filter((project) => project.name.toLocaleLowerCase().includes(query));
    if (filtered.length === 0) {
      grid.innerHTML = query
        ? '<div class="hub-empty"><div><strong>No matching projects</strong>Try a different search.</div></div>'
        : '<div class="hub-empty"><div><strong>No projects yet</strong>Create your first world to get cooking.</div></div>';
      return;
    }
    grid.innerHTML = filtered.map((project) => {
      const entityLabel = `${project.entityCount ?? 0} ${(project.entityCount ?? 0) === 1 ? 'ENTITY' : 'ENTITIES'}`;
      return `
        <button class="hub-project-card${project.name === activeProject ? ' active-project' : ''}" type="button" data-project="${escapeMarkup(project.name)}" title="Open ${escapeMarkup(project.name)}">
          <span class="hub-project-card-top">
            <span class="hub-project-glyph">${ICONS.folder}</span>
            <span class="hub-project-open">↗</span>
          </span>
          <strong class="hub-project-name">${escapeMarkup(project.name)}</strong>
          <span class="hub-project-meta"><span>${relativeTime(project.updatedAt)}</span><i></i><span>${entityLabel}</span><i></i><span>${formatSize(project.sceneBytes)}</span></span>
        </button>`;
    }).join('');
    grid.querySelectorAll<HTMLButtonElement>('[data-project]').forEach((card) => {
      card.addEventListener('click', () => { void launchProject(card.dataset.project ?? ''); });
    });
  };

  const loadProjects = async (): Promise<void> => {
    refreshButton.disabled = true;
    try {
      const [projectsResponse, activeResponse] = await Promise.all([
        fetch('/api/games'),
        fetch('/api/games/active'),
      ]);
      if (!projectsResponse.ok) throw new Error('The local project service is unavailable.');
      const data = await projectsResponse.json() as ProjectsResponse;
      const active = activeResponse.ok ? await activeResponse.json() as { active?: string | null } : {};
      activeProject = active.active ?? null;
      projects = data.projects ?? (data.games ?? []).map((name) => ({ name }));
      projects.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.name.localeCompare(b.name));
      renderProjects();
      openRecentButton.disabled = projects.length === 0;
    } catch (error) {
      grid.innerHTML = '<div class="hub-empty"><div><strong>Workspace unavailable</strong>Could not read the local project index.</div></div>';
      showToast(error instanceof Error ? error.message : 'Could not load projects.');
    } finally {
      refreshButton.disabled = false;
    }
  };

  const openCreateDialog = (): void => {
    const backdrop = document.createElement('div');
    backdrop.className = 'hub-modal-backdrop';
    backdrop.innerHTML = `
      <form class="hub-modal" aria-labelledby="hub-create-title">
        <div class="hub-modal-head">
          <div><div class="hub-section-kicker">Initialize workspace</div><h2 id="hub-create-title">Create a new project</h2></div>
          <button class="hub-icon-button" type="button" data-close aria-label="Close">×</button>
        </div>
        <div class="hub-field">
          <label for="hub-project-name">Project name</label>
          <input id="hub-project-name" class="hub-input" name="name" maxlength="64" placeholder="My_New_World" autocomplete="off" required>
          <div class="hub-field-hint">Letters, numbers, dots, dashes, and underscores. Spaces become underscores.</div>
        </div>
        <div class="hub-template" aria-label="Blank world template selected">
          <div class="hub-template-art">◇</div>
          <div><strong>Blank World</strong><span>Clean scene · default lighting · physics ready</span></div>
          <div class="hub-template-check">✓</div>
        </div>
        <div class="hub-modal-actions">
          <button class="hub-button" type="button" data-close>Cancel</button>
          <button class="hub-button primary" type="submit">Create Project <span>↗</span></button>
        </div>
      </form>`;
    hub.appendChild(backdrop);
    const form = backdrop.querySelector('form') as HTMLFormElement;
    const input = backdrop.querySelector('#hub-project-name') as HTMLInputElement;
    const hint = backdrop.querySelector('.hub-field-hint') as HTMLDivElement;
    const submit = form.querySelector('[type="submit"]') as HTMLButtonElement;
    const close = (): void => backdrop.remove();
    backdrop.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
    backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const rawName = input.value.trim();
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+|\.+$/g, '');
      if (!safeName) {
        hint.textContent = 'Enter a valid project name.';
        hint.classList.add('error');
        input.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Creating…';
      try {
        const response = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: safeName }),
        });
        if (!response.ok) throw new Error(await parseError(response, 'Could not create the project.'));
        await launchProject(safeName);
      } catch (error) {
        hint.textContent = error instanceof Error ? error.message : 'Could not create the project.';
        hint.classList.add('error');
        submit.disabled = false;
        submit.innerHTML = 'Create Project <span>↗</span>';
      }
    });
    window.setTimeout(() => input.focus(), 0);
  };

  search.addEventListener('input', renderProjects);
  newProjectButton.addEventListener('click', openCreateDialog);
  openRecentButton.addEventListener('click', () => {
    const target = projects.find((project) => project.name === activeProject) ?? projects[0];
    if (target) void launchProject(target.name);
  });
  refreshButton.addEventListener('click', () => { void loadProjects(); });
  void loadProjects();
}
