// ©️ 2026 Landon Schroering

const SELECTORS = {
    scoreContainer: '.K9DItd', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]',
    categoryLabel: '[jscontroller="lxw7Rd"]',
    weightTable: '[jscontroller="Sol5if"]',
    modalWrapper: '.g3V99b'
};

const POSSIBLE_SCORE_REGEX = /\/\s*(\d+)/;

 
window.gclassCourseWeightsRegistry = window.gclassCourseWeightsRegistry || {};
window.scrolledCoursesRegistry = window.scrolledCoursesRegistry || {}; 
window.whatIfState = window.whatIfState || {}; 
window.hasAutoClicked = false; 
window.lastCalculatedGradeText = "";

let cachedScrollContainer = null;
let cachedOverallGradeEl = null;
const categoryNodeCache = new WeakMap(); 

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
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(4px);
            z-index: 100000; display: flex; justify-content: center; align-items: center;
            transition: opacity 0.3s ease-in-out; pointer-events: all;
        }
        .what-if-spinner { width: 60px; height: 60px; border-radius: 50%; animation: whatIfColorThrob 3s infinite ease-in-out; }
        .what-if-donate-btn {
            position: fixed; bottom: 12px; left: 12px; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease-in-out; cursor: pointer;
        }
        .what-if-donate-btn:hover { transform: scale(1.05); }
        .what-if-donate-btn:active { transform: scale(0.95); box-shadow: 0 4px 5px rgba(0,0,0,0.14); }
        .what-if-donate-icon { width: 64px; height: 64px; display: block; border-radius: 20%; }
        .zYqAyf { display: inline-flex !important; align-items: center !important; gap: 4px !important; }
        .what-if-input {
            border: 1px solid #dcdcdc !important; border-radius: 4px !important;
            background-color: #ffffff !important; padding: 2px 4px !important; margin: 0 !important;
            width: 36px !important; font-family: "Google Sans", Roboto, Arial, sans-serif !important;
            font-size: 14px !important; letter-spacing: .25px !important; font-weight: 500 !important;
            text-align: center !important; color: #1a73e8 !important; outline: none !important;
            -moz-appearance: textfield !important; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
        }
        .what-if-input::-webkit-outer-spin-button, .what-if-input::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        .what-if-input.grade-changed { border-color: #757575 !important; color: #303b6e !important; background-color: #f1f3f4 !important; }
        .what-if-reset-btn {
            display: inline-flex !important; align-items: center !important; justify-content: center !important;
            width: 16px !important; height: 16px !important; background: none !important; border: none !important;
            color: #db4437 !important; font-size: 16px !important; line-height: 1 !important; cursor: pointer !important;
            padding: 0 !important; margin: 0 0 0 4px !important; opacity: 0 !important; pointer-events: none !important;
            transition: opacity 0.15s ease, transform 0.15s ease !important; font-family: Arial, sans-serif !important; font-weight: bold !important;
        }
        .what-if-reset-btn:hover { transform: scale(1.2) !important; }
        .zYqAyf:has(.what-if-input.grade-changed) .what-if-reset-btn { opacity: 0.7 !important; pointer-events: auto !important; }
        .zYqAyf:has(.what-if-input.grade-changed) .what-if-reset-btn:hover { opacity: 1 !important; }
        .what-if-floating-banner {
            position: fixed; top: -60px; left: 50%; transform: translateX(-50%);
            background-color: #ffffff; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px; padding: 10px 24px;
            font-family: "Google Sans", Roboto, Arial, sans-serif; font-size: 16px; font-weight: 500;
            color: #3c4043; z-index: 9999; transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex; align-items: center; gap: 8px; pointer-events: none;
        }
        .what-if-floating-banner.visible { top: 0; pointer-events: auto; }
        .what-if-floating-banner .banner-label { color: #5f6368; }
        .what-if-floating-banner .banner-value { color: #1a73e8; font-weight: 700; }
        .what-if-floating-banner.hypothetical .banner-value { color: #303b6e; }
        .hypothetical-header-text { color: #303b6e !important; }
    `;
    document.head.appendChild(styleEl);
}

function getCourseId() {
    const match = location.href.match(/\/c\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'unknown';
}

function injectDonationButton() {
    if (document.getElementById('what-if-donate-anchor')) return;
    const donateLink = document.createElement('a');
    donateLink.id = 'what-if-donate-anchor';
    donateLink.className = 'what-if-donate-btn';
    donateLink.href = 'https://ko-fi.com/dareallando123'; 
    donateLink.target = '_blank';
    donateLink.rel = 'noopener noreferrer';
    
    let iconUrl = 'icon128.png';
    try { iconUrl = chrome.runtime.getURL('icon128.png'); } catch (e) {}
    
    donateLink.innerHTML = `<img src="${iconUrl}" class="what-if-donate-icon" alt="What-If Logo">`;
    document.body.appendChild(donateLink);
}

function injectFloatingBanner() {
    if (document.getElementById('what-if-sticky-grade-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'what-if-sticky-grade-banner';
    banner.className = 'what-if-floating-banner';
    banner.innerHTML = `<span class="banner-label">Overall Grade:</span><span class="banner-value" id="what-if-banner-grade-text">--%</span>`;
    document.body.appendChild(banner);

    const scrollTarget = getScrollContainer();
    const handleScroll = () => {
        const scrollTop = scrollTarget === window ? window.scrollY : scrollTarget.scrollTop;
        if (scrollTop > 150 && location.href.includes('/sp/')) {
            banner.classList.add('visible');
            const innerVal = document.getElementById('what-if-banner-grade-text');
            if (innerVal && innerVal.textContent !== window.lastCalculatedGradeText) {
                innerVal.textContent = window.lastCalculatedGradeText;
                banner.classList.toggle('hypothetical', window.lastCalculatedGradeText.includes('Hypothetical'));
            }
        } else {
            banner.classList.remove('visible');
        }
    };

    scrollTarget.removeEventListener('scroll', handleScroll);
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
}

function generateAssignmentId(container, earned, possible, category, index, courseId) {
    let assignmentName = "UnknownAssignment";
    const nameEl = container.parentElement?.querySelector('h1, h2, h3, .A666Wd, .SUZp4e');
    if (nameEl) assignmentName = nameEl.textContent.trim().replace(/[^a-zA-Z0-9]/g, '');
    return `${courseId}_idx${index}_${assignmentName}_${category}_${earned}_${possible}`;
}

function getScrollContainer() {
    if (cachedScrollContainer && document.body.contains(cachedScrollContainer)) return cachedScrollContainer;
    const scoreSample = document.querySelector(SELECTORS.scoreContainer);
    if (!scoreSample) return window;

    let parent = scoreSample.parentElement;
    while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (parent.scrollHeight > parent.clientHeight && (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
            cachedScrollContainer = parent;
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
    if (!scrollTarget || !document.querySelector(SELECTORS.scoreContainer)) return;

    window.scrolledCoursesRegistry[courseId] = true;

    const overlay = document.createElement('div');
    overlay.className = 'what-if-overlay';
    overlay.innerHTML = `<div class="what-if-spinner"></div>`;
    document.body.appendChild(overlay);

    const isWindow = scrollTarget === window;
    const originalScrollTop = isWindow ? window.scrollY : scrollTarget.scrollTop;

    let lastRowCount = 0;
    let stableChecks = 0;

    const scrollInterval = setInterval(() => {
        const currentRowCount = document.querySelectorAll(SELECTORS.scoreContainer).length;
        if (isWindow) window.scrollTo(0, document.body.scrollHeight);
        else scrollTarget.scrollTop = scrollTarget.scrollHeight;

        if (currentRowCount === lastRowCount) {
            stableChecks++;
            if (stableChecks >= 4) { 
                clearInterval(scrollInterval);
                if (isWindow) window.scrollTo(0, originalScrollTop);
                else scrollTarget.scrollTop = originalScrollTop;

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
                scrapeCategoryWeights(courseId);
                location.reload();
            }, 50);
            return;
        }

        if (modalContainer && !tableContainer) {
            setTimeout(() => {
                if (!document.querySelector(SELECTORS.weightTable)) {
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

    ['mousedown', 'mouseup', 'click'].forEach(evt => {
        el.dispatchEvent(new MouseEvent(evt, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
    });

    setTimeout(() => modalObserver.disconnect(), 2500);
}

function scrapeCategoryWeights(courseId) {
    const tableContainer = document.querySelector(SELECTORS.weightTable);
    if (!tableContainer) return; 

    const scrapedWeights = {};
    tableContainer.querySelectorAll('tr').forEach(row => {
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
    if (cachedOverallGradeEl && document.body.contains(cachedOverallGradeEl) && cachedOverallGradeEl.offsetParent !== null) {
        return cachedOverallGradeEl;
    }
    const elements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of elements) {
        // offsetParent is astronomically faster than getBoundingClientRect()
        if (el.textContent.includes('%') && el.offsetParent !== null) {
            cachedOverallGradeEl = el;
            return el;
        }
    }
    return null;
}

function getDetailsElement() {
    const elements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of elements) {
        const text = el.textContent;
        if ((text.includes('View details') || text.includes('hypothetical') || text.includes('Weighted')) && el.offsetParent !== null) {
            return el;
        }
    }
    return null;
}

function toggleFieldVisualFeedback(inputEl) {
    inputEl.classList.toggle('grade-changed', inputEl.value !== inputEl.dataset.original);
}

function injectHypotheticalInputs() {
    injectDonationButton();
    injectFloatingBanner();

    if (!location.href.includes('/sp/')) return;
    if (typeof observer !== 'undefined') observer.disconnect();

    const courseId = getCourseId();
    const storageKey = 'gclass_weights_' + courseId;

    if (window.isKnownUnweighted === undefined) window.isKnownUnweighted = false;

    if (!window.gclassCourseWeightsRegistry[courseId] && !window.isKnownUnweighted) {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'UNWEIGHTED') window.isKnownUnweighted = true;
        else if (saved) {
            try { window.gclassCourseWeightsRegistry[courseId] = JSON.parse(saved); } catch(e) {}
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
    const topGrade = getOverallGradeElement(); // Cached outside the loop!
    
    if (scoreContainers.length === 0) {
        if (typeof observer !== 'undefined') startObserver();
        return;
    }

    if (topGrade && topGrade.dataset.originalText === undefined) {
        topGrade.dataset.originalText = topGrade.textContent;
    }

    const hasCategories = document.querySelector(SELECTORS.categoryLabel) !== null;
    const isLocked = hasCategories && !activeWeights && !window.isKnownUnweighted;

    scoreContainers.forEach((container, containerIndex) => {
        if (container.offsetParent === null) return;

        const earnedSpan = container.querySelector(SELECTORS.earnedScore);
        if (!earnedSpan) return;

        const earned = earnedSpan.textContent.trim();
        const fullText = container.textContent; 
        const match = fullText.match(POSSIBLE_SCORE_REGEX);
        const possible = match ? match[1] : 0; 

        let categoryText = "Uncategorized";
        let searchNode = container;
        while (searchNode && searchNode !== document.body) {
            if (categoryNodeCache.has(searchNode)) {
                categoryText = categoryNodeCache.get(searchNode);
                break;
            }
            const catEl = searchNode.querySelector(SELECTORS.categoryLabel);
            if (catEl) {
                categoryText = catEl.textContent.replace(/^[\s•]+/, '').trim();
                categoryNodeCache.set(searchNode, categoryText); // Cache it for future assignments in this block
                break;
            }
            searchNode = searchNode.parentElement;
        }

        const assignmentId = generateAssignmentId(container, earned, possible, categoryText, containerIndex, courseId);
        if (!assignmentId.startsWith(courseId + '_')) return;

        let input = container.querySelector('.what-if-input');
        let resetBtn = container.querySelector('.what-if-reset-btn');

        if (input && resetBtn) {
            if (input.dataset.id !== assignmentId) {
                input.remove(); resetBtn.remove();
                earnedSpan.style.display = '';
            } else {
                if (window.whatIfState[assignmentId] !== undefined && input.value !== window.whatIfState[assignmentId]) {
                    input.value = window.whatIfState[assignmentId];
                }
                input.disabled = isLocked;
                toggleFieldVisualFeedback(input);
                return;
            }
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
        
        toggleFieldVisualFeedback(input);

        resetBtn = document.createElement('button');
        resetBtn.className = 'what-if-reset-btn';
        resetBtn.innerHTML = '&times;';
        resetBtn.title = 'Reset grade';

        const stopProp = (e) => e.stopPropagation();
        input.addEventListener('click', stopProp);
        input.addEventListener('mousedown', stopProp);
        input.addEventListener('input', () => {
            window.whatIfState[assignmentId] = input.value;
            toggleFieldVisualFeedback(input);
            if (topGrade) recalculateOverall(topGrade, courseId, activeWeights);
        });

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            delete window.whatIfState[assignmentId]; 
            input.value = input.dataset.original; 
            toggleFieldVisualFeedback(input);
            if (topGrade) recalculateOverall(topGrade, courseId, activeWeights);
        });
        resetBtn.addEventListener('mousedown', stopProp);

        earnedSpan.style.display = 'none';
        container.insertBefore(input, earnedSpan);
        container.appendChild(resetBtn); 
    });

    if (topGrade) recalculateOverall(topGrade, courseId, activeWeights);
    if (typeof observer !== 'undefined') startObserver();
}

function recalculateOverall(overallGradeElement, currentCourseId, activeWeights) {
    console.log("Recalculating overall grade.")
    
    let isChanged = false;
    let categoryTotals = {};
    let standardTotalEarned = 0;
    let standardTotalPossible = 0;

    document.querySelectorAll('.what-if-input').forEach(input => {
        if (input.offsetParent === null) return; // Fast visibility check

        const assignmentId = input.dataset.id;
        if (!assignmentId.startsWith(currentCourseId + '_')) return; 

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

    if (standardTotalPossible > 0) {
        let textResult = "";
        let isHypothetical = false;
        
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
            textResult = `${finalPercentage.toFixed(2)}% (Hypothetical)`;
            isHypothetical = true;
        } else if (overallGradeElement.dataset.originalText) {
            textResult = overallGradeElement.dataset.originalText;
        }

        if (overallGradeElement.innerText !== textResult) {
            overallGradeElement.innerText = textResult;
            overallGradeElement.classList.toggle('hypothetical-header-text', isHypothetical);
        }

        window.lastCalculatedGradeText = textResult;

        const bannerInner = document.getElementById('what-if-banner-grade-text');
        const bannerElement = document.getElementById('what-if-sticky-grade-banner');
        if (bannerInner && bannerInner.textContent !== textResult) {
            bannerInner.textContent = textResult;
            bannerElement.classList.toggle('hypothetical', isHypothetical);
        }
    }
}

let observerTimer;
const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(injectHypotheticalInputs, 50);
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
        window.lastCalculatedGradeText = "";
        cachedScrollContainer = null;
        cachedOverallGradeEl = null;
        
        document.querySelectorAll('.what-if-input, .what-if-reset-btn, #what-if-sticky-grade-banner').forEach(el => el.remove());
        document.querySelectorAll(SELECTORS.earnedScore).forEach(span => span.style.display = '');
        
        injectHypotheticalInputs();
    }
}, 1000);

injectHypotheticalInputs();
