const SELECTORS = {
    scoreContainer: '.zYqAyf', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]',
    categoryLabel: '[jscontroller="lxw7Rd"]',
    weightTable: '[jscontroller="Sol5if"]',
    modalWrapper: '.g3V99b'
};

//weights by courseId to prevent state bleed
window.gclassCourseWeightsRegistry = window.gclassCourseWeightsRegistry || {};
window.scrolledCoursesRegistry = window.scrolledCoursesRegistry || {}; 
window.whatIfState = window.whatIfState || {}; 
window.hasAutoClicked = false; 

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
            left: 24px;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease-in-out;
            cursor: pointer;
        }
        .what-if-donate-btn:hover {
            transform: scale(1.05);
        }
        .what-if-donate-btn:active {
            transform: scale(0.95);
            box-shadow: 0 4px 5px rgba(0,0,0,0.14);
        }
        .what-if-donate-icon {
            width: 64px;
            height: 64px;
            display: block;
            border-radius: 20%;
        }

        .zYqAyf {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
        }

        .what-if-input {
            border: 1px solid #dcdcdc !important; 
            border-radius: 4px !important;
            background-color: #ffffff !important;
            padding: 2px 4px !important;
            margin: 0 !important;
            width: 36px !important; 
            font-family: "Google Sans", Roboto, Arial, sans-serif !important;
            font-size: 14px !important;
            letter-spacing: .25px !important;
            font-weight: 500 !important;
            text-align: center !important;
            color: #1a73e8 !important; 
            outline: none !important;
            -moz-appearance: textfield !important;
            transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
        }
        
        .what-if-input::-webkit-outer-spin-button,
        .what-if-input::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }

        .what-if-input.grade-changed {
            border-color: #757575 !important; 
            color: #5f6368 !important; 
            font-style: italic !important;
            background-color: #f1f3f4 !important; 
        }

        /* FAR RIGHT MINI RESET BUTTON */
        .what-if-reset-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 16px !important;
            height: 16px !important;
            background: none !important;
            border: none !important;
            color: #db4437 !important; 
            font-size: 16px !important;
            line-height: 1 !important;
            cursor: pointer !important;
            padding: 0 !important;
            margin: 0 0 0 4px !important;
            opacity: 0 !important;
            pointer-events: none !important;
            transition: opacity 0.15s ease, transform 0.15s ease !important;
            font-family: Arial, sans-serif !important;
            font-weight: bold !important;
        }

        .what-if-reset-btn:hover {
            transform: scale(1.2) !important;
        }

        .zYqAyf:has(.what-if-input.grade-changed) .what-if-reset-btn {
            opacity: 0.7 !important;
            pointer-events: auto !important;
        }
        
        .zYqAyf:has(.what-if-input.grade-changed) .what-if-reset-btn:hover {
            opacity: 1 !important;
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

function generateAssignmentId(container, earned, possible, category, index) {
    let assignmentName = "UnknownAssignment";
    const nameEl = container.parentElement?.querySelector('h1, h2, h3, .A666Wd, .SUZp4e');
    if (nameEl) assignmentName = nameEl.textContent.trim().replace(/[^a-zA-Z0-9]/g, '');
    return `${getCourseId()}_idx${index}_${assignmentName}_${category}_${earned}_${possible}`;
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

                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 300);

                injectHypotheticalInputs();
            }
        } else {
            stableChecks = 0; 
        }

        lastRowCount = currentRowCount;
    }, 200); 
}

function triggerNativeClick(el) {
    const courseId = getCourseId();
    const storageKey = 'gclass_weights_' + courseId;

    const modalObserver = new MutationObserver((mutations, observerInstance) => {
        const tableContainer = document.querySelector(SELECTORS.weightTable);
        const modalContainer = document.querySelector(SELECTORS.modalWrapper) || document.body.querySelector('[role="dialog"]');
        
        if (tableContainer && tableContainer.querySelectorAll('tr').length > 0) {
            observerInstance.disconnect(); 
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
                    observerInstance.disconnect();
                    window.isKnownUnweighted = true;
                    window.gclassCourseWeightsRegistry[courseId] = null;
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

    const courseId = getCourseId();
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
        window.gclassCourseWeightsRegistry[courseId] = scrapedWeights;
        localStorage.setItem('gclass_weights_' + courseId, JSON.stringify(scrapedWeights));
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

// global target selector maps
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

function toggleFieldVisualFeedback(inputEl) {
    if (inputEl.value !== inputEl.dataset.original) {
        inputEl.classList.add('grade-changed');
    } else {
        inputEl.classList.remove('grade-changed');
    }
}

function injectHypotheticalInputs() {
    injectDonationButton();

    if (!location.href.includes('/sp/')) {
        return;
    }

    if (typeof observer !== 'undefined') observer.disconnect();

    const courseId = getCourseId();
    const storageKey = 'gclass_weights_' + courseId;

    if (window.isKnownUnweighted === undefined) window.isKnownUnweighted = false;

    if (!window.gclassCourseWeightsRegistry[courseId] && !window.isKnownUnweighted) {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'UNWEIGHTED') {
            window.isKnownUnweighted = true;
        } else if (saved) {
            try {
                window.gclassCourseWeightsRegistry[courseId] = JSON.parse(saved);
            } catch(e) {}
        }
    }

    const detailsElement = getDetailsElement();
    const activeWeights = window.gclassCourseWeightsRegistry[courseId];

    if (detailsElement && !activeWeights && !window.isKnownUnweighted && !window.hasAutoClicked) {
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

    scoreContainers.forEach((container, containerIndex) => {
        if (container.getBoundingClientRect().width === 0) {
            return;
        }

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

        const assignmentId = generateAssignmentId(container, earned, possible, categoryText, containerIndex);
        
        if (!assignmentId.startsWith(courseId + '_')) {
            return;
        }

        let input = container.querySelector('.what-if-input');
        let resetBtn = container.querySelector('.what-if-reset-btn');
        const isLocked = hasCategories && !activeWeights && !window.isKnownUnweighted;

        if (input && resetBtn) {
            if (input.dataset.id !== assignmentId) {
                input.remove();
                resetBtn.remove();
                earnedSpan.style.display = '';
                input = null;
                resetBtn = null;
            } else {
                if (window.whatIfState[assignmentId] !== undefined && input.value !== window.whatIfState[assignmentId]) {
                    input.value = window.whatIfState[assignmentId];
                }
                input.disabled = isLocked;
                toggleFieldVisualFeedback(input);
                return;
            }
        }

        if (!input) {
            input = document.createElement('input');
            input.type = 'number';
            input.className = 'what-if-input';
            input.dataset.possible = possible; 
            input.dataset.original = earned; 
            input.dataset.category = categoryText; 
            input.dataset.id = assignmentId;
            input.disabled = isLocked;

            input.value = window.whatIfState[assignmentId] !== undefined ? window.whatIfState[assignmentId] : earned;
            toggleFieldVisualFeedback(input);

            resetBtn = document.createElement('button');
            resetBtn.className = 'what-if-reset-btn';
            resetBtn.innerHTML = '&times;';
            resetBtn.title = 'Reset grade';

            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('input', () => {
                window.whatIfState[assignmentId] = input.value;
                toggleFieldVisualFeedback(input);
                const topGrade = getOverallGradeElement();
                if (topGrade) recalculateOverall(topGrade);
            });

            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                delete window.whatIfState[assignmentId]; 
                input.value = input.dataset.original; 
                toggleFieldVisualFeedback(input);
                const topGrade = getOverallGradeElement();
                if (topGrade) recalculateOverall(topGrade);
            });
            resetBtn.addEventListener('mousedown', (e) => e.stopPropagation());

            earnedSpan.style.display = 'none';
            earnedSpan.parentNode.insertBefore(input, earnedSpan);
            container.appendChild(resetBtn); // snaps the cross button to the absolute right side end frame edge
        }
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
    const activeWeights = window.gclassCourseWeightsRegistry[currentCourseId];
    
    activeInputs.forEach(input => {
        if (input.getBoundingClientRect().width === 0) {
            return;
        }

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

        const isolatedKey = `${currentCourseId}_${cat}`;
        if (!categoryTotals[isolatedKey]) categoryTotals[isolatedKey] = { earned: 0, possible: 0 };
        categoryTotals[isolatedKey].earned += currentValue;
        categoryTotals[isolatedKey].possible += possibleValue;
    });

    if (standardTotalPossible > 0 && overallGradeElement) {
        if (isChanged) {
            let finalPercentage = 0;
            if (activeWeights) {
                let strokeWeightedSum = 0;
                let totalWeightDiscovered = 0;
                for (let cat in activeWeights) {
                    const isolatedLookupKey = `${currentCourseId}_${cat}`;
                    if (categoryTotals[isolatedLookupKey] && categoryTotals[isolatedLookupKey].possible > 0) {
                        strokeWeightedSum += (categoryTotals[isolatedLookupKey].earned / categoryTotals[isolatedLookupKey].possible) * activeWeights[cat];
                        totalWeightDiscovered += activeWeights[cat];
                    }
                }
                finalPercentage = totalWeightDiscovered > 0 ? (strokeWeightedSum / totalWeightDiscovered) * 100 : 0;
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
        window.isKnownUnweighted = false;
        
        document.querySelectorAll('.what-if-input').forEach(input => input.remove());
        document.querySelectorAll('.what-if-reset-btn').forEach(btn => btn.remove());
        document.querySelectorAll(SELECTORS.earnedScore).forEach(span => span.style.display = '');
        
        injectHypotheticalInputs();
    }
}, 1000);

injectHypotheticalInputs();