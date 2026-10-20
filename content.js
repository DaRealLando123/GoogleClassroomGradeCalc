// ©️ 2026 Landon Schroering

const SELECTORS = {
    scoreContainer: '.K9DItd', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]',
    categoryLabel: '[jscontroller="lxw7Rd"]',
    weightTable: '[jscontroller="Sol5if"]',
    modalWrapper: '.g3V99b',
    filterContainer: '.ZnooZb',
    assignmentRow: '[role="listitem"], .sX221e, .j4S49e',
    assignmentTitle: '[jsname="rQC7Ie"][aria-label]'
};

const POSSIBLE_SCORE_REGEX = /\/\s*(\d+)/;

 
window.gclassCourseWeightsRegistry = window.gclassCourseWeightsRegistry || {};
window.whatIfState = window.whatIfState || {}; 
window.hasAutoClicked = false; 
window.lastCalculatedGradeText = "";

let cachedScrollContainer = null;
let cachedOverallGradeEl = null;
let categoryNodeCache = new WeakMap();
let gradeLoader = null;
let gradeLoadStatus = 'idle';
let gradeLoadURL = location.href;
let removeBannerScrollListener = null;
const classroomNetwork = window.createClassroomNetworkMonitor?.();

const OWN_UI_SELECTOR = '.what-if-input, .what-if-reset-btn, .what-if-overlay, ' +
    '#what-if-load-status, #what-if-sticky-grade-banner, #what-if-impact-breakdown, ' +
    '#what-if-custom-modal, #what-if-logo';

function injectLogoIndicator() {
    if (document.getElementById('what-if-logo')) return;
    let iconUrl = 'icon128.png';
    try { iconUrl = globalThis.chrome?.runtime?.getURL?.('icon128.png') || iconUrl; }
    catch (error) { return; }
    const logo = document.createElement('img');
    logo.id = 'what-if-logo';
    logo.className = 'what-if-logo';
    logo.src = iconUrl;
    logo.alt = 'GCGC';
    logo.width = 48;
    logo.height = 48;
    document.body.appendChild(logo);
}

function isExtensionNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!element?.closest(OWN_UI_SELECTOR);
}

function isVisibleClassroomElement(element) {
    return element.getClientRects().length > 0 && !element.closest('[hidden], [aria-hidden="true"]') &&
        window.getComputedStyle(element).visibility !== 'hidden';
}

function getVisibleClassroomElement(selector) {
    return [...document.querySelectorAll(selector)].find(isVisibleClassroomElement) || null;
}

function isClassroomMutation(mutation) {
    if (isExtensionNode(mutation.target) || mutation.target === cachedOverallGradeEl) return false;
    const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    if (element?.closest('[hidden], [aria-hidden="true"]')) return false;
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return changedNodes.length === 0 || changedNodes.some(node => !isExtensionNode(node));
}

function affectsAssignments(mutation) {
    const selector = `${SELECTORS.scoreContainer}, ${SELECTORS.assignmentTitle}, ${SELECTORS.categoryLabel}`;
    const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    if (element?.closest(selector)) return true;
    if (mutation.type === 'attributes' && element?.querySelector(selector)) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)));
}

function suspendCalculations() {
    document.querySelectorAll('.what-if-input, .what-if-reset-btn').forEach(input => input.disabled = true);
    if (cachedOverallGradeEl?.dataset.originalText !== undefined) {
        cachedOverallGradeEl.innerText = cachedOverallGradeEl.dataset.originalText;
        cachedOverallGradeEl.classList.remove('hypothetical-header-text');
    }
    document.getElementById('what-if-impact-breakdown')?.remove();
    document.getElementById('what-if-sticky-grade-banner')?.classList.remove('visible');
}

function getCourseId() {
    const match = location.href.match(/\/c\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'unknown';
}

function injectFloatingBanner() {
    if (document.getElementById('what-if-sticky-grade-banner') || !location.href.includes('/sp/')) return;
    removeBannerScrollListener?.();

    const banner = document.createElement('div');
    banner.id = 'what-if-sticky-grade-banner';
    banner.className = 'what-if-floating-banner';
    banner.innerHTML = `<span class="banner-label">Overall Grade:</span><span class="banner-value" id="what-if-banner-grade-text">--%</span>`;
    document.body.appendChild(banner);

    const scrollTarget = getScrollContainer();
    const handleScroll = () => {
        const scrollTop = scrollTarget === window ? window.scrollY : scrollTarget.scrollTop;
        if (scrollTop > 150 && location.href.includes('/sp/') && gradeLoadStatus === 'ready') {
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

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    removeBannerScrollListener = () => scrollTarget.removeEventListener('scroll', handleScroll);
    handleScroll();
}

function generateAssignmentId(container, earned, possible, category, index, courseId) {
    let assignmentName = "UnknownAssignment";
    const nameEl = container.parentElement?.querySelector('h1, h2, h3, .A666Wd, .SUZp4e');
    if (nameEl) assignmentName = nameEl.textContent.trim().replace(/[^a-zA-Z0-9]/g, '');
    return `${courseId}_idx${index}_${assignmentName}_${category}_${earned}_${possible}`;
}

function getScrollContainer() {
    const scoreSample = getVisibleClassroomElement(SELECTORS.scoreContainer) || getVisibleClassroomElement(SELECTORS.assignmentTitle);
    if (!scoreSample) return window;
    if (cachedScrollContainer?.isConnected && cachedScrollContainer.contains(scoreSample) &&
        cachedScrollContainer.scrollHeight > cachedScrollContainer.clientHeight) return cachedScrollContainer;

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
    if (gradeLoadStatus !== 'idle' || !location.href.includes('/sp/')) return;
    if (!getVisibleClassroomElement(`${SELECTORS.scoreContainer}, ${SELECTORS.assignmentTitle}`)) return;
    gradeLoadStatus = 'loading';
    classroomNetwork?.setActivity('loading');
    gradeLoadURL = location.href;
    suspendCalculations();

    document.getElementById('what-if-load-status')?.remove();
    const status = document.createElement('div');
    status.id = 'what-if-load-status';
    status.className = 'what-if-overlay';
    status.innerHTML = `<div class="what-if-load-card">
        <div class="what-if-spinner" role="status" aria-label="Loading assignments"></div>
    </div>`;
    let pendingGradeCount = 0;
    let loadedAssignmentCount = 0;
    document.body.appendChild(status);

    gradeLoader = window.createGradeLoader({
        root: document.body,
        network: classroomNetwork,
        getScrollTarget: () => {
            if (location.href !== gradeLoadURL) {
                gradeLoader.cancel();
                return null;
            }
            return getScrollContainer();
        },
        getProgress: () => {
            const scores = [...document.querySelectorAll(SELECTORS.scoreContainer)]
                .filter(isVisibleClassroomElement);
            pendingGradeCount = scores.filter(element => {
                const earned = element.querySelector(SELECTORS.earnedScore)?.textContent.trim();
                return !earned || (Number.isFinite(Number(earned)) && !POSSIBLE_SCORE_REGEX.test(element.textContent));
            }).length;
            const assignmentCount = [...document.querySelectorAll(SELECTORS.assignmentTitle)]
                .filter(isVisibleClassroomElement).length;
            const gradeCount = scores.length - pendingGradeCount;
            return {
                gradeCount,
                assignmentCount,
                hasPendingGradeData: pendingGradeCount > 0,
                hasAllGradeData: assignmentCount > 0 && gradeCount >= assignmentCount
            };
        },
        hasPendingLoad: () => {
            if (pendingGradeCount > 0) return true;
            const sample = getVisibleClassroomElement(SELECTORS.scoreContainer) || getVisibleClassroomElement(SELECTORS.assignmentTitle);
            const scope = sample?.closest('[role="main"], main') || document.body;
            return [...scope.querySelectorAll('[aria-busy="true"], [role="progressbar"]')]
                .some(element => !isExtensionNode(element) && element.getClientRects().length > 0 &&
                    window.getComputedStyle(element).visibility !== 'hidden') || scope.getAttribute('aria-busy') === 'true';
        },
        isRelevantMutation: mutation => isClassroomMutation(mutation) &&
            (affectsAssignments(mutation) || mutation.type === 'attributes'),
        onProgress: ({ gradeCount, assignmentCount }) => {
            loadedAssignmentCount = assignmentCount;
            classroomNetwork?.setActivity('loading', gradeCount);
        },
        onComplete: () => {
            if (location.href !== gradeLoadURL) return;
            gradeLoadStatus = 'ready';
            status.remove();
            injectHypotheticalInputs();
            classroomNetwork?.setActivity('ready', loadedAssignmentCount);
        },
        onStop: () => {
            gradeLoadStatus = 'paused';
            classroomNetwork?.setActivity('paused');
            status.remove();
        }
    });
    gradeLoader.start();
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
    // A visible grade can be aria-hidden when Classroom supplies separate accessible text.
    // Hidden page ancestors still exclude grades retained from another class.
    const isCurrentGrade = element => element?.isConnected && element.textContent.includes('%') &&
        element.getClientRects().length > 0 && !element.closest('[hidden]') &&
        !element.parentElement?.closest('[aria-hidden="true"]') &&
        window.getComputedStyle(element).visibility !== 'hidden';
    if (isCurrentGrade(cachedOverallGradeEl)) {
        return cachedOverallGradeEl;
    }
    const elements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of elements) {
        if (isCurrentGrade(el)) {
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
        if ((text.includes('View details') || text.includes('hypothetical') || text.includes('Weighted')) && isVisibleClassroomElement(el)) {
            return el;
        }
    }
    return null;
}

function toggleFieldVisualFeedback(inputEl) {
    inputEl.classList.toggle('grade-changed', inputEl.value !== inputEl.dataset.original);
}

function injectHypotheticalInputs() {
    if (!location.href.includes('/sp/')) return;
    injectLogoIndicator();
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
        const detailsURL = location.href;
        setTimeout(() => {
            if (location.href === detailsURL && detailsElement.isConnected) triggerNativeClick(detailsElement);
        }, 500);
    }

    triggerAutoScrollLoad();
    if (gradeLoadStatus !== 'ready') {
        startObserver();
        return;
    }
    injectFloatingBanner();

    const scoreContainers = document.querySelectorAll(SELECTORS.scoreContainer);
    
    if (scoreContainers.length === 0) {
        if (typeof observer !== 'undefined') startObserver();
        return;
    }

    const hasCategories = getVisibleClassroomElement(SELECTORS.categoryLabel) !== null;
    const isLocked = hasCategories && !activeWeights && !window.isKnownUnweighted;

    scoreContainers.forEach((container, containerIndex) => {
        if (!isVisibleClassroomElement(container)) return;

        const earnedSpan = container.querySelector(SELECTORS.earnedScore);
        if (!earnedSpan) return;

        const earned = earnedSpan.textContent.trim();
        const fullText = container.textContent; 
        const match = fullText.match(POSSIBLE_SCORE_REGEX);
        const possible = match ? match[1] : 0; 

        let categoryText = "Uncategorized";
        let searchNode = container;
        while (hasCategories && searchNode && searchNode !== document.body) {
            if (categoryNodeCache.has(searchNode)) {
                categoryText = categoryNodeCache.get(searchNode);
                break;
            }
            const catEl = [...searchNode.querySelectorAll(SELECTORS.categoryLabel)].find(isVisibleClassroomElement);
            if (catEl) {
                categoryText = catEl.textContent.replace(/^[\s•]+/, '').trim();
                categoryNodeCache.set(searchNode, categoryText);
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
                resetBtn.disabled = isLocked;
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
        resetBtn.disabled = isLocked;
        resetBtn.innerHTML = '&times;';
        resetBtn.title = 'Reset grade';

        const stopProp = (e) => e.stopPropagation();
        input.addEventListener('click', stopProp);
        input.addEventListener('mousedown', stopProp);
        input.addEventListener('input', () => {
            if (gradeLoadStatus !== 'ready' || location.href !== gradeLoadURL) return;
            window.whatIfState[assignmentId] = input.value;
            toggleFieldVisualFeedback(input);
            refreshOverallGrade(courseId, activeWeights);
        });

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            if (gradeLoadStatus !== 'ready' || location.href !== gradeLoadURL) return;
            delete window.whatIfState[assignmentId]; 
            input.value = input.dataset.original; 
            toggleFieldVisualFeedback(input);
            refreshOverallGrade(courseId, activeWeights);
        });
        resetBtn.addEventListener('mousedown', stopProp);

        earnedSpan.style.display = 'none';
        container.insertBefore(input, earnedSpan);
        container.appendChild(resetBtn); 
    });

    refreshOverallGrade(courseId, activeWeights);

    if (typeof observer !== 'undefined') startObserver();
}

function refreshOverallGrade(courseId, activeWeights) {
    const topGrade = getOverallGradeElement();
    if (topGrade) {
        if (topGrade.dataset.originalText === undefined) topGrade.dataset.originalText = topGrade.textContent;
        recalculateOverall(topGrade, courseId, activeWeights);
    } else {
        refreshBreakdownOnly(courseId, activeWeights);
    }
}

function refreshBreakdownOnly(courseId, activeWeights) {
    if (gradeLoadStatus !== 'ready') return;
    let categoryTotals = {};
    let standardTotalPossible = 0;

    document.querySelectorAll('.what-if-input').forEach(input => {
        if (input.offsetParent === null) return;
        const assignmentId = input.dataset.id;
        if (!assignmentId.startsWith(courseId + '_')) return;

        const possibleValue = parseFloat(input.dataset.possible) || 0;
        const cat = input.dataset.category;
        standardTotalPossible += possibleValue;

        const isolatedKey = `${courseId}_${cat}`;
        if (!categoryTotals[isolatedKey]) categoryTotals[isolatedKey] = { earned: 0, possible: 0 };
        categoryTotals[isolatedKey].possible += possibleValue;
    });

    updateImpactBreakdown(courseId, activeWeights, categoryTotals, standardTotalPossible);
}

function recalculateOverall(overallGradeElement, currentCourseId, activeWeights) {
    if (gradeLoadStatus !== 'ready') return;
    
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

    updateImpactBreakdown(currentCourseId, activeWeights, categoryTotals, standardTotalPossible);
}

let observerTimer;
const observer = new MutationObserver(mutations => {
    if (checkNavigation()) return;
    const classroomMutations = mutations.filter(isClassroomMutation);
    if (!classroomMutations.length || gradeLoadStatus === 'loading' || gradeLoadStatus === 'paused') return;
    if (gradeLoadStatus === 'ready' && classroomMutations.some(affectsAssignments)) {
        gradeLoadStatus = 'idle';
        suspendCalculations();
    }
    clearTimeout(observerTimer);
    observerTimer = setTimeout(injectHypotheticalInputs, 50);
});

function startObserver() {
    if (!location.href.includes('/sp/')) return;
    const mainContent = document.body;
    observer.observe(mainContent, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['hidden', 'aria-hidden']
    });
}

let lastURL = location.href;
function checkNavigation() {
    if (location.href !== lastURL) {
        lastURL = location.href;
        gradeLoader?.cancel();
        gradeLoader = null;
        classroomNetwork?.resetRoute();
        classroomNetwork?.setActivity('idle');
        document.getElementById('what-if-logo')?.remove();
        gradeLoadStatus = 'idle';
        gradeLoadURL = location.href;
        clearTimeout(observerTimer);
        observer.disconnect();
        removeBannerScrollListener?.();
        removeBannerScrollListener = null;
        window.hasAutoClicked = false; 
        window.isKnownUnweighted = false;
        window.lastCalculatedGradeText = "";
        cachedScrollContainer = null;
        cachedOverallGradeEl = null;
        categoryNodeCache = new WeakMap();
        
        document.querySelectorAll('.what-if-input, .what-if-reset-btn, #what-if-sticky-grade-banner, #what-if-impact-breakdown, #what-if-load-status').forEach(el => el.remove());
        document.querySelectorAll(SELECTORS.earnedScore).forEach(span => span.style.display = '');
        
        injectHypotheticalInputs();
        return true;
    }
    return false;
}

setInterval(() => {
    if (!checkNavigation() && gradeLoadStatus === 'idle' && location.href.includes('/sp/')) injectHypotheticalInputs();
}, 1000);

function getGradeColor(earned, possible) {
    if (possible <= 0) return '#9aa0a6'; // Muted gray for zero-point items
    
    const percentage = Math.min(Math.max((earned / possible), 0), 1);
    // Hue ranges from 0 (Red) at 0% to 120 (Green) at 100%
    const hue = percentage * 120;
    
    return `hsl(${hue}, 75%, 45%)`;
}

function updateImpactBreakdown(currentCourseId, activeWeights, categoryTotals, standardTotalPossible) {
    if (gradeLoadStatus !== 'ready') return;
    const assignments = [];

    document.querySelectorAll('.what-if-input').forEach((input) => {
        if (input.offsetParent === null) return;
        
        const assignmentId = input.dataset.id;
        if (!assignmentId.startsWith(currentCourseId + '_')) return;

        const possible = parseFloat(input.dataset.possible) || 0;
        if (possible <= 0) return;

        const earned = parseFloat(input.value) || 0;
        const cat = input.dataset.category;

        let titleEl = null;
        let rowEl = null;
        let parentNode = input.parentElement;

        while (parentNode && parentNode !== document.body) {
            const match = parentNode.querySelector('[jsname="rQC7Ie"][aria-label], [jsname="rQC7Ie"]');
            if (match) {
                titleEl = match;
                rowEl = parentNode;
                break;
            }
            parentNode = parentNode.parentElement;
        }

        const name = titleEl?.getAttribute('aria-label')?.trim() || 'Assignment';
        const linkEl = rowEl?.querySelector('a[href*="/a/"]');

        let weightPercent = 0;
        if (activeWeights && activeWeights[cat]) {
            const isolatedLookupKey = `${currentCourseId}_${cat}`;
            const catPossible = categoryTotals[isolatedLookupKey]?.possible || 0;
            if (catPossible > 0) {
                weightPercent = (possible / catPossible) * (activeWeights[cat] * 100);
            }
        } else if (standardTotalPossible > 0) {
            weightPercent = (possible / standardTotalPossible) * 100;
        }

        if (weightPercent > 0) {
            assignments.push({ name, earned, possible, weightPercent, category: cat, rowEl, linkEl });
        }
    });

    let barContainer = document.getElementById('what-if-impact-breakdown');

    if (assignments.length === 0) {
        if (barContainer) barContainer.remove();
        return;
    }

    // 1. Try finding primary filter container, or fallback to main classroom content wraps
    const filterContainer = getVisibleClassroomElement(SELECTORS.filterContainer)
                        || getVisibleClassroomElement('[role="main"] > div, main > div')
                        || getVisibleClassroomElement(SELECTORS.scoreContainer)?.closest('[role="main"], main');

    if (!filterContainer) return;

    if (!barContainer || !filterContainer.contains(barContainer)) {
        if (barContainer) barContainer.remove();
        barContainer = document.createElement('div');
        barContainer.id = 'what-if-impact-breakdown';
        barContainer.className = 'what-if-impact-bar-container';

        // Append to the end so it lands on the correct side/below filters
        filterContainer.appendChild(barContainer);
    }

    barContainer.innerHTML = `
        <div class="what-if-impact-bar-labels">
            <span>Newest</span>
            <span class="what-if-info-icon" id="what-if-impact-info-btn">ⓘ</span>
            <span>Oldest</span>
        </div>
    `;

    const infoBtn = barContainer.querySelector('#what-if-impact-info-btn');
    if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showWhatIfModal('Grade Bar',
                `<strong>The more an assignment is worth, the more space it takes up on the bar.</strong>
                <br>
                <strong>Having non-graded or few assignments will make this way less accurate!</strong> 
                <br>
                The color reflects the score you got for that assignment.
                <br><br>
                Clicking on the bar will jump to that assignment in the gradebook.`
            );
        });
    }

    const bar = document.createElement('div');
    bar.className = 'what-if-impact-bar';

    assignments.forEach((item) => {
        const scorePct = ((item.earned / item.possible) * 100).toFixed(1);
        const segment = document.createElement('div');
        segment.className = 'what-if-bar-segment';
        segment.style.width = `${item.weightPercent}%`;
        segment.style.backgroundColor = getGradeColor(item.earned, item.possible);
        
        const catLabel = item.category && item.category !== 'Uncategorized' ? ` [${item.category}]` : '';
        segment.title = `${item.name}${catLabel}\n${scorePct}% (${item.earned}/${item.possible} pts) — ${item.weightPercent.toFixed(1)}% of total grade`;

        segment.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.rowEl) {
                item.rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (item.linkEl) {
                    item.linkEl.click();
                } else if (typeof item.rowEl.click === 'function') {
                    item.rowEl.click();
                }
            }
        });

        bar.appendChild(segment);
    });

    barContainer.appendChild(bar);
}

function showWhatIfModal(title, htmlContent) {
    const existing = document.getElementById('what-if-custom-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'what-if-custom-modal';
    modal.className = 'what-if-modal-overlay';
    modal.innerHTML = `
        <div class="what-if-modal-content">
            <button class="what-if-modal-close" aria-label="Close">&times;</button>
            <h3 class="what-if-modal-title">${title}</h3>
            <div class="what-if-modal-body">${htmlContent}</div>
        </div>
    `;

    modal.querySelector('.what-if-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

injectHypotheticalInputs();
