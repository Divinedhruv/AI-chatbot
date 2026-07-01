// Admin Panel Logic — Self-contained auth + /admin prefixed API routes

const sidebar = document.getElementById('sidebar');
const adminAvatar = document.getElementById('adminAvatar');
const displayUsername = document.getElementById('displayUsername');
const errorDiv = document.getElementById('error');
const successDiv = document.getElementById('successAlert');

// Dashboard state & Chart variables
let cpuChart = null;
let ramChart = null;
const maxDataPoints = 10;
const cpuData = Array(maxDataPoints).fill(0);
const ramData = Array(maxDataPoints).fill(0);
const chartLabels = Array(maxDataPoints).fill('');
let serverUptimeSeconds = 0;
let uptimeTimer = null;
let dashboardPollInterval = null;

// Analytics Charts state variables
let chartDailySearches = null;
let chartResponseTimes = null;
let chartTokenCost = null;
let chartHourlyActivity = null;
let currentAnalyticsRange = 14;

// User Management state variables
let adminUsersData = [];

// ==========================================================================
// Admin Authentication Flow
// ==========================================================================

// Check user session on load
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
});

// Check if admin session is active
async function checkAdminAuth() {
    try {
        const res = await fetch('/admin/api/me');
        if (res.ok) {
            const user = await res.json();
            if (user.role === 'admin') {
                showDashboard(user);
            } else {
                showLoginForm('Access denied. Admin privileges required.');
            }
        } else {
            showLoginForm();
        }
    } catch (err) {
        console.error('Admin session check failed:', err);
        showLoginForm();
    }
}

// Show the login overlay, hide dashboard
function showLoginForm(errorMsg = '') {
    document.getElementById('adminLoginOverlay').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'none';

    const loginError = document.getElementById('adminLoginError');
    if (errorMsg && loginError) {
        loginError.textContent = errorMsg;
        loginError.style.display = 'block';
        loginError.classList.add('active');
    } else if (loginError) {
        loginError.style.display = 'none';
        loginError.classList.remove('active');
    }
}

// Show dashboard, hide login overlay
function showDashboard(user) {
    document.getElementById('adminLoginOverlay').style.display = 'none';
    document.getElementById('mainContainer').style.display = '';
    setupAdminView(user);
}

// Handle admin login form submission
async function handleAdminLogin(e) {
    e.preventDefault();

    const loginError = document.getElementById('adminLoginError');
    const loginBtn = document.getElementById('adminLoginBtn');

    // Hide any previous error
    if (loginError) {
        loginError.style.display = 'none';
        loginError.classList.remove('active');
    }

    const usernameOrEmail = document.getElementById('adminLoginUser').value.trim();
    const password = document.getElementById('adminLoginPassword').value;

    if (!usernameOrEmail || !password) {
        if (loginError) {
            loginError.textContent = 'All fields are required.';
            loginError.style.display = 'block';
            loginError.classList.add('active');
        }
        return;
    }

    // Disable button during request
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';

    try {
        const res = await fetch('/admin/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernameOrEmail, password })
        });

        const data = await res.json();

        if (res.ok) {
            showDashboard(data.user);
        } else {
            if (loginError) {
                loginError.textContent = data.error || 'Login failed. Please try again.';
                loginError.style.display = 'block';
                loginError.classList.add('active');
            }
        }
    } catch (err) {
        console.error('Admin login failed:', err);
        if (loginError) {
            loginError.textContent = 'Network error. Could not reach server.';
            loginError.style.display = 'block';
            loginError.classList.add('active');
        }
    }

    // Re-enable button
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In to Admin';
}

// Setup admin panel view with user info
function setupAdminView(user) {
    displayUsername.textContent = user.username;
    adminAvatar.textContent = user.username.charAt(0).toUpperCase();

    // Start Dashboard features
    initDashboard();
}

// Collapsible Sidebar Functions
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    const toggleIcon = document.getElementById('sidebarToggle').querySelector('i');
    if (sidebar.classList.contains('collapsed')) {
        toggleIcon.className = 'fas fa-chevron-right';
    } else {
        toggleIcon.className = 'fas fa-chevron-left';
    }
}

// Switch between Admin Panels
function switchTab(tabId) {
    // Hide notifications
    hideError();
    hideSuccess();

    // Remove active class from all buttons
    const navButtons = document.querySelectorAll('.sidebar-action-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));

    // Add active class to corresponding button
    const targetBtn = document.getElementById(`nav-${tabId}`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // Remove active class from all panels
    const panels = document.querySelectorAll('.dashboard-panel');
    panels.forEach(panel => panel.classList.remove('active'));

    // Add active class to target panel
    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }

    // Load tab-specific data
    if (tabId === 'users') {
        fetchAdminUsers();
    } else if (tabId === 'chat-mgmt') {
        initChatManagement();
    } else if (tabId === 'api') {
        fetchApiConfig();
    } else if (tabId === 'analytics') {
        initAnalyticsPanel();
    } else if (tabId === 'security') {
        initSecurityPanel();
    } else if (tabId === 'system') {
        initSystemPanel();
    } else if (tabId === 'logs') {
        initLogsPanel();
    } else if (tabId === 'ai-config') {
        initAiConfigPanel();
    } else if (tabId === 'feedback') {
        initFeedbackPanel();
    }

    if (tabId !== 'logs' && typeof stopPollingLogs === 'function') {
        stopPollingLogs();
    }
}

// Handle Admin Logout
async function handleLogout() {
    try {
        await fetch('/admin/api/logout', { method: 'POST' });
    } catch (err) {
        console.error('Logout request failed:', err);
    }

    // Stop polling intervals
    if (dashboardPollInterval) clearInterval(dashboardPollInterval);
    if (uptimeTimer) clearInterval(uptimeTimer);
    cpuChart = null;
    ramChart = null;

    // Destroy analytics charts
    destroyAnalyticsCharts();

    // Show login form again
    showLoginForm();

    // Reset login form fields
    const form = document.getElementById('adminLoginForm');
    if (form) form.reset();
}

// Notification Alert Helpers
function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.add('active');
}

function showSuccess(msg) {
    successDiv.textContent = msg;
    successDiv.classList.add('active');
}

function hideError() {
    errorDiv.classList.remove('active');
}

function hideSuccess() {
    successDiv.classList.remove('active');
}

// Dashboard initialization and update routines
function initDashboard() {
    if (cpuChart) return;

    initCharts();
    fetchDashboardData();

    // Poll data every 3 seconds
    if (dashboardPollInterval) clearInterval(dashboardPollInterval);
    dashboardPollInterval = setInterval(fetchDashboardData, 3000);

    // Start local uptime ticker
    if (uptimeTimer) clearInterval(uptimeTimer);
    uptimeTimer = setInterval(updateUptimeUI, 1000);
}

function initCharts() {
    const ctxCpu = document.getElementById('cpuChart');
    const ctxRam = document.getElementById('ramChart');
    if (!ctxCpu || !ctxRam) return;

    const getChartOptions = (accentColor) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                min: 0,
                max: 100,
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    font: {
                        family: 'Outfit',
                        size: 9
                    }
                }
            },
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    font: {
                        family: 'Outfit',
                        size: 9
                    }
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        },
        elements: {
            point: {
                radius: 0,
                hitRadius: 10,
                hoverRadius: 5
            },
            line: {
                tension: 0.4
            }
        }
    });

    cpuChart = new Chart(ctxCpu.getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: cpuData,
                borderColor: '#fbbf24',
                borderWidth: 2,
                fill: true,
                backgroundColor: 'rgba(251, 191, 36, 0.05)'
            }]
        },
        options: getChartOptions('#fbbf24')
    });

    ramChart = new Chart(ctxRam.getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: ramData,
                borderColor: '#667eea',
                borderWidth: 2,
                fill: true,
                backgroundColor: 'rgba(102, 126, 234, 0.05)'
            }]
        },
        options: getChartOptions('#667eea')
    });
}

async function fetchDashboardData() {
    try {
        const res = await fetch('/admin/api/dashboard');
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                showLoginForm('Session expired. Please login again.');
                return;
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        updateDashboardUI(data);
    } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
    }
}

function updateDashboardUI(data) {
    // 1. Stats Grid
    document.getElementById('statTotalUsers').textContent = data.stats.total_users;
    document.getElementById('statOnlineUsers').textContent = data.stats.online_users;
    document.getElementById('statTotalCredits').textContent = data.stats.total_credits;
    document.getElementById('statCreditsUsed').textContent = data.stats.total_credits_used;

    // 2. Pulse Online Icon if there are online users
    const pulseIcon = document.getElementById('onlinePulseIcon');
    if (pulseIcon) {
        if (data.stats.online_users > 0) {
            pulseIcon.style.animation = 'pulse 1.5s infinite alternate';
        } else {
            pulseIcon.style.animation = 'none';
        }
    }

    // 3. Update Charts
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    chartLabels.push(timeStr);
    cpuData.push(data.system_status.cpu_usage);
    ramData.push(data.system_status.ram_usage);

    if (chartLabels.length > maxDataPoints) {
        chartLabels.shift();
        cpuData.shift();
        ramData.shift();
    }

    if (cpuChart) cpuChart.update();
    if (ramChart) ramChart.update();

    // 4. Update Uptime and Platform widgets
    serverUptimeSeconds = data.system_status.uptime;
    updateUptimeUI();

    document.getElementById('widgetPlatform').textContent = data.system_status.platform;

    // DB Latency widget
    const dbStatusEl = document.getElementById('widgetDbStatus');
    if (dbStatusEl) {
        if (data.system_status.db_status === 'Connected') {
            dbStatusEl.innerHTML = `<i class="fas fa-check-circle"></i> Connected (<span id="widgetDbLatency">${data.system_status.db_latency_ms}</span>ms)`;
            dbStatusEl.style.color = '#10b981';
        } else {
            dbStatusEl.innerHTML = `<i class="fas fa-times-circle"></i> Disconnected`;
            dbStatusEl.style.color = '#ef4444';
        }
    }

    // AI Key Status widget
    const keyStatusEl = document.getElementById('widgetApiKeyStatus');
    if (keyStatusEl) {
        keyStatusEl.textContent = data.system_status.api_status;
        if (data.system_status.api_status.includes('Active')) {
            keyStatusEl.style.color = '#fbbf24';
        } else {
            keyStatusEl.style.color = '#ef4444';
        }
    }

    // 5. Update Tables
    renderLatestUsersTable(data.latest_users);
    renderLatestCreditsUsedTable(data.latest_credits_used);
}

function updateUptimeUI() {
    const uptimeEl = document.getElementById('widgetUptime');
    if (!uptimeEl) return;

    const d = Math.floor(serverUptimeSeconds / (3600 * 24));
    const h = Math.floor((serverUptimeSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((serverUptimeSeconds % 3600) / 60);
    const s = Math.floor(serverUptimeSeconds % 60);

    uptimeEl.textContent = `${d}d ${h}h ${m}m ${s}s`;
    serverUptimeSeconds++;
}

function renderLatestUsersTable(users) {
    const tbody = document.getElementById('tableLatestUsers');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 20px;">No registered users.</td></tr>`;
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        const joinedDate = new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        tr.innerHTML = `
            <td style="padding: 10px 12px; font-weight: 500; color: #fff;">${user.username}</td>
            <td style="padding: 10px 12px; color: #fbbf24; font-weight: 600;"><i class="fas fa-coins" style="font-size: 0.8rem; margin-right: 4px;"></i>${user.credits}</td>
            <td style="padding: 10px 12px; color: var(--text-secondary); font-size: 0.8rem;">${joinedDate}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderLatestCreditsUsedTable(usages) {
    const tbody = document.getElementById('tableLatestCreditsUsed');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (usages.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 20px;">No credit usage recorded yet.</td></tr>`;
        return;
    }

    usages.forEach(usage => {
        const tr = document.createElement('tr');
        const usageTime = new Date(usage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        tr.innerHTML = `
            <td style="padding: 10px 15px; font-weight: 500; color: #fff;">${usage.username}</td>
            <td style="padding: 10px 15px; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${usage.query}">${usage.query}</td>
            <td style="padding: 10px 15px; color: #f43f5e; font-weight: 600;">-${usage.credits_used}</td>
            <td style="padding: 10px 15px; color: var(--text-secondary); font-size: 0.8rem;">${usageTime}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================================================
// Admin Users CRUD Management Logic
// ==========================================================================

async function fetchAdminUsers() {
    const tbody = document.getElementById('tableAdminUsersList');
    if (!tbody) return;

    try {
        const res = await fetch('/admin/api/users');
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                showError('Access denied. Admin authorization required.');
                return;
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        adminUsersData = await res.json();
        renderAdminUsers(adminUsersData);
    } catch (err) {
        console.error('Failed to fetch admin users:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger-color); font-weight: 500; padding: 30px;">Error: Failed to load user accounts.</td></tr>`;
    }
}

function renderAdminUsers(users) {
    const tbody = document.getElementById('tableAdminUsersList');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">No accounts found in the database.</td></tr>`;
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        const joinedDate = new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const lastActiveDate = user.last_active ? new Date(user.last_active).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

        const roleBadge = user.role === 'admin' ? '<span class="badge badge-admin">Admin</span>' : '<span class="badge badge-user">User</span>';
        const statusBadge = user.status === 'active'
            ? `<span class="status-active" onclick="toggleUserStatus(${user.id}, 'active')" style="cursor: pointer;" title="Click to deactivate user">Active</span>`
            : `<span class="status-inactive" onclick="toggleUserStatus(${user.id}, 'inactive')" style="cursor: pointer;" title="Click to activate user">Inactive</span>`;

        tr.innerHTML = `
            <td style="padding: 12px 15px;">
                <div style="font-weight: 600; color: #fff;">${user.username}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">${user.email}</div>
            </td>
            <td style="padding: 12px 15px; color: #fbbf24; font-weight: 600;">
                <i class="fas fa-coins" style="font-size: 0.8rem; margin-right: 4px;"></i>${user.credits}
            </td>
            <td style="padding: 12px 15px;">${roleBadge}</td>
            <td style="padding: 12px 15px;">${statusBadge}</td>
            <td style="padding: 12px 15px; color: var(--text-secondary); font-size: 0.8rem;">${lastActiveDate}</td>
            <td style="padding: 12px 15px; text-align: right;">
                <div style="display: inline-flex; gap: 8px;">
                    <button class="action-btn btn-reset-pw" onclick="openResetPasswordModal(${user.id}, '${user.username}')" title="Reset Password">
                        <i class="fas fa-key"></i>
                    </button>
                    <button class="action-btn btn-edit" onclick="openEditUserModal(${user.id})" title="Edit Details">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="handleDeleteUser(${user.id}, '${user.username}')" title="Delete User">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterAdminUsers() {
    const term = document.getElementById('adminUsersSearch').value.toLowerCase().trim();
    if (!term) {
        renderAdminUsers(adminUsersData);
        return;
    }

    const filtered = adminUsersData.filter(user =>
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
    );
    renderAdminUsers(filtered);
}

async function toggleUserStatus(userId, currentStatus) {
    const user = adminUsersData.find(u => u.id === userId);
    if (!user) return;

    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
        const res = await fetch(`/admin/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user.username,
                email: user.email,
                role: user.role,
                credits: user.credits,
                status: newStatus
            })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess(`User status updated to ${newStatus}.`);
            fetchAdminUsers();
        } else {
            showError(data.error || 'Failed to update user status.');
        }
    } catch (err) {
        showError('Network error. Failed to toggle status.');
    }

    setTimeout(hideSuccess, 2000);
}

// Modal dialog triggers
const adminModalOverlay = document.getElementById('adminModalOverlay');
const modalCreateUser = document.getElementById('modalCreateUser');
const modalEditUser = document.getElementById('modalEditUser');
const modalResetPassword = document.getElementById('modalResetPassword');

function openCreateUserModal() {
    adminModalOverlay.classList.add('active');
    modalCreateUser.classList.add('active-modal');
    document.getElementById('createUsername').focus();
}

function openEditUserModal(userId) {
    const user = adminUsersData.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editCredits').value = user.credits;
    document.getElementById('editStatus').value = user.status;

    adminModalOverlay.classList.add('active');
    modalEditUser.classList.add('active-modal');
}

function openResetPasswordModal(userId, username) {
    document.getElementById('resetPasswordUserId').value = userId;
    document.getElementById('resetPasswordTargetUser').textContent = username;
    document.getElementById('resetNewPassword').value = '';

    adminModalOverlay.classList.add('active');
    modalResetPassword.classList.add('active-modal');
    document.getElementById('resetNewPassword').focus();
}

function closeAdminModal() {
    adminModalOverlay.classList.remove('active');
    modalCreateUser.classList.remove('active-modal');
    modalEditUser.classList.remove('active-modal');
    modalResetPassword.classList.remove('active-modal');
    const modalView = document.getElementById('modalViewConversation');
    if (modalView) modalView.classList.remove('active-modal');
    const modalKey = document.getElementById('modalApiKey');
    if (modalKey) modalKey.classList.remove('active-modal');

    try { modalCreateUser.querySelector('form').reset(); } catch (e) { }
    try { modalEditUser.querySelector('form').reset(); } catch (e) { }
    try { modalResetPassword.querySelector('form').reset(); } catch (e) { }
    try { document.getElementById('modalApiKey').querySelector('form').reset(); } catch (e) { }
}

async function handleCreateUserForm(e) {
    e.preventDefault();
    hideError();

    const username = document.getElementById('createUsername').value.trim();
    const email = document.getElementById('createEmail').value.trim();
    const password = document.getElementById('createPassword').value;
    const role = document.getElementById('createRole').value;
    const credits = parseInt(document.getElementById('createCredits').value);

    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }

    try {
        const res = await fetch('/admin/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, role, status: 'active', credits })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess('User account created successfully.');
            closeAdminModal();
            fetchAdminUsers();
        } else {
            showError(data.error || 'Failed to create user account.');
        }
    } catch (err) {
        showError('Network error. Failed to create user.');
    }

    setTimeout(hideSuccess, 2000);
}

async function handleEditUserForm(e) {
    e.preventDefault();
    hideError();

    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const role = document.getElementById('editRole').value;
    const credits = parseInt(document.getElementById('editCredits').value);
    const status = document.getElementById('editStatus').value;

    try {
        const res = await fetch(`/admin/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, role, status, credits })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess('User details updated successfully.');
            closeAdminModal();
            fetchAdminUsers();
        } else {
            showError(data.error || 'Failed to update user details.');
        }
    } catch (err) {
        showError('Network error. Failed to update user.');
    }

    setTimeout(hideSuccess, 2000);
}

async function handleResetPasswordForm(e) {
    e.preventDefault();
    hideError();

    const userId = document.getElementById('resetPasswordUserId').value;
    const password = document.getElementById('resetNewPassword').value;

    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }

    try {
        const res = await fetch(`/admin/api/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess('Password reset successfully.');
            closeAdminModal();
        } else {
            showError(data.error || 'Failed to reset password.');
        }
    } catch (err) {
        showError('Network error. Failed to reset password.');
    }

    setTimeout(hideSuccess, 2000);
}

async function handleDeleteUser(userId, username) {
    if (!confirm(`Are you sure you want to permanently delete user "${username}"?\nThis action cannot be undone.`)) {
        return;
    }

    hideError();

    try {
        const res = await fetch(`/admin/api/users/${userId}`, {
            method: 'DELETE'
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess(`User "${username}" deleted successfully.`);
            fetchAdminUsers();
        } else {
            showError(data.error || 'Failed to delete user.');
        }
    } catch (err) {
        showError('Network error. Failed to delete user.');
    }

    setTimeout(hideSuccess, 2000);
}

// ==========================================================================
// Admin API Settings Config Management
// ==========================================================================

let activeConfigData = null;

async function fetchApiConfig() {
    try {
        const res = await fetch('/admin/api/config');
        if (res.ok) {
            activeConfigData = await res.json();
            updateApiConfigUI(activeConfigData);
        }
    } catch (e) {
        console.error('Failed to load api config:', e);
    }
}

function updateApiConfigUI(data) {
    const provEl = document.getElementById('apiStatusProvider');
    const keyEl = document.getElementById('apiStatusKey');

    const providerNames = {
        'groq': 'Groq (llama-3.3)',
        'openai': 'OpenAI (gpt-3.5)',
        'gemini': 'Google Gemini (gemini-2.0)',
        'none': 'None Configured',
        'unknown': 'Unknown / Custom'
    };

    if (provEl) provEl.textContent = providerNames[data.provider] || data.provider;
    if (keyEl) keyEl.textContent = data.key_masked || 'None';

    document.querySelectorAll('.provider-status-dot').forEach(el => el.className = 'provider-status-dot');
    const dot = document.getElementById(`providerDot-${data.provider}`);
    if (dot) {
        dot.classList.add('active');
    }
}

function openApiKeyModal(provider = '') {
    const overlay = document.getElementById('adminModalOverlay');
    const modal = document.getElementById('modalApiKey');
    if (!overlay || !modal) return;

    const keyInput = document.getElementById('apiKeyInput');
    const urlInput = document.getElementById('apiUrlInput');
    const detectedEl = document.getElementById('apiKeyDetectedProvider');

    keyInput.value = '';
    urlInput.value = activeConfigData?.api_url || '';
    detectedEl.textContent = 'Enter a key above';

    keyInput.oninput = () => {
        const val = keyInput.value.trim();
        if (val.startsWith('gsk_')) {
            detectedEl.textContent = 'Detected: Groq (Llama-3.3)';
            detectedEl.style.color = '#f97316';
        } else if (val.startsWith('sk-')) {
            detectedEl.textContent = 'Detected: OpenAI (GPT-3.5)';
            detectedEl.style.color = '#10b981';
        } else if (val.startsWith('AIzaSy')) {
            detectedEl.textContent = 'Detected: Google Gemini (Gemini-2.0)';
            detectedEl.style.color = '#667eea';
        } else if (val.length > 5) {
            detectedEl.textContent = 'Detected: Unknown / Custom Key';
            detectedEl.style.color = '#a78bfa';
        } else {
            detectedEl.textContent = 'Enter a key above';
            detectedEl.style.color = '#fff';
        }
    };

    overlay.classList.add('active');
    modal.classList.add('active-modal');
    keyInput.focus();
}

async function handleApiKeyForm(e) {
    e.preventDefault();
    hideError();

    const api_key = document.getElementById('apiKeyInput').value.trim();
    const api_url = document.getElementById('apiUrlInput').value.trim();

    try {
        const res = await fetch('/admin/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key, api_url })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess('API key configuration updated successfully.');
            closeAdminModal();
            fetchApiConfig();
        } else {
            showError(data.error || 'Failed to update configuration.');
        }
    } catch (err) {
        showError('Network error. Failed to save config.');
    }

    setTimeout(hideSuccess, 2000);
}

async function testApiConnection(provider) {
    const latEl = document.getElementById(`providerLatency-${provider}`);
    const dot = document.getElementById(`providerDot-${provider}`);

    if (latEl) latEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 0.9rem;"></i> Testing...';

    try {
        const res = await fetch('/admin/api/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider })
        });

        const data = await res.json();
        document.getElementById('apiStatusLastTest').textContent = new Date().toLocaleTimeString();

        if (res.ok && data.success) {
            if (latEl) latEl.innerHTML = `<span style="color: #10b981;"><i class="fas fa-check-circle"></i> Connected</span> (${data.latency_ms}ms)`;
            if (dot) dot.className = 'provider-status-dot active';
            showSuccess(`API connection test succeeded to ${provider}.`);
        } else {
            const err = data.error || 'Connection failed.';
            if (latEl) latEl.innerHTML = `<span style="color: #ef4444;" title="${err}"><i class="fas fa-times-circle"></i> Failed</span>`;
            if (dot) dot.className = 'provider-status-dot error';
            showError(`API connection test failed to ${provider}: ${err}`);
        }
    } catch (err) {
        if (latEl) latEl.innerHTML = `<span style="color: #ef4444;"><i class="fas fa-times-circle"></i> Error</span>`;
        showError(`Network failure testing API connection to ${provider}.`);
    }

    setTimeout(hideSuccess, 3000);
    setTimeout(hideError, 5000);
}

// ==========================================================================
// Admin Chat Management Logic
// ==========================================================================

let adminConversationsData = [];
let currentChatMgmtTab = 'history';

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function initChatManagement() {
    const userFilter = document.getElementById('chatHistoryUserFilter');
    if (userFilter) userFilter.value = '';
    const searchInput = document.getElementById('chatHistorySearchInput');
    if (searchInput) searchInput.value = '';

    populateChatUsersFilter();
    switchChatMgmtTab('history');
}

async function populateChatUsersFilter() {
    const userFilter = document.getElementById('chatHistoryUserFilter');
    if (!userFilter) return;

    try {
        if (adminUsersData.length === 0) {
            const res = await fetch('/admin/api/users');
            if (res.ok) {
                adminUsersData = await res.json();
            }
        }

        userFilter.innerHTML = '<option value="">All Users</option>';
        adminUsersData.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = `${user.username} (${user.email})`;
            userFilter.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to populate chat users filter:', err);
    }
}

function switchChatMgmtTab(tabId) {
    currentChatMgmtTab = tabId;

    document.getElementById('tabChatHistory').classList.toggle('active', tabId === 'history');
    document.getElementById('tabChatModeration').classList.toggle('active', tabId === 'moderation');
    document.getElementById('tabChatAnalytics').classList.toggle('active', tabId === 'analytics');

    document.getElementById('chat-mgmt-history').style.display = tabId === 'history' ? 'flex' : 'none';
    document.getElementById('chat-mgmt-moderation').style.display = tabId === 'moderation' ? 'flex' : 'none';
    document.getElementById('chat-mgmt-analytics').style.display = tabId === 'analytics' ? 'flex' : 'none';

    if (tabId === 'history') {
        fetchChatConversations();
    } else if (tabId === 'moderation') {
        fetchModerationLogs();
    } else if (tabId === 'analytics') {
        fetchChatAnalytics();
    }
}

async function fetchChatConversations() {
    const tbody = document.getElementById('tableChatHistoryList');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">Loading conversations...</td></tr>`;

    const userId = document.getElementById('chatHistoryUserFilter').value;
    const search = document.getElementById('chatHistorySearchInput').value.trim();

    try {
        let url = `/admin/api/conversations?flagged_only=0`;
        if (userId) url += `&user_id=${userId}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const res = await fetch(url);
        if (res.ok) {
            adminConversationsData = await res.json();
            renderChatHistory(adminConversationsData);
        } else {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger-color); font-weight: 500; padding: 30px;">Error: Failed to load conversations.</td></tr>`;
        }
    } catch (err) {
        console.error('Failed to fetch chat history:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger-color); font-weight: 500; padding: 30px;">Error: Network connection failed.</td></tr>`;
    }
}

function renderChatHistory(chats) {
    const tbody = document.getElementById('tableChatHistoryList');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (chats.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">No conversation logs found.</td></tr>`;
        return;
    }

    chats.forEach(chat => {
        const tr = document.createElement('tr');
        const chatTime = new Date(chat.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const truncatedQuery = chat.query.length > 55 ? chat.query.substring(0, 52) + '...' : chat.query;

        let statusBadge = '';
        if (chat.is_flagged) {
            statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);">Flagged</span>`;
        } else {
            statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25);">Clean</span>`;
        }

        tr.innerHTML = `
            <td style="padding: 12px 15px;">
                <div style="font-weight: 600; color: #fff;">${chat.username}</div>
            </td>
            <td style="padding: 12px 15px; color: var(--text-primary); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${chat.query}">
                ${truncatedQuery}
            </td>
            <td style="padding: 12px 15px; color: #fbbf24; font-weight: 600;">
                <i class="fas fa-coins" style="font-size: 0.8rem; margin-right: 4px;"></i>${chat.credits_used}
            </td>
            <td style="padding: 12px 15px;">${statusBadge}</td>
            <td style="padding: 12px 15px; color: var(--text-secondary); font-size: 0.8rem;">${chatTime}</td>
            <td style="padding: 12px 15px; text-align: right;">
                <button class="table-view-btn" onclick="viewConversation(${chat.id})">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchModerationLogs() {
    const tbody = document.getElementById('tableFlaggedList');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">Loading flagged logs...</td></tr>`;

    try {
        const res = await fetch('/admin/api/conversations?flagged_only=1');
        if (res.ok) {
            const flaggedData = await res.json();
            renderFlaggedLogs(flaggedData);

            const badge = document.getElementById('flaggedCountsBadge');
            if (badge) {
                badge.textContent = `${flaggedData.length} Flags Active`;
                badge.style.background = flaggedData.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)';
                badge.style.color = flaggedData.length > 0 ? '#ef4444' : 'var(--text-secondary)';
                badge.style.borderColor = flaggedData.length > 0 ? 'rgba(239, 68, 68, 0.25)' : 'transparent';
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger-color); font-weight: 500; padding: 30px;">Error: Failed to load logs.</td></tr>`;
        }
    } catch (err) {
        console.error('Failed to fetch flagged logs:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger-color); font-weight: 500; padding: 30px;">Error: Network connection failed.</td></tr>`;
    }
}

function renderFlaggedLogs(logs) {
    const tbody = document.getElementById('tableFlaggedList');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">No flagged items found.</td></tr>`;
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        const logTime = new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const truncatedQuery = log.query.length > 55 ? log.query.substring(0, 52) + '...' : log.query;

        tr.innerHTML = `
            <td style="padding: 12px 15px;">
                <div style="font-weight: 600; color: #fff;">${log.username}</div>
            </td>
            <td style="padding: 12px 15px; color: var(--text-primary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.query}">
                ${truncatedQuery}
            </td>
            <td style="padding: 12px 15px; font-weight: 500; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 0.85rem; margin-right: 4px;"></i>${log.flag_reason || 'Policy Violation'}
            </td>
            <td style="padding: 12px 15px; color: var(--text-secondary); font-size: 0.8rem;">${logTime}</td>
            <td style="padding: 12px 15px; text-align: right;">
                <div style="display: inline-flex; gap: 8px;">
                    <button class="table-view-btn" onclick="viewConversation(${log.id})" style="padding: 5px 10px;" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn btn-reset-pw" onclick="dismissFlag(${log.id})" style="padding: 5px 8px; border: 1px solid rgba(251, 191, 36, 0.2); background: rgba(251, 191, 36, 0.05); border-radius: 8px;" title="Dismiss Flag">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="deleteConversation(${log.id})" style="padding: 5px 8px; border: 1px solid rgba(244, 63, 94, 0.2); background: rgba(244, 63, 94, 0.05); border-radius: 8px;" title="Delete Query">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchChatAnalytics() {
    try {
        const res = await fetch('/admin/api/query-analytics');
        if (res.ok) {
            const data = await res.json();

            document.getElementById('chatAnalyticsTotal').textContent = data.total_queries;
            document.getElementById('chatAnalyticsFlagged').textContent = data.flagged_queries;
            document.getElementById('chatAnalyticsAvgLen').textContent = `${data.avg_query_length} ch`;

            renderKeywordsTags(data.top_keywords);
            renderActiveUsersList(data.top_users);
        }
    } catch (err) {
        console.error('Failed to fetch chat analytics:', err);
    }
}

function renderKeywordsTags(keywords) {
    const list = document.getElementById('analyticsKeywordsList');
    if (!list) return;
    list.innerHTML = '';

    if (keywords.length === 0) {
        list.innerHTML = `<span style="color: var(--text-secondary); font-style: italic;">No query data to analyze.</span>`;
        return;
    }

    keywords.forEach(item => {
        const span = document.createElement('span');
        span.className = 'badge';
        let colorStyle = 'background: rgba(102, 126, 234, 0.08); color: var(--accent-color); border: 1px solid rgba(102, 126, 234, 0.25);';
        if (item.count > 5) {
            colorStyle = 'background: rgba(251, 191, 36, 0.08); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.25);';
        }
        span.style = `${colorStyle} padding: 6px 12px; border-radius: 12px; font-weight: 500; font-size: 0.78rem; text-transform: none; display: flex; align-items: center; gap: 6px;`;
        span.innerHTML = `<strong>${item.word}</strong> <span style="opacity: 0.6; font-size: 0.7rem;">x${item.count}</span>`;
        list.appendChild(span);
    });
}

function renderActiveUsersList(users) {
    const tbody = document.getElementById('tableActiveUsersList');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 20px;">No user activity yet.</td></tr>`;
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 8px 10px; font-weight: 500; color: #fff;">${user.username}</td>
            <td style="padding: 8px 10px; color: var(--text-secondary);">${user.query_count} searches</td>
            <td style="padding: 8px 10px; color: #f43f5e; font-weight: 600;">-${user.credits_spent} credits</td>
        `;
        tbody.appendChild(tr);
    });
}

async function viewConversation(historyId) {
    let chat = adminConversationsData.find(c => c.id === historyId);
    if (!chat) {
        try {
            const res = await fetch(`/admin/api/conversations?search=&user_id=`);
            if (res.ok) {
                const list = await res.json();
                chat = list.find(c => c.id === historyId);
            }
        } catch (err) {
            console.error('Failed to fetch details on demand:', err);
        }
    }

    if (!chat) {
        showError('Unable to load conversation details.');
        return;
    }

    document.getElementById('convModalUser').textContent = chat.username;
    document.getElementById('convModalEmail').textContent = chat.email;
    document.getElementById('convModalDate').textContent = new Date(chat.created_at).toLocaleString();

    const box = document.getElementById('convModalMessages');
    if (box) {
        box.innerHTML = '';

        const userDiv = document.createElement('div');
        userDiv.className = 'message user';
        userDiv.style = 'align-self: flex-end; background: var(--accent-gradient); color: #fff; padding: 12px 16px; border-radius: 16px 16px 0 16px; max-width: 85%; font-size: 0.9rem; line-height: 1.4; box-shadow: var(--accent-glow); margin-left: auto;';
        userDiv.textContent = chat.query;
        box.appendChild(userDiv);

        const aiDiv = document.createElement('div');
        aiDiv.className = 'message ai';
        aiDiv.style = 'align-self: flex-start; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--card-border); color: var(--text-primary); padding: 12px 16px; border-radius: 16px 16px 16px 0; max-width: 85%; font-size: 0.9rem; line-height: 1.4; margin-right: auto; margin-top: 5px;';
        aiDiv.textContent = chat.response;
        box.appendChild(aiDiv);

        box.scrollTop = 0;
    }

    const overlay = document.getElementById('adminModalOverlay');
    const modal = document.getElementById('modalViewConversation');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active-modal');
    }
}

async function dismissFlag(historyId) {
    if (!confirm('Are you sure you want to dismiss the moderation flag on this query?')) return;

    try {
        const res = await fetch(`/admin/api/conversations/${historyId}/dismiss-flag`, {
            method: 'POST'
        });
        if (res.ok) {
            showSuccess('Content flag dismissed successfully.');
            fetchModerationLogs();
        } else {
            showError('Failed to dismiss flag.');
        }
    } catch (err) {
        showError('Network error. Dismiss flag request failed.');
    }
    setTimeout(hideSuccess, 2000);
}

async function deleteConversation(historyId) {
    if (!confirm('Are you sure you want to permanently delete this search query record from history?\nThis cannot be undone.')) return;

    try {
        const res = await fetch(`/admin/api/conversations/${historyId}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            showSuccess('Conversation record deleted successfully.');
            if (currentChatMgmtTab === 'history') {
                fetchChatConversations();
            } else if (currentChatMgmtTab === 'moderation') {
                fetchModerationLogs();
            }
        } else {
            showError('Failed to delete conversation.');
        }
    } catch (err) {
        showError('Network error. Delete conversation failed.');
    }
    setTimeout(hideSuccess, 2000);
}

// ==========================================================================
// Admin Analytics Charts Module
// ==========================================================================

function destroyAnalyticsCharts() {
    if (chartDailySearches) { chartDailySearches.destroy(); chartDailySearches = null; }
    if (chartResponseTimes) { chartResponseTimes.destroy(); chartResponseTimes = null; }
    if (chartTokenCost) { chartTokenCost.destroy(); chartTokenCost = null; }
    if (chartHourlyActivity) { chartHourlyActivity.destroy(); chartHourlyActivity = null; }
}

async function initAnalyticsPanel() {
    await fetchAnalyticsCharts(currentAnalyticsRange);
}

function switchAnalyticsRange(days) {
    currentAnalyticsRange = days;

    // Update toggle button states
    document.getElementById('rangeBtn7').classList.toggle('active', days === 7);
    document.getElementById('rangeBtn14').classList.toggle('active', days === 14);
    document.getElementById('rangeBtn30').classList.toggle('active', days === 30);

    fetchAnalyticsCharts(days);
}

async function fetchAnalyticsCharts(days) {
    try {
        const res = await fetch(`/admin/api/analytics-charts?days=${days}`);
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                showLoginForm('Session expired. Please login again.');
                return;
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        updateAnalyticsSummary(data.summary);
        renderAnalyticsCharts(data);
    } catch (err) {
        console.error('Failed to fetch analytics charts:', err);
    }
}

function updateAnalyticsSummary(summary) {
    const searchesEl = document.getElementById('analyticsSearchesToday');
    const responseEl = document.getElementById('analyticsAvgResponse');
    const tokensEl = document.getElementById('analyticsTotalTokens');
    const costEl = document.getElementById('analyticsEstCost');

    if (searchesEl) searchesEl.textContent = summary.searches_today;
    if (responseEl) responseEl.innerHTML = `${Math.round(summary.avg_response_today_ms)}<span style="font-size: 0.7em; opacity: 0.6;">ms</span>`;
    if (tokensEl) tokensEl.textContent = summary.total_tokens_period >= 1000
        ? (summary.total_tokens_period / 1000).toFixed(1) + 'K'
        : summary.total_tokens_period;
    if (costEl) costEl.textContent = `$${summary.total_cost_period_usd.toFixed(4)}`;
}

function getAnalyticsChartOptions(yLabel, tickCallback) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    font: { family: 'Outfit', size: 10 },
                    callback: tickCallback || function (v) { return v; }
                },
                title: {
                    display: !!yLabel,
                    text: yLabel || '',
                    color: 'rgba(255, 255, 255, 0.4)',
                    font: { family: 'Outfit', size: 11 }
                }
            },
            x: {
                grid: { display: false },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    font: { family: 'Outfit', size: 9 },
                    maxRotation: 45,
                    minRotation: 0
                }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15, 13, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: 'rgba(255,255,255,0.8)',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                cornerRadius: 10,
                padding: 12,
                titleFont: { family: 'Outfit', weight: '600' },
                bodyFont: { family: 'Outfit' }
            }
        },
        elements: {
            point: { radius: 3, hitRadius: 12, hoverRadius: 6, hoverBorderWidth: 2 },
            line: { tension: 0.4 }
        }
    };
}

function formatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderAnalyticsCharts(data) {
    // Destroy existing charts
    destroyAnalyticsCharts();

    const dailyLabels = data.daily_searches.map(d => formatDateLabel(d.search_date));

    // ---- 1. Daily Search Volume (Area Chart) ----
    const ctxSearches = document.getElementById('chartDailySearches');
    if (ctxSearches) {
        const ctx = ctxSearches.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, 'rgba(102, 126, 234, 0.25)');
        gradient.addColorStop(1, 'rgba(102, 126, 234, 0)');

        chartDailySearches = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dailyLabels,
                datasets: [{
                    label: 'Searches',
                    data: data.daily_searches.map(d => d.search_count),
                    borderColor: '#667eea',
                    borderWidth: 2.5,
                    fill: true,
                    backgroundColor: gradient,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: 'rgba(22, 20, 38, 0.9)',
                    pointBorderWidth: 2
                }]
            },
            options: {
                ...getAnalyticsChartOptions('Searches'),
                plugins: {
                    ...getAnalyticsChartOptions('Searches').plugins,
                    tooltip: {
                        ...getAnalyticsChartOptions('Searches').plugins.tooltip,
                        callbacks: {
                            label: ctx => `${ctx.parsed.y} searches`
                        }
                    }
                }
            }
        });
    }

    // ---- 2. Average Response Time (Line Chart with Band) ----
    const ctxResponse = document.getElementById('chartResponseTimes');
    if (ctxResponse) {
        const ctx = ctxResponse.getContext('2d');
        const gradientResp = ctx.createLinearGradient(0, 0, 0, 220);
        gradientResp.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
        gradientResp.addColorStop(1, 'rgba(16, 185, 129, 0)');

        const respLabels = data.daily_response_times.map(d => formatDateLabel(d.search_date));

        chartResponseTimes = new Chart(ctx, {
            type: 'line',
            data: {
                labels: respLabels,
                datasets: [
                    {
                        label: 'Max',
                        data: data.daily_response_times.map(d => d.max_response_ms),
                        borderColor: 'rgba(16, 185, 129, 0.2)',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: 'Avg Response Time',
                        data: data.daily_response_times.map(d => d.avg_response_ms),
                        borderColor: '#10b981',
                        borderWidth: 2.5,
                        fill: true,
                        backgroundColor: gradientResp,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: 'rgba(22, 20, 38, 0.9)',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Min',
                        data: data.daily_response_times.map(d => d.min_response_ms),
                        borderColor: 'rgba(16, 185, 129, 0.2)',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                ...getAnalyticsChartOptions('Response Time (ms)'),
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getAnalyticsChartOptions('').plugins.tooltip,
                        callbacks: {
                            label: ctx => {
                                if (ctx.datasetIndex === 0) return `Max: ${ctx.parsed.y}ms`;
                                if (ctx.datasetIndex === 1) return `Avg: ${ctx.parsed.y}ms`;
                                return `Min: ${ctx.parsed.y}ms`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ---- 3. Token Usage & Cost (Bar + Line Dual Chart) ----
    const ctxTokens = document.getElementById('chartTokenCost');
    if (ctxTokens) {
        const ctx = ctxTokens.getContext('2d');
        const tokenLabels = data.daily_tokens.map(d => formatDateLabel(d.search_date));

        chartTokenCost = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: tokenLabels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Input Tokens',
                        data: data.daily_tokens.map(d => d.input_tokens),
                        backgroundColor: 'rgba(251, 191, 36, 0.35)',
                        borderColor: 'rgba(251, 191, 36, 0.6)',
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'Output Tokens',
                        data: data.daily_tokens.map(d => d.output_tokens),
                        backgroundColor: 'rgba(244, 63, 94, 0.3)',
                        borderColor: 'rgba(244, 63, 94, 0.5)',
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 3
                    },
                    {
                        type: 'line',
                        label: 'Cost (USD)',
                        data: data.daily_tokens.map(d => d.estimated_cost_usd),
                        borderColor: '#f43f5e',
                        borderWidth: 2,
                        fill: false,
                        pointBackgroundColor: '#f43f5e',
                        pointBorderColor: 'rgba(22, 20, 38, 0.9)',
                        pointBorderWidth: 2,
                        pointRadius: 3,
                        yAxisID: 'yCost',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { family: 'Outfit', size: 10 }
                        },
                        title: {
                            display: true,
                            text: 'Tokens',
                            color: 'rgba(255, 255, 255, 0.4)',
                            font: { family: 'Outfit', size: 11 }
                        },
                        stacked: true
                    },
                    yCost: {
                        beginAtZero: true,
                        position: 'right',
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(244, 63, 94, 0.6)',
                            font: { family: 'Outfit', size: 10 },
                            callback: v => '$' + v.toFixed(4)
                        },
                        title: {
                            display: true,
                            text: 'Cost (USD)',
                            color: 'rgba(244, 63, 94, 0.5)',
                            font: { family: 'Outfit', size: 11 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { family: 'Outfit', size: 9 },
                            maxRotation: 45,
                            minRotation: 0
                        },
                        stacked: true
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255,255,255,0.6)',
                            font: { family: 'Outfit', size: 10 },
                            boxWidth: 12,
                            boxHeight: 12,
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'rectRounded'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 13, 30, 0.95)',
                        titleColor: '#fff',
                        bodyColor: 'rgba(255,255,255,0.8)',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        titleFont: { family: 'Outfit', weight: '600' },
                        bodyFont: { family: 'Outfit' },
                        callbacks: {
                            label: ctx => {
                                if (ctx.dataset.yAxisID === 'yCost') {
                                    return `Cost: $${ctx.parsed.y.toFixed(4)}`;
                                }
                                return `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} tokens`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ---- 4. Hourly Activity Today (Bar Chart) ----
    const ctxHourly = document.getElementById('chartHourlyActivity');
    if (ctxHourly) {
        const ctx = ctxHourly.getContext('2d');
        const gradientHourly = ctx.createLinearGradient(0, 0, 0, 220);
        gradientHourly.addColorStop(0, 'rgba(167, 139, 250, 0.5)');
        gradientHourly.addColorStop(1, 'rgba(167, 139, 250, 0.05)');

        const hourLabels = data.hourly_distribution.map(d => {
            const h = d.hour;
            if (h === 0) return '12 AM';
            if (h === 12) return '12 PM';
            return h > 12 ? `${h - 12} PM` : `${h} AM`;
        });

        const currentHour = new Date().getHours();
        const barColors = data.hourly_distribution.map(d =>
            d.hour === currentHour ? 'rgba(251, 191, 36, 0.6)' : 'rgba(167, 139, 250, 0.4)'
        );
        const barBorderColors = data.hourly_distribution.map(d =>
            d.hour === currentHour ? 'rgba(251, 191, 36, 0.9)' : 'rgba(167, 139, 250, 0.7)'
        );

        chartHourlyActivity = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: hourLabels,
                datasets: [{
                    label: 'Searches',
                    data: data.hourly_distribution.map(d => d.count),
                    backgroundColor: barColors,
                    borderColor: barBorderColors,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                ...getAnalyticsChartOptions('Searches'),
                scales: {
                    ...getAnalyticsChartOptions('Searches').scales,
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { family: 'Outfit', size: 8 },
                            maxRotation: 90,
                            minRotation: 45
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getAnalyticsChartOptions('').plugins.tooltip,
                        callbacks: {
                            title: ctx => ctx[0].label,
                            label: ctx => `${ctx.parsed.y} searches`,
                            afterLabel: ctx => {
                                const hourIdx = ctx.dataIndex;
                                return hourIdx === currentHour ? '← Current Hour' : '';
                            }
                        }
                    }
                }
            }
        });
    }
}

// ==========================================================================
// Security Module Methods
// ==========================================================================

function initSecurityPanel() {
    fetchSecuritySettings();
    fetchAuditLogs();
}

async function fetchSecuritySettings() {
    try {
        const res = await fetch('/admin/api/security/settings');
        if (res.ok) {
            const data = await res.json();
            if (data.rate_limit_rpm) {
                document.getElementById('securityRateLimit').value = data.rate_limit_rpm;
            }
            if (data.mfa_policy) {
                document.getElementById('securityMfaPolicy').value = data.mfa_policy;
            }
        } else {
            console.error('Failed to fetch security settings');
        }
    } catch (err) {
        console.error('Error fetching security settings:', err);
    }
}

async function saveSecuritySettings(e) {
    e.preventDefault();
    const rateLimit = document.getElementById('securityRateLimit').value;
    const mfaPolicy = document.getElementById('securityMfaPolicy').value;

    try {
        const res = await fetch('/admin/api/security/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rate_limit_rpm: rateLimit, mfa_policy: mfaPolicy })
        });
        
        if (res.ok) {
            showSuccess('Security settings saved successfully!');
            fetchAuditLogs(); // Refresh logs to show the update action
        } else {
            const err = await res.json();
            showError(err.error || 'Failed to save settings');
        }
    } catch (error) {
        console.error('Error saving security settings:', error);
        showError('Network error while saving settings');
    }
}

async function fetchAuditLogs() {
    const tbody = document.getElementById('tableAuditLogs');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">Loading audit logs...</td></tr>';
    
    try {
        const res = await fetch('/admin/api/security/audit_logs');
        if (res.ok) {
            const logs = await res.json();
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">No audit logs found.</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            logs.forEach(log => {
                const tr = document.createElement('tr');
                
                // Format event type for display
                let badgeClass = 'role-user';
                if (log.event_type.includes('failed') || log.event_type.includes('breach')) badgeClass = 'role-admin';
                else if (log.event_type.includes('success')) badgeClass = 'role-user';
                else badgeClass = 'role-admin'; // Use admin style for policy changes
                
                const eventHtml = `<span class="role-badge ${badgeClass}">${log.event_type.replace(/_/g, ' ')}</span>`;
                
                const userHtml = log.username ? `<i class="fas fa-user" style="color: #667eea; margin-right: 4px;"></i> ${log.username}` : `<span style="color: var(--text-secondary);">-</span>`;
                const ipHtml = log.ip_address || `<span style="color: var(--text-secondary);">-</span>`;
                
                const dateStr = new Date(log.created_at).toLocaleString();
                
                tr.innerHTML = `
                    <td style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">${eventHtml}</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">${userHtml}</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="font-family: monospace; color: var(--text-secondary);">${ipHtml}</span></td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #fff;">${log.details || '-'}</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-secondary); font-size: 0.75rem;">${dateStr}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 30px;">Failed to load logs.</td></tr>';
        }
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 30px;">Network error while loading logs.</td></tr>';
    }
}

// ==========================================================================
// System Module Methods
// ==========================================================================

function initSystemPanel() {
    fetchSystemSettings();
}

async function fetchSystemSettings() {
    try {
        const res = await fetch('/admin/api/system/settings');
        if (res.ok) {
            const data = await res.json();
            if (data.maintenance_mode) {
                document.getElementById('maintenanceMode').value = data.maintenance_mode;
            }
            if (data.backup_frequency) {
                document.getElementById('backupFrequency').value = data.backup_frequency;
            }
            if (data.backup_retention) {
                document.getElementById('backupRetention').value = data.backup_retention;
            }
        } else {
            console.error('Failed to fetch system settings');
        }
    } catch (err) {
        console.error('Error fetching system settings:', err);
    }
}

async function saveMaintenanceSettings(e) {
    e.preventDefault();
    const mode = document.getElementById('maintenanceMode').value;

    try {
        const res = await fetch('/admin/api/system/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maintenance_mode: mode })
        });
        
        if (res.ok) {
            showSuccess('Maintenance mode updated successfully!');
            fetchSystemSettings();
        } else {
            const err = await res.json();
            showError(err.error || 'Failed to update maintenance mode');
        }
    } catch (error) {
        console.error('Error updating maintenance mode:', error);
        showError('Network error while saving settings');
    }
}

async function saveBackupSettings(e) {
    e.preventDefault();
    const frequency = document.getElementById('backupFrequency').value;
    const retention = document.getElementById('backupRetention').value;

    try {
        const res = await fetch('/admin/api/system/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backup_frequency: frequency, backup_retention: retention })
        });
        
        if (res.ok) {
            showSuccess('Backup settings saved successfully!');
            fetchSystemSettings();
        } else {
            const err = await res.json();
            showError(err.error || 'Failed to save backup settings');
        }
    } catch (error) {
        console.error('Error saving backup settings:', error);
        showError('Network error while saving settings');
    }
}

async function clearSystemCache() {
    if (!confirm('Are you sure you want to clear temporary cache files?')) return;
    
    try {
        const res = await fetch('/admin/api/system/clear_cache', { method: 'POST' });
        
        if (res.ok) {
            showSuccess('Temporary cache files cleared successfully!');
        } else {
            const err = await res.json();
            showError(err.error || 'Failed to clear cache');
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
        showError('Network error while clearing cache');
    }
}

// ==========================================================================
// Logs Module Methods
// ==========================================================================

let logPollInterval = null;
let logAutoScroll = true;

function initLogsPanel() {
    fetchLogs();
    if (!logPollInterval) {
        logPollInterval = setInterval(fetchLogs, 2000);
    }
}

function stopPollingLogs() {
    if (logPollInterval) {
        clearInterval(logPollInterval);
        logPollInterval = null;
    }
}

async function fetchLogs() {
    try {
        const res = await fetch('/admin/api/logs/read');
        if (res.ok) {
            const data = await res.json();
            const logContent = document.getElementById('logViewerContent');
            const container = document.getElementById('logViewerContainer');
            
            if (data.logs && data.logs.length > 0) {
                // Add rudimentary color-coding based on log level
                const formattedLogs = data.logs.map(line => {
                    // Escape basic HTML to prevent XSS in logs
                    let safeLine = line.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    
                    if (safeLine.includes('ERROR') || safeLine.includes('Exception') || safeLine.includes('Traceback')) {
                        return `<span style="color: #ef4444; font-weight: bold;">${safeLine}</span>`;
                    } else if (safeLine.includes('WARNING')) {
                        return `<span style="color: #fbbf24;">${safeLine}</span>`;
                    } else if (safeLine.includes('INFO')) {
                        return `<span style="color: #4ade80;">${safeLine}</span>`;
                    } else if (safeLine.includes('DEBUG')) {
                        return `<span style="color: #60a5fa;">${safeLine}</span>`;
                    }
                    return safeLine;
                }).join('\n');
                
                logContent.innerHTML = formattedLogs;
                
                if (logAutoScroll) {
                    container.scrollTop = container.scrollHeight;
                }
            } else {
                logContent.innerHTML = 'No logs available.';
            }
        }
    } catch (err) {
        console.error('Error fetching logs:', err);
    }
}

function toggleLogAutoScroll() {
    logAutoScroll = !logAutoScroll;
    const btn = document.getElementById('btnLogAutoScroll');
    if (logAutoScroll) {
        btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
        const container = document.getElementById('logViewerContainer');
        container.scrollTop = container.scrollHeight;
    } else {
        btn.innerHTML = '<i class="fas fa-play"></i> Resume';
    }
}

function clearLogViewer() {
    document.getElementById('logViewerContent').innerHTML = '<i>Local viewer cleared. Waiting for new entries...</i>';
}

// ==========================================================================
// AI Configuration Module Methods
// ==========================================================================

function initAiConfigPanel() {
    fetchAiSettings();
}

async function fetchAiSettings() {
    try {
        const res = await fetch('/admin/api/ai/settings');
        if (res.ok) {
            const data = await res.json();
            
            // Populate available models
            const checkboxes = document.querySelectorAll('input[name="available_models"]');
            checkboxes.forEach(cb => {
                if (data.available_models && data.available_models.includes(cb.value)) {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
            });

            // Populate text/number fields
            if (data.system_prompt) {
                document.getElementById('systemPrompt').value = data.system_prompt;
            }
            if (data.max_tokens) {
                document.getElementById('maxTokens').value = data.max_tokens;
            }
        } else {
            console.error('Failed to fetch AI settings');
        }
    } catch (err) {
        console.error('Error fetching AI settings:', err);
    }
}

async function saveAiSettings(e) {
    e.preventDefault();
    
    // Gather checked models
    const checkboxes = document.querySelectorAll('input[name="available_models"]:checked');
    const available_models = Array.from(checkboxes).map(cb => cb.value);
    
    const system_prompt = document.getElementById('systemPrompt').value;
    const max_tokens = document.getElementById('maxTokens').value;

    try {
        const res = await fetch('/admin/api/ai/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                available_models: available_models,
                system_prompt: system_prompt,
                max_tokens: max_tokens
            })
        });
        
        if (res.ok) {
            showSuccess('AI configurations saved successfully!');
            fetchAiSettings();
        } else {
            const err = await res.json();
            showError(err.error || 'Failed to save AI configurations');
        }
    } catch (error) {
        console.error('Error saving AI configurations:', error);
        showError('Network error while saving AI configurations');
    }
}

// ==========================================================================
// Feedback Module Methods
// ==========================================================================

function initFeedbackPanel() {
    fetchFeedbackStats();
    fetchResponseRatings('all');
    fetchGeneralFeedback('all');
}

function switchFeedbackTab(tabId) {
    document.querySelectorAll('#panel-feedback .auth-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#panel-feedback .feedback-section').forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
    });

    if (tabId === 'responses') {
        document.getElementById('tabFeedbackResponses').classList.add('active');
        const section = document.getElementById('feedback-responses');
        section.style.display = 'flex';
        section.classList.add('active');
    } else {
        document.getElementById('tabFeedbackGeneral').classList.add('active');
        const section = document.getElementById('feedback-general');
        section.style.display = 'flex';
        section.classList.add('active');
    }
}

async function fetchFeedbackStats() {
    try {
        const res = await fetch('/admin/api/feedback/stats');
        if (res.ok) {
            const data = await res.json();
            document.getElementById('feedbackThumbsUp').textContent = data.thumbs_up || 0;
            document.getElementById('feedbackThumbsDown').textContent = data.thumbs_down || 0;
            document.getElementById('feedbackSatisfaction').innerHTML = `${data.satisfaction_pct || 0}<span style="font-size: 0.7em; opacity: 0.6;">%</span>`;
            document.getElementById('feedbackPending').textContent = data.pending_feedback || 0;
            
            // Render satisfaction chart
            renderSatisfactionChart(data.thumbs_up, data.thumbs_down);
        }
    } catch (err) {
        console.error('Error fetching feedback stats:', err);
    }
}

function renderSatisfactionChart(up, down) {
    const ctx = document.getElementById('chartSatisfaction');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (window.satisfactionChartInstance) {
        window.satisfactionChartInstance.destroy();
    }

    if (up === 0 && down === 0) {
        document.getElementById('satisfactionLabel').textContent = 'No data yet';
        return;
    }
    document.getElementById('satisfactionLabel').textContent = '';

    window.satisfactionChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Thumbs Up', 'Thumbs Down'],
            datasets: [{
                data: [up, down],
                backgroundColor: ['#10b981', '#f43f5e'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function filterResponseRatings(filter) {
    document.querySelectorAll('#filterRatingAll, #filterRatingUp, #filterRatingDown').forEach(btn => btn.classList.remove('active'));
    if (filter === 'all') document.getElementById('filterRatingAll').classList.add('active');
    else if (filter === 'up') document.getElementById('filterRatingUp').classList.add('active');
    else if (filter === 'down') document.getElementById('filterRatingDown').classList.add('active');

    fetchResponseRatings(filter);
}

async function fetchResponseRatings(filter) {
    const tbody = document.getElementById('tableResponseRatings');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">Loading ratings...</td></tr>';
    
    try {
        const res = await fetch(`/admin/api/feedback/responses?filter=${filter}`);
        if (res.ok) {
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">No response ratings found.</td></tr>';
                return;
            }
            
            let html = '';
            data.forEach(row => {
                const date = new Date(row.created_at).toLocaleString();
                const icon = row.rating === 'up' ? '<i class="fas fa-thumbs-up" style="color: #10b981;"></i>' : '<i class="fas fa-thumbs-down" style="color: #f43f5e;"></i>';
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px; color: #fff;">${row.username || 'Unknown'}</td>
                        <td style="padding: 12px; color: var(--text-secondary);">${row.search_query || 'N/A'}</td>
                        <td style="padding: 12px;">${icon}</td>
                        <td style="padding: 12px; color: var(--text-secondary); font-size: 0.8rem;">${date}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 30px;">Failed to load ratings.</td></tr>';
        }
    } catch (err) {
        console.error('Error fetching response ratings:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 30px;">Network error while fetching ratings.</td></tr>';
    }
}

function filterGeneralFeedback(filter) {
    document.querySelectorAll('#filterFbAll, #filterFbNew, #filterFbReviewed, #filterFbResolved').forEach(btn => btn.classList.remove('active'));
    
    if (filter === 'all') document.getElementById('filterFbAll').classList.add('active');
    else if (filter === 'new') document.getElementById('filterFbNew').classList.add('active');
    else if (filter === 'reviewed') document.getElementById('filterFbReviewed').classList.add('active');
    else if (filter === 'resolved') document.getElementById('filterFbResolved').classList.add('active');

    fetchGeneralFeedback(filter);
}

async function fetchGeneralFeedback(filter) {
    const tbody = document.getElementById('tableGeneralFeedback');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">Loading feedback...</td></tr>';
    
    try {
        const res = await fetch(`/admin/api/feedback/general?status=${filter}`);
        if (res.ok) {
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); font-style: italic; padding: 30px;">No general feedback found.</td></tr>';
                return;
            }
            
            let html = '';
            data.forEach(row => {
                const date = new Date(row.created_at).toLocaleString();
                let statusColor = '#fbbf24'; // new
                if (row.status === 'reviewed') statusColor = '#60a5fa';
                if (row.status === 'resolved') statusColor = '#10b981';
                
                // Make sure message is safely escaped
                const safeMessage = (row.message || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const safeEmail = (row.email || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const safeUser = (row.username || 'Unknown').replace(/</g, "&lt;").replace(/>/g, "&gt;");
                
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px; color: #fff;">
                            ${safeUser}
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">${safeEmail}</div>
                        </td>
                        <td style="padding: 12px; color: #a78bfa;">${row.category}</td>
                        <td style="padding: 12px; color: #d1d5db; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeMessage.replace(/"/g, '&quot;')}">${safeMessage}</td>
                        <td style="padding: 12px;">
                            <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; background: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor}40;">
                                ${row.status.toUpperCase()}
                            </span>
                        </td>
                        <td style="padding: 12px; color: var(--text-secondary); font-size: 0.8rem;">${date}</td>
                        <td style="padding: 12px; text-align: right;">
                            <select onchange="updateFeedbackStatus(${row.id}, this.value)" style="padding: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; font-size: 0.8rem; outline: none; cursor: pointer;">
                                <option value="new" ${row.status === 'new' ? 'selected' : ''} style="color: #000;">New</option>
                                <option value="reviewed" ${row.status === 'reviewed' ? 'selected' : ''} style="color: #000;">Reviewed</option>
                                <option value="resolved" ${row.status === 'resolved' ? 'selected' : ''} style="color: #000;">Resolved</option>
                            </select>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 30px;">Failed to load feedback.</td></tr>';
        }
    } catch (err) {
        console.error('Error fetching general feedback:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 30px;">Network error while fetching feedback.</td></tr>';
    }
}

async function updateFeedbackStatus(id, newStatus) {
    try {
        const res = await fetch(`/admin/api/feedback/general/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            showSuccess('Feedback status updated');
            fetchFeedbackStats(); // Update pending count
            
            // Refresh current active filter
            const activeFilterBtn = document.querySelector('#filterFbAll.active, #filterFbNew.active, #filterFbReviewed.active, #filterFbResolved.active');
            if (activeFilterBtn) {
                const filterMap = {
                    'filterFbAll': 'all',
                    'filterFbNew': 'new',
                    'filterFbReviewed': 'reviewed',
                    'filterFbResolved': 'resolved'
                };
                fetchGeneralFeedback(filterMap[activeFilterBtn.id]);
            }
        } else {
            const err = await res.json();
            showError(err.error || 'Failed to update status');
        }
    } catch (err) {
        console.error('Error updating feedback status:', err);
        showError('Network error while updating status');
    }
}
