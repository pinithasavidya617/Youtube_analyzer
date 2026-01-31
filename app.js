
const API_BASE = 'http://127.0.0.1:8000';

// STATE
let currentVideoId = null;
let currentUrl = '';
let analysisData = null;
let quizData = null;

// DOM ELEMENTS
const urlInput = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const quizBtn = document.getElementById('quizBtn');
const validationMsg = document.getElementById('validationMsg');
const statusMessage = document.getElementById('statusMessage');
const resultsArea = document.getElementById('resultsArea');

// Analysis Elements
const videoContainer = document.getElementById('videoContainer');
const videoTitle = document.getElementById('videoTitle');
const topicsList = document.getElementById('topicsList');
const summaryText = document.getElementById('summaryText');
const audienceText = document.getElementById('audienceText');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const downloadAnalysisBtn = document.getElementById('downloadAnalysisBtn');

// Quiz Elements
const quizList = document.getElementById('quizList');
const copyQuizBtn = document.getElementById('copyQuizBtn');
const downloadQuizBtn = document.getElementById('downloadQuizBtn');

// INIT
document.addEventListener('DOMContentLoaded', () => {
    // Restore last URL
    const lastUrl = localStorage.getItem('last_yt_url');
    if (lastUrl) {
        urlInput.value = lastUrl;
        validateInput(lastUrl);
    }

    // Listeners
    urlInput.addEventListener('input', (e) => validateInput(e.target.value));
    analyzeBtn.addEventListener('click', handleAnalyze);
    quizBtn.addEventListener('click', handleQuiz);

    copySummaryBtn.addEventListener('click', () => copyToClipboard(analysisData ? analysisData.summary : '', 'Summary copied!'));
    copyQuizBtn.addEventListener('click', () => copyToClipboard(JSON.stringify(quizData, null, 2), 'Quiz JSON copied!'));

    downloadAnalysisBtn.addEventListener('click', () => downloadJson(analysisData, 'analysis_result.json'));
    downloadQuizBtn.addEventListener('click', () => downloadJson(quizData, 'quiz_result.json'));
});

// HELPERS
function validateInput(url) {
    const isValid = isValidYoutubeUrl(url);
    if (!url) {
        validationMsg.textContent = '';
        toggleButtons(false);
        return;
    }

    if (isValid) {
        validationMsg.textContent = '';
        currentUrl = url;
        currentVideoId = extractVideoId(url);
        toggleButtons(true);
    } else {
        validationMsg.textContent = 'Please enter a valid YouTube URL';
        toggleButtons(false);
    }
}

function isValidYoutubeUrl(url) {
    const p = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})(.*)?$/;
    return url.match(p);
}

function extractVideoId(url) {
    const match = url.match(/^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    return match ? match[4] : null;
}

function toggleButtons(enable) {
    analyzeBtn.disabled = !enable;
    quizBtn.disabled = !enable;
}

// API HANDLERS
async function handleAnalyze() {
    if (!currentUrl) return;

    setLoading(analyzeBtn, true);
    clearStatus();
    saveToStorage(currentUrl);

    try {
        renderVideoEmbed(currentVideoId);
        resultsArea.classList.remove('hidden'); 

        const response = await fetch(`${API_BASE}/analyzer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: currentUrl })
        });

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);

        const data = await response.json();
        analysisData = data;
        renderAnalysis(data);
        showStatus('Analysis complete!', 'success');

    } catch (err) {
        console.error(err);
        showStatus(`Failed to analyze: ${err.message}. Is backend running?`, 'error');
    } finally {
        setLoading(analyzeBtn, false);
    }
}

async function handleQuiz() {
    if (!currentUrl) return;

    setLoading(quizBtn, true);
    clearStatus();
    saveToStorage(currentUrl);

    try {
        const response = await fetch(`${API_BASE}/generate_quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: currentUrl })
        });

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);

        const data = await response.json();
        
        quizData = data; 
        renderQuiz(data.questions);
        resultsArea.classList.remove('hidden'); 
        showStatus('Quiz generated!', 'success');

    } catch (err) {
        console.error(err);
        showStatus(`Failed to generate quiz: ${err.message}`, 'error');
    } finally {
        setLoading(quizBtn, false);
    }
}

// RENDERING
function renderVideoEmbed(videoId) {
    if (!videoId) return;
    videoContainer.innerHTML = `
        <iframe 
            src="https://www.youtube.com/embed/${videoId}" 
            title="YouTube video player" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
        </iframe>
    `;
    videoTitle.textContent = `Video ID: ${videoId}`; /
}

function renderAnalysis(data) {
    // 1. Topics
    topicsList.innerHTML = '';
    const topics = data.main_topics || data.key_topics;
    if (topics && Array.isArray(topics)) {
        topics.forEach(topic => {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = topic;
            topicsList.appendChild(chip);
        });
    }

    // 2. Summary
    summaryText.textContent = data.summary || 'No summary available.';

    // 3. Audience
    audienceText.textContent = data.recommended_audience || 'No audience recommendation.';
}

function renderQuiz(questions) {
    quizList.innerHTML = '';

    if (!questions || questions.length === 0) {
        quizList.innerHTML = '<p class="text-muted">No questions generated.</p>';
        return;
    }

    questions.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = 'quiz-item-card';

        // Header
        const header = document.createElement('button');
        header.className = 'quiz-question-header';
        header.innerHTML = `
            <span>${index + 1}. ${q.question}</span>
            <span class="chevron">▼</span>
        `;

        // Options Container
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'quiz-options';

        let optionsToRender = [];
        let correctKey = q.correct || q.correct_answer; // Handle 'correct' (spec) or 'correct_answer' (backend)

        if (Array.isArray(q.options)) {
            q.options.forEach((opt, i) => {
                const key = String.fromCharCode(65 + i); // A, B, C...
                optionsToRender.push({ key, val: opt });
            });
        } else if (q.options && typeof q.options === 'object') {
            Object.entries(q.options).forEach(([key, val]) => {
                optionsToRender.push({ key, val });
            });
        }

        // Options buttons
        optionsToRender.forEach(({ key, val }) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = `${key}) ${val}`;

            // Interaction
            btn.addEventListener('click', () => {
                const allOpts = optionsDiv.querySelectorAll('.option-btn');
                allOpts.forEach(opt => opt.classList.remove('selected', 'correct'));

                const isCorrect = (correctKey === key) || (correctKey && correctKey.startsWith(key)) || (correctKey === val);

                if (isCorrect) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('selected');
                    allOpts.forEach(opt => {
                        const optText = opt.textContent;
                        if ((correctKey === key) || (correctKey && correctKey.startsWith(key)) || (correctKey === val)) {
                            opt.classList.add('correct');
                        }
                    });
                }
            });

            optionsDiv.appendChild(btn);
        });

        // Toggle Expand
        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });

        card.appendChild(header);
        card.appendChild(optionsDiv);
        quizList.appendChild(card);
    });
}

// UTILS
function setLoading(btnElement, isLoading) {
    if (isLoading) {
        btnElement.classList.add('loading');
        btnElement.disabled = true;
        urlInput.disabled = true;
    } else {
        btnElement.classList.remove('loading');
        btnElement.disabled = false;
        urlInput.disabled = false;
    }
}

function showStatus(msg, type = 'info') { 
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
}

function clearStatus() {
    statusMessage.classList.add('hidden');
    statusMessage.textContent = '';
}

function saveToStorage(url) {
    localStorage.setItem('last_yt_url', url);
}

function copyToClipboard(text, successMsg) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const originalStatus = statusMessage.textContent;
        showStatus(successMsg, 'success');
        setTimeout(() => {
            clearStatus();
        }, 2000);
    }).catch(err => {
        console.error('Copy failed', err);
    });
}

function downloadJson(data, filename) {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
