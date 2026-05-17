const SELECTORS = {
    scoreContainer: '.zYqAyf', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]',
    categoryLabel: '[jscontroller="lxw7Rd"]',
    weightTable: '[jscontroller="Sol5if"]',
    modalWrapper: '.g3V99b'
};

let dynamicCategoryWeights = null;
window.hasAutoClicked = false; 

window.scrolledCoursesRegistry = window.scrolledCoursesRegistry || {}; 
window.whatIfState = window.whatIfState || {}; 

if (!document.getElementById('what-if-loader-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'what-if-loader-styles';
    styleEl.textContent = `
        @keyframes whatIfColorThrob {
            0% { transform: scale(0.95); background-color: #1a73e8; box-shadow: 0 4px 15px rgba(26, 115, 232, 0.4); }
            25% { background-color: #ea4335; box-shadow: 0 4px 15px rgba(234, 67, 53, 0.4); }
            50% { transform: scale(1.05); background-color: #f9ab00; box-shadow: 0 4px 15px rgba(249, 171, 0, 0.4); }
            75% { background-color: #34a853; box-shadow: 0 4px 15px rgba(52, 168, 83, 0.4); }
            100% { transform: scale(0.95); background-color: #1a73e8; box-shadow: 0 4px 15px rgba(26, 115, 232, 0.4); }
        }
        .what-if-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(4px);
            z-index: 100000;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: opacity 0.3s ease-in-out;
            pointer-events: all;
        }
        .what-if-spinner {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            animation: whatIfColorThrob 3s infinite ease-in-out;
        }
        
        .what-if-donate-btn {
            position: fixed;
            bottom: 24px;
            left: 24px; /* FIXED: Shifted left to stay completely clear of the Help icon */
            z-index: 99999;
            border: none;
            border-radius: 20%; /* Made circular to act as a clean app badge icon button */
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease-in-out, background-color 0.2s;
            cursor: pointer;
        }
        .what-if-donate-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);
        }
        .what-if-donate-btn:active {
            transform: translateY(-1px);
            box-shadow: 0 4px 5px rgba(0,0,0,0.14);
        }
        .what-if-donate-icon {
            width: 64px;
            height: 64px;
            display: block;
            border-radius: 20%;
        }
    `;
    document.head.appendChild(styleEl);
}

function injectDonationButton() {
    if (document.getElementById('what-if-donate-anchor')) return;

    const donateLink = document.createElement('a');
    donateLink.id = 'what-if-donate-anchor';
    donateLink.className = 'what-if-donate-btn';
    
    donateLink.href = 'https://ko-fi.com/dareallando123'; 
    donateLink.target = '_blank';
    donateLink.rel = 'noopener noreferrer';
    
    let iconUrl = '';
    try {
        iconUrl = chrome.runtime.getURL('icon128.png');
    } catch (e) {
        iconUrl = 'icon128.png';
    }
    
    donateLink.innerHTML = `<img src="${iconUrl}" class="what-if-donate-icon" alt="What-If Logo">`;
    
    document.body.appendChild(donateLink);
}

function getCourseId() {
    const match = location.href.match(/\/c\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'unknown';
}

function generateAssignmentId(container, earned, possible, category) {
    let assignmentName = "UnknownAssignment";
    const nameEl = container.parentElement?.querySelector('h1, h2, h3, .A666Wd, .SUZp4e');
    if (nameEl) assignmentName = nameEl.textContent.trim();
    return `${getCourseId()}_${assignmentName}_${category}_${earned}_${possible}`;
}

function getScrollContainer() {
    const scoreSample = document.querySelector(SELECTORS.scoreContainer);
    if (!scoreSample) return window;

    let parent = scoreSample.parentElement;
    while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (parent.scrollHeight > parent.clientHeight && (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
            return parent;
        }
        parent = parent.parentElement;
    }
    return window;
}

function triggerAutoScrollLoad() {
    if (!location.href.includes('/sp/')) return;
    
    const courseId = getCourseId();
    if (window.scrolledCoursesRegistry[courseId]) return;

    const scrollTarget = getScrollContainer();
    if (!scrollTarget || document.querySelectorAll(SELECTORS.scoreContainer).length === 0) return;

    window.scrolledCoursesRegistry[courseId] = true;

    const overlay = document.createElement('div');
    overlay.className = 'what-if-overlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'what-if-spinner';
    
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    const isWindow = scrollTarget === window;
    const originalScrollTop = isWindow ? window.scrollY : scrollTarget.scrollTop;

    let lastRowCount = 0;
    let stableChecks = 0;

    const scrollInterval = setInterval(() => {
        const currentRowCount = document.querySelectorAll(SELECTORS.scoreContainer).length;

        if (isWindow) {
            window.scrollTo(0, document.body.scrollHeight);
        } else {
            scrollTarget.scrollTop = scrollTarget.scrollHeight;
        }

        if (currentRowCount === lastRowCount) {
            stableChecks++;
            if (stableChecks >= 4) { 
                clearInterval(scrollInterval);

                if (isWindow) {
                    window.scrollTo(0, originalScrollTop);
                } else {
                    scrollTarget.scrollTop = originalScrollTop;
                }

                // Smoothly fade out and remove overlay layout
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 300);

                injectHypotheticalInputs();
            }
        } else {
            stableChecks = 0; 
        }

        lastRowCount = currentRowCount;
    }, 100); 
}

function triggerNativeClick(el) {
    const courseId = getCourseId();
    const storageKey = 'gclass_weights_' + courseId;

    const modalObserver = new MutationObserver((mutations, observerInstance) => {
        const tableContainer = document.querySelector(SELECTORS.weightTable);
        const modalContainer = document.querySelector(SELECTORS.modalWrapper) || document.body.querySelector('[role="dialog"]');
        
        if (tableContainer && tableContainer.querySelectorAll('tr').length > 0) {
            modalObserver.disconnect(); 
            setTimeout(() => {
                scrapeCategoryWeights();
                location.reload();
            }, 50);
            return;
        }

        if (modalContainer && !tableContainer) {
            setTimeout(() => {
                const finalTableCheck = document.querySelector(SELECTORS.weightTable);
                if (!finalTableCheck) {
                    modalObserver.disconnect();
                    window.isKnownUnweighted = true;
                    dynamicCategoryWeights = null;
                    localStorage.setItem(storageKey, 'UNWEIGHTED');
                    location.reload();
                }
            }, 400);
        }
    });

    modalObserver.observe(document.body, { childList: true, subtree: true });

    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        el.dispatchEvent(new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        }));
    });

    setTimeout(() => modalObserver.disconnect(), 2500);
}

function scrapeCategoryWeights() {
    const tableContainer = document.querySelector(SELECTORS.weightTable);
    if (!tableContainer) return; 

    const rows = tableContainer.querySelectorAll('tr');
    const scrapedWeights = {};

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
            const catName = cells[0].textContent.trim();
            const weightText = cells[1].textContent.trim();
            if (weightText.includes('%')) {
                scrapedWeights[catName] = parseFloat(weightText) / 100;
            }
        }
    });

    if (Object.keys(scrapedWeights).length > 0) {
        dynamicCategoryWeights = scrapedWeights;
        localStorage.setItem('gclass_weights_' + getCourseId(), JSON.stringify(scrapedWeights));
        window.isKnownUnweighted = false;
    }
}

function getOverallGradeElement() {
    const potentialElements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of potentialElements) {
        if (el.textContent.includes('%') && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
}

function getDetailsElement() {
    const potentialElements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of potentialElements) {
        const text = el.textContent;
        if ((text.includes('View details') || text.includes('hypothetical') || text.includes('Weighted')) && el.getBoundingClientRect().width > 0) {
            return el;
        }
    }
    return null;
}

function injectHypotheticalInputs() {
    injectDonationButton();

    if (!location.href.includes('/sp/')) {
        return;
    }

    if (typeof observer !== 'undefined') observer.disconnect();

    scrapeCategoryWeights();

    const courseId = getCourseId();
    const storageKey = 'gclass_weights_' + courseId;

    if (window.isKnownUnweighted === undefined) window.isKnownUnweighted = false;

    if (!dynamicCategoryWeights && !window.isKnownUnweighted) {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'UNWEIGHTED') {
            window.isKnownUnweighted = true;
        } else if (saved) {
            try {
                dynamicCategoryWeights = JSON.parse(saved);
            } catch(e) {}
        }
    }

    const detailsElement = getDetailsElement();

    if (detailsElement && !dynamicCategoryWeights && !window.isKnownUnweighted && !window.hasAutoClicked) {
        window.hasAutoClicked = true; 
        setTimeout(() => triggerNativeClick(detailsElement), 500);
    }

    triggerAutoScrollLoad();

    const scoreContainers = document.querySelectorAll(SELECTORS.scoreContainer);
    const overallGradeElement = getOverallGradeElement();
    
    if (scoreContainers.length === 0) {
        if (typeof observer !== 'undefined') startObserver();
        return;
    }

    if (overallGradeElement) {
        const realText = overallGradeElement.textContent;
        if (!realText.includes('Hypothetical') && overallGradeElement.dataset.originalText !== realText) {
            overallGradeElement.dataset.originalText = realText;
        }
    }

    const hasCategories = document.querySelector(SELECTORS.categoryLabel) !== null;

    scoreContainers.forEach(container => {
        const earnedSpan = container.querySelector(SELECTORS.earnedScore);
        if (!earnedSpan) return;

        const earned = earnedSpan.textContent.trim();
        const fullText = container.textContent; 
        const match = fullText.match(/\/\s*(\d+)/);
        const possible = match ? match[1] : 0; 

        let categoryText = "Uncategorized";
        let searchNode = container;
        while (searchNode && searchNode !== document.body) {
            const catEl = searchNode.querySelector(SELECTORS.categoryLabel);
            if (catEl) {
                categoryText = catEl.textContent.replace(/^[\s•]+/, '').trim();
                break;
            }
            searchNode = searchNode.parentElement;
        }

        const assignmentId = generateAssignmentId(container, earned, possible, categoryText);
        
        if (!assignmentId.startsWith(courseId + '_')) {
            return;
        }

        let input = container.querySelector('.what-if-input');
        const isLocked = hasCategories && !dynamicCategoryWeights && !window.isKnownUnweighted;

        if (input) {
            if (window.whatIfState[assignmentId] !== undefined && input.value !== window.whatIfState[assignmentId]) {
                input.value = window.whatIfState[assignmentId];
            }
            input.disabled = isLocked;
            return;
        }

        input = document.createElement('input');
        input.type = 'number';
        input.className = 'what-if-input';
        input.dataset.possible = possible; 
        input.dataset.original = earned; 
        input.dataset.category = categoryText; 
        input.dataset.id = assignmentId;
        input.disabled = isLocked;

        input.value = window.whatIfState[assignmentId] !== undefined ? window.whatIfState[assignmentId] : earned;

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('input', () => {
            window.whatIfState[assignmentId] = input.value;
            const topGrade = getOverallGradeElement();
            if (topGrade) recalculateOverall(topGrade);
        });

        earnedSpan.style.display = 'none';
        earnedSpan.parentNode.insertBefore(input, earnedSpan);
    });

    if (overallGradeElement) recalculateOverall(overallGradeElement);
    if (typeof observer !== 'undefined') startObserver();
}

function recalculateOverall(overallGradeElement) {
    let isChanged = false;
    let categoryTotals = {};
    let standardTotalEarned = 0;
    let standardTotalPossible = 0;

    const activeInputs = document.querySelectorAll('.what-if-input');
    const currentCourseId = getCourseId();
    
    activeInputs.forEach(input => {
        const assignmentId = input.dataset.id;
        
        if (!assignmentId.startsWith(currentCourseId + '_')) {
            return; 
        }

        const possibleValue = parseFloat(input.dataset.possible) || 0;
        const originalValue = parseFloat(input.dataset.original) || 0;
        const cat = input.dataset.category;

        const currentValText = window.whatIfState[assignmentId] !== undefined ? window.whatIfState[assignmentId] : input.dataset.original;
        const currentValue = parseFloat(currentValText) || 0;

        if (currentValue !== originalValue) isChanged = true;

        standardTotalEarned += currentValue;
        standardTotalPossible += possibleValue;

        if (!categoryTotals[cat]) categoryTotals[cat] = { earned: 0, possible: 0 };
        categoryTotals[cat].earned += currentValue;
        categoryTotals[cat].possible += possibleValue;
    });

    if (standardTotalPossible > 0 && overallGradeElement) {
        if (isChanged) {
            let finalPercentage = 0;
            if (dynamicCategoryWeights) {
                let weightedSum = 0;
                let totalWeight = 0;
                for (let cat in dynamicCategoryWeights) {
                    if (categoryTotals[cat] && categoryTotals[cat].possible > 0) {
                        weightedSum += (categoryTotals[cat].earned / categoryTotals[cat].possible) * dynamicCategoryWeights[cat];
                        totalWeight += dynamicCategoryWeights[cat];
                    }
                }
                finalPercentage = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
            } else {
                finalPercentage = (standardTotalEarned / standardTotalPossible) * 100;
            }
            overallGradeElement.innerText = `${finalPercentage.toFixed(2)}% (Hypothetical)`;
        } else if (overallGradeElement.dataset.originalText) {
            overallGradeElement.innerText = overallGradeElement.dataset.originalText;
        }
    }
}

let observerTimer;
const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => injectHypotheticalInputs(), 50);
});

function startObserver() {
    if (location.href.includes('/sp/')) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

let lastURL = location.href;
setInterval(() => {
    injectDonationButton();

    if (location.href !== lastURL) {
        lastURL = location.href;
        window.hasAutoClicked = false; 
        dynamicCategoryWeights = null; 
        window.isKnownUnweighted = false;
        
        document.querySelectorAll('.what-if-input').forEach(input => input.remove());
        document.querySelectorAll(SELECTORS.earnedScore).forEach(span => span.style.display = '');
        
        injectHypotheticalInputs();
    }
}, 1000);

injectHypotheticalInputs();