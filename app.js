// Load API key from config file
let API_KEY = '';
let API_URL = 'https://api.openai.com/v1/chat/completions';
let conversationHistory = [];
let searchHistoryData = []; // Cached history data for filtering

// Fetch config on load
fetch('config.js?t=' + Date.now())
    .then(response => response.text())
    .then(text => {
        const apiKeyMatch = text.match(/(?:^|\n)\s*const\s+API_KEY\s*=\s*["']([^"']+)["']/);
        const apiUrlMatch = text.match(/(?:^|\n)\s*const\s+API_URL\s*=\s*["']([^"']+)["']/);

        if (apiKeyMatch) API_KEY = apiKeyMatch[1];
        if (apiUrlMatch) API_URL = apiUrlMatch[1];
    })
    .catch(err => console.error('Failed to load config:', err));

// DOM Elements - Search Page
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const output = document.getElementById('output');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const successDiv = document.getElementById('successAlert');

// DOM Elements - Authentication
const mainContainer = document.getElementById('mainContainer');
const authContainer = document.getElementById('authContainer');
const searchContainer = document.getElementById('searchContainer');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const userAvatar = document.getElementById('userAvatar');
const displayUsername = document.getElementById('displayUsername');

// DOM Elements - Sidebar Nav
const sidebar = document.getElementById('sidebar');
const historyBox = document.getElementById('historyBox');
const historySearch = document.getElementById('historySearch');
const dashboardBtn = document.getElementById('dashboardBtn');
const newChatBtn = document.getElementById('newChatBtn');

// DOM Elements - Dashboard Stats & Table
const dashboardPanel = document.getElementById('dashboardPanel');
const chatPanel = document.getElementById('chatPanel');
const dashboardUser = document.getElementById('dashboardUser');
const totalSearchesCount = document.getElementById('totalSearchesCount');
const recentSearchesTableBody = document.getElementById('recentSearchesTableBody');

// Check user session on load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// Check if user session is active (queries Flask backend)
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const user = await res.json();
            showDashboard(user);
        } else {
            showLoginScreen();
        }
    } catch (err) {
        console.error('Session check failed:', err);
        showLoginScreen();
    }
}

// Show login panel and hide chat interface
function showLoginScreen() {
    mainContainer.classList.remove('dashboard-mode');
    authContainer.style.display = 'block';
    searchContainer.classList.remove('active');
    hideError();
}

// Show chat dashboard and hide login panel
function showDashboard(user) {
    mainContainer.classList.add('dashboard-mode');
    authContainer.style.display = 'none';
    searchContainer.classList.add('active');

    // Update profile info
    displayUsername.textContent = user.username;
    userAvatar.textContent = user.username.charAt(0).toUpperCase();

    if (dashboardUser) {
        dashboardUser.textContent = user.username;
    }

    // Update credit balance count
    const creditEl = document.getElementById('creditBalanceCount');
    if (creditEl && user.credits !== undefined) {
        creditEl.textContent = user.credits;
    }

    // Clear login inputs
    loginForm.reset();
    registerForm.reset();
    hideError();

    // Load search history from MySQL and open dashboard view
    loadSearchHistory().then(() => {
        showDashboardView();
    });
}

// Switch between Login and Register tabs
function switchTab(tab) {
    hideError();
    if (tab === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    }
}

// Handle login form submission
async function handleLogin(e) {
    e.preventDefault();
    hideError();

    const userOrEmail = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernameOrEmail: userOrEmail, password: pass, rememberMe })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess('Login successful! Connecting...');
            setTimeout(() => {
                hideSuccess();
                showDashboard(data.user);
            }, 800);
        } else {
            showError(data.error || 'Invalid credentials.');
            animateShake(loginForm);
        }
    } catch (err) {
        showError('Network error. Failed to log in.');
        animateShake(loginForm);
    }
}

// Handle register form submission
async function handleRegister(e) {
    e.preventDefault();
    hideError();

    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;

    // Validations
    if (username.length < 3) {
        showError('Username must be at least 3 characters.');
        animateShake(registerForm);
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        animateShake(registerForm);
        return;
    }

    if (password !== passwordConfirm) {
        showError('Passwords do not match.');
        animateShake(registerForm);
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess('Registration successful! Please log in.');
            setTimeout(() => {
                hideSuccess();
                switchTab('login');
                document.getElementById('loginUser').value = username;
                document.getElementById('loginPassword').focus();
            }, 1200);
        } else {
            showError(data.error || 'Registration failed.');
            animateShake(registerForm);
        }
    } catch (err) {
        showError('Network error. Failed to register.');
        animateShake(registerForm);
    }
}

// Handle logout
async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
        console.error('Logout request failed:', err);
    }

    // Reset conversation history & layout UI
    conversationHistory = [];
    searchHistoryData = [];
    output.innerHTML = '';
    output.classList.add('empty');
    historyBox.innerHTML = '';
    historySearch.value = '';

    showSuccess('Logged out successfully.');

    setTimeout(() => {
        hideSuccess();
        showLoginScreen();
    }, 800);
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

// Fetch search history list from MySQL
async function loadSearchHistory() {
    try {
        const res = await fetch('/api/history');
        if (res.ok) {
            searchHistoryData = await res.json();
            renderHistoryItems(searchHistoryData);
            updateDashboardStatsAndTable();

            // Sync credit balance
            const meRes = await fetch('/api/me');
            if (meRes.ok) {
                const meData = await meRes.json();
                const creditEl = document.getElementById('creditBalanceCount');
                if (creditEl && meData.credits !== undefined) {
                    creditEl.textContent = meData.credits;
                }
            }
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

// Render search history items in the sidebar list box
function renderHistoryItems(items) {
    historyBox.innerHTML = '';
    if (items.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.color = 'var(--text-secondary)';
        emptyDiv.style.fontSize = '0.85rem';
        emptyDiv.style.marginTop = '20px';
        emptyDiv.style.fontStyle = 'italic';
        emptyDiv.textContent = 'No search history';
        historyBox.appendChild(emptyDiv);
        return;
    }

    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        itemDiv.textContent = item.query;
        itemDiv.title = item.query;
        itemDiv.onclick = () => loadHistoryItem(item);
        historyBox.appendChild(itemDiv);
    });
}

// Filter listed history questions based on sidebar search input
function filterHistory() {
    const filterQuery = historySearch.value.toLowerCase().trim();
    const filtered = searchHistoryData.filter(item =>
        item.query.toLowerCase().includes(filterQuery)
    );
    renderHistoryItems(filtered);
}

// Load a historical search and display query/response instantly in active chat screen
function loadHistoryItem(item) {
    // Reset active button styling
    dashboardBtn.classList.remove('active');
    newChatBtn.classList.remove('active');

    // Panel toggles
    dashboardPanel.classList.remove('active');
    chatPanel.classList.add('active');

    // Set active item styling
    document.querySelectorAll('.history-item').forEach(el => {
        if (el.textContent === item.query) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    output.classList.remove('empty');
    output.innerHTML = '';

    // Add user query bubble
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'message user';
    userMsgDiv.textContent = item.query;
    output.appendChild(userMsgDiv);

    // Add assistant response bubble
    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'message ai';
    aiMsgDiv.textContent = item.response;
    output.appendChild(aiMsgDiv);

    // Add feedback action bar for this history item
    appendFeedbackBar(aiMsgDiv, item.id);

    // Reset current conversation history to just this item
    conversationHistory = [
        { role: 'user', content: item.query },
        { role: 'assistant', content: item.response }
    ];

    output.scrollTop = output.scrollHeight;
}

// Sidebar action: Dashboard (Reset view)
function showDashboardView() {
    dashboardBtn.classList.add('active');
    newChatBtn.classList.remove('active');
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));

    // Panel toggles
    dashboardPanel.classList.add('active');
    chatPanel.classList.remove('active');

    updateDashboardStatsAndTable();
}

// Sidebar action: New Chat (Clear screen)
function startNewChat() {
    dashboardBtn.classList.remove('active');
    newChatBtn.classList.add('active');
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));

    // Panel toggles
    dashboardPanel.classList.remove('active');
    chatPanel.classList.add('active');

    // Clear chat area
    conversationHistory = [];
    output.innerHTML = '';
    output.classList.add('empty');
    searchInput.value = '';
}

// Update dashboard stats and recent searches table
function updateDashboardStatsAndTable() {
    if (totalSearchesCount) {
        totalSearchesCount.textContent = searchHistoryData.length;
    }
    if (recentSearchesTableBody) {
        renderRecentSearchesTable(searchHistoryData);
    }
}

// Render the recent searches table (Last 10 queries)
function renderRecentSearchesTable(items) {
    recentSearchesTableBody.innerHTML = '';
    const recent10 = items.slice(0, 10);

    if (recent10.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.style.textAlign = 'center';
        td.style.color = 'var(--text-secondary)';
        td.style.fontStyle = 'italic';
        td.textContent = 'No searches performed yet.';
        tr.appendChild(td);
        recentSearchesTableBody.appendChild(tr);
        return;
    }

    recent10.forEach(item => {
        const tr = document.createElement('tr');

        // Query Column
        const tdQuery = document.createElement('td');
        const truncatedQuery = item.query.length > 55 ? item.query.substring(0, 52) + '...' : item.query;
        tdQuery.textContent = truncatedQuery;
        tdQuery.title = item.query;
        tr.appendChild(tdQuery);

        // Timestamp Column
        const tdDate = document.createElement('td');
        const date = new Date(item.created_at);
        tdDate.textContent = date.toLocaleString();
        tr.appendChild(tdDate);

        // Action Column (View button)
        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'table-view-btn';
        btn.innerHTML = '<i class="fas fa-eye"></i> View';
        btn.onclick = () => loadHistoryItem(item);
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        recentSearchesTableBody.appendChild(tr);
    });
}

// Shake animation helper for error states
function animateShake(element) {
    element.classList.add('shake');
    setTimeout(() => {
        element.classList.remove('shake');
    }, 400);
}

// Error Alerts
function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.add('active');
}

// Success Alerts
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

// Allow Enter key to submit search
searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendRequest();
    }
});

// Protect request function and execute AI search query
async function sendRequest() {
    // Basic session security check
    try {
        const sessionRes = await fetch('/api/me');
        if (!sessionRes.ok) {
            showError('Authentication required. Please log in.');
            showLoginScreen();
            return;
        }
        const sessionData = await sessionRes.json();
        if (sessionData.credits < 5) {
            showError('Insufficient credits. Each search query costs 5 credits.');
            return;
        }
    } catch (err) {
        showError('Session authentication failed.');
        showLoginScreen();
        return;
    }

    const query = searchInput.value.trim();

    if (!query) {
        showError('Please enter a question.');
        return;
    }

    if (!API_KEY || API_KEY === 'your-api-key-here') {
        showError('Please set your API key in config.js file.');
        return;
    }

    // Automatically resolve proper API URL based on key prefix
    let activeApiUrl = API_URL;
    if (API_KEY.startsWith('gsk_')) {
        activeApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (API_KEY.startsWith('sk-')) {
        activeApiUrl = 'https://api.openai.com/v1/chat/completions';
    } else if (API_KEY.startsWith('AIzaSy')) {
        activeApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    }

    // Clear search input and errors
    searchInput.value = '';
    hideError();

    // Remove empty placeholder class
    output.classList.remove('empty');

    // Append user message bubble to output box
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'message user';
    userMsgDiv.textContent = query;
    output.appendChild(userMsgDiv);
    output.scrollTop = output.scrollHeight;

    // Push to history
    conversationHistory.push({ role: 'user', content: query });
    if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
    }

    loading.classList.add('active');
    searchBtn.disabled = true;

    try {
        const isGemini = activeApiUrl.includes('googleapis.com') || activeApiUrl.includes('gemini');

        let headers = {
            'Content-Type': 'application/json'
        };
        let body = {};
        let requestUrl = activeApiUrl;

        if (isGemini) {
            // Gemini API uses key query param or x-goog-api-key header.
            if (!requestUrl.includes('?key=')) {
                requestUrl = `${requestUrl}?key=${API_KEY}`;
            }

            // Map history to Gemini contents format
            const geminiContents = conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            body = {
                contents: geminiContents,
                systemInstruction: {
                    parts: [{ text: "You are a helpful assistant. For any user input, you must respond in a conversational way and include a clear definition and exactly one practical example." }]
                }
            };
        } else {
            // Default to OpenAI / OpenAI-compatible formatting
            headers['Authorization'] = `Bearer ${API_KEY}`;

            let model = 'gpt-3.5-turbo';
            if (activeApiUrl.includes('groq.com')) {
                model = 'llama-3.3-70b-versatile';
            }

            body = {
                model: model,
                messages: [
                    { role: 'system', content: "You are a helpful assistant. For any user input, you must respond in a conversational way and include a clear definition and exactly one practical example.#analyze the input if there is a query in input then send some examples otherwise if the input has conversational text then reply must be short and sweet." },
                    ...conversationHistory
                ],
                temperature: 0.7
            };
        }

        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || (errorData.error ? JSON.stringify(errorData.error) : `HTTP error! status: ${response.status}`);
            throw new Error(errorMsg);
        }

        const data = await response.json();
        let aiResponse = '';

        if (isGemini) {
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]) {
                aiResponse = data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Unexpected Gemini API response structure. Please check your API key or model.');
            }
        } else {
            if (data.choices && data.choices[0]?.message) {
                aiResponse = data.choices[0].message.content;
            } else {
                throw new Error('Unexpected OpenAI API response structure.');
            }
        }

        // Append AI message bubble and typewrite the response
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'message ai';
        output.appendChild(aiMsgDiv);
        output.scrollTop = output.scrollHeight;

        typeWriter(aiResponse, aiMsgDiv);

        // Store assistant response in history
        conversationHistory.push({ role: 'assistant', content: aiResponse });

        // Save successfully executed search in MySQL database
        saveSearchHistoryItem(query, aiResponse);

    } catch (err) {
        showError('Error: ' + err.message);
        // Rollback history if request failed
        if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
            conversationHistory.pop();
        }
    } finally {
        loading.classList.remove('active');
        searchBtn.disabled = false;
    }
}

// Track the last saved history item ID for feedback
let lastSavedHistoryId = null;

// API Post to save search item in MySQL database
async function saveSearchHistoryItem(queryText, responseText) {
    try {
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: queryText, response: responseText })
        });
        if (res.ok) {
            const data = await res.json();
            const creditEl = document.getElementById('creditBalanceCount');
            if (creditEl && data.credits !== undefined) {
                creditEl.textContent = data.credits;
            }
            // Reload sidebar list to reflect new item (will automatically update dashboard stats and table)
            await loadSearchHistory();

            // Find the saved item's ID and attach feedback bar to the last AI message
            if (searchHistoryData.length > 0) {
                const savedItem = searchHistoryData[0]; // Most recent
                const aiMessages = output.querySelectorAll('.message.ai');
                if (aiMessages.length > 0) {
                    const lastAiMsg = aiMessages[aiMessages.length - 1];
                    if (!lastAiMsg.nextElementSibling || !lastAiMsg.nextElementSibling.classList.contains('feedback-action-bar')) {
                        appendFeedbackBar(lastAiMsg, savedItem.id);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Failed to post search history:', err);
    }
}

function typeWriter(text, element) {
    let i = 0;
    element.textContent = '';

    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            output.scrollTop = output.scrollHeight;
            setTimeout(type, 10);
        }
    }
    type();
}

// ==========================================================================
// Feedback Functions (Thumbs Up/Down + General Feedback Modal)
// ==========================================================================

function appendFeedbackBar(aiMsgElement, historyId) {
    const bar = document.createElement('div');
    bar.className = 'feedback-action-bar';
    bar.dataset.historyId = historyId;

    const btnUp = document.createElement('button');
    btnUp.className = 'feedback-btn';
    btnUp.innerHTML = '<i class="fas fa-thumbs-up"></i> Helpful';
    btnUp.onclick = () => submitResponseFeedback(historyId, 'up', bar);

    const btnDown = document.createElement('button');
    btnDown.className = 'feedback-btn';
    btnDown.innerHTML = '<i class="fas fa-thumbs-down"></i> Not helpful';
    btnDown.onclick = () => submitResponseFeedback(historyId, 'down', bar);

    bar.appendChild(btnUp);
    bar.appendChild(btnDown);

    // Insert the bar after the AI message
    aiMsgElement.parentNode.insertBefore(bar, aiMsgElement.nextSibling);

    // Check if user already rated this item
    loadExistingFeedback(historyId, bar);
}

async function loadExistingFeedback(historyId, bar) {
    try {
        const res = await fetch(`/api/feedback/response/${historyId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.rating) {
                applyFeedbackState(bar, data.rating);
            }
        }
    } catch (err) {
        // Silent fail
    }
}

async function submitResponseFeedback(historyId, rating, bar) {
    try {
        const res = await fetch('/api/feedback/response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history_id: historyId, rating })
        });
        if (res.ok) {
            applyFeedbackState(bar, rating);
        } else {
            const data = await res.json();
            showError(data.error || 'Failed to submit feedback.');
        }
    } catch (err) {
        showError('Network error. Feedback not submitted.');
    }
}

function applyFeedbackState(bar, rating) {
    const buttons = bar.querySelectorAll('.feedback-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active-up', 'active-down', 'disabled');
    });

    if (rating === 'up') {
        buttons[0].classList.add('active-up');
        buttons[1].classList.add('disabled');
    } else if (rating === 'down') {
        buttons[1].classList.add('active-down');
        buttons[0].classList.add('disabled');
    }
}

// General Feedback Modal
function openFeedbackModal() {
    const overlay = document.getElementById('feedbackModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
    }
}

function closeFeedbackModal() {
    const overlay = document.getElementById('feedbackModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    const form = document.getElementById('generalFeedbackForm');
    if (form) form.reset();
}

async function handleGeneralFeedback(e) {
    e.preventDefault();
    hideError();

    const category = document.getElementById('feedbackCategory').value;
    const message = document.getElementById('feedbackMessage').value.trim();
    const submitBtn = document.getElementById('feedbackSubmitBtn');

    if (!message) {
        showError('Please enter your feedback message.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        const res = await fetch('/api/feedback/general', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, message })
        });

        const data = await res.json();

        if (res.ok) {
            closeFeedbackModal();
            showSuccess(data.message || 'Feedback submitted successfully!');
            setTimeout(hideSuccess, 3000);
        } else {
            showError(data.error || 'Failed to submit feedback.');
        }
    } catch (err) {
        showError('Network error. Feedback not submitted.');
    }

    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit Feedback';
}