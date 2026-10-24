/**
 * user-switcher.js — Multi-User Fast Account Switcher
 * Enables 1-click candidate switching across multiple isolated user accounts in SQLite/Supabase.
 */

(function () {
  let cachedCandidates = null;

  async function fetchCandidates() {
    if (cachedCandidates) return cachedCandidates;
    try {
      if (window.API && window.API.Auth && typeof window.API.Auth.getDemoUsers === 'function') {
        const data = await window.API.Auth.getDemoUsers();
        if (data && data.users) {
          cachedCandidates = data.users;
          return cachedCandidates;
        }
      }
    } catch (e) {
      console.warn('Could not fetch candidate list:', e.message);
    }

    // Curated fallback multi-user profiles
    return [
      { user_id: 1, name: 'Alex Morgan', email: 'demo@gd.com', bio: 'Tech & AI Aspirant', avg_score: 83 },
      { user_id: 5, name: 'Sarah Chen', email: 'sarah@gd.com', bio: 'Management & Strategy Aspirant', avg_score: 85.5 },
      { user_id: 6, name: 'Rahul Sharma', email: 'rahul@gd.com', bio: 'Engineering Aspirant', avg_score: 76 },
      { user_id: 7, name: 'Priya Patel', email: 'priya@gd.com', bio: 'Product Management Aspirant', avg_score: 89 }
    ];
  }

  async function switchCandidate(email, name) {
    try {
      if (window.AppUtils && typeof window.AppUtils.showToast === 'function') {
        window.AppUtils.showToast(`Switching to ${name}...`, 'info', 1500);
      }
      const res = await window.API.Auth.quickSwitch(email);
      if (res && res.user) {
        if (window.AppUtils && typeof window.AppUtils.showToast === 'function') {
          window.AppUtils.showToast(`Switched account to ${res.user.name}!`, 'success', 2000);
        }
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
    } catch (err) {
      if (window.AppUtils && typeof window.AppUtils.showToast === 'function') {
        window.AppUtils.showToast('Could not switch account: ' + err.message, 'error');
      }
    }
  }

  async function mountUserSwitcher() {
    const userCard = document.querySelector('.user-card');
    if (!userCard || document.querySelector('.user-switcher-popover')) return;

    const currentUser = window.AppUtils && typeof window.AppUtils.getUser === 'function' ? window.AppUtils.getUser() : null;
    if (!currentUser) return;

    // Add switch badge to user card
    if (!userCard.querySelector('.user-switch-badge')) {
      const badge = document.createElement('div');
      badge.className = 'user-switch-badge';
      badge.title = 'Click to switch candidate account';
      badge.innerHTML = `
        <svg style="width:11px;height:11px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Switch
      `;
      userCard.appendChild(badge);
    }

    const candidates = await fetchCandidates();

    const popover = document.createElement('div');
    popover.className = 'user-switcher-popover';
    popover.id = 'user-switcher-popover';

    const candidateItems = candidates.map(c => {
      const isCurrent = currentUser.email && (currentUser.email.toLowerCase() === c.email.toLowerCase() || currentUser.user_id === c.user_id);
      const scoreTag = c.avg_score ? `Score: ${c.avg_score}%` : 'Fresh Profile';
      return `
        <button class="candidate-item ${isCurrent ? 'current' : ''}" type="button" data-email="${c.email}" data-name="${c.name}">
          <div class="candidate-avatar">${c.name.charAt(0).toUpperCase()}</div>
          <div class="candidate-details">
            <div class="candidate-name">${c.name} ${isCurrent ? '<span style="color:var(--accent-green);font-size:0.7rem">● Active</span>' : ''}</div>
            <div class="candidate-sub">${c.email} • ${scoreTag}</div>
          </div>
        </button>
      `;
    }).join('');

    popover.innerHTML = `
      <div class="popover-header">
        <div class="popover-user-name">${currentUser.name || 'Candidate'}</div>
        <div class="popover-user-email">${currentUser.email || ''} • ID #${currentUser.user_id || '1'}</div>
        <div class="popover-active-badge">
          <span style="font-size:0.8rem">●</span> Separate Database Storage Active
        </div>
      </div>

      <div class="popover-section-title">Multi-User Fast Switch</div>
      <div class="candidate-list">
        ${candidateItems}
      </div>

      <div class="popover-actions">
        <a href="/login.html?tab=register" class="popover-btn">
          <svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          Register New Account
        </a>
        <button type="button" class="popover-btn danger" id="user-switcher-logout-btn">
          <svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    `;

    userCard.parentElement.style.position = 'relative';
    userCard.parentElement.appendChild(popover);

    userCard.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('open');
    });

    popover.querySelectorAll('.candidate-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const email = btn.getAttribute('data-email');
        const name = btn.getAttribute('data-name');
        switchCandidate(email, name);
      });
    });

    const logoutBtn = popover.querySelector('#user-switcher-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.API && window.API.Auth) {
          window.API.Auth.logout();
        } else {
          localStorage.clear();
          window.location.href = '/login.html';
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && !userCard.contains(e.target)) {
        popover.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUserSwitcher);
  } else {
    mountUserSwitcher();
  }

  window.UserSwitcher = {
    mount: mountUserSwitcher,
    switchCandidate
  };
})();
