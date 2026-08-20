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
window.scrolledCoursesRegistry = window.scrolledCoursesRegistry || {}; 
window.whatIfState = window.whatIfState || {}; 
window.hasAutoClicked = false; 
window.lastCalculatedGradeText = "";

let cachedScrollContainer = null;
let cachedOverallGradeEl = null;
const categoryNodeCache = new WeakMap();

function getCourseId() {
    const match = location.href.match(/\/c\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'unknown';
}

function injectDonationButton() {
    if (document.getElementById('what-if-donate-anchor')) return;

    const donateBtn = document.createElement('button');
    donateBtn.id = 'what-if-donate-anchor';
    donateBtn.className = 'what-if-donate-btn';
    donateBtn.type = 'button';

    let iconUrl = 'icon128.png';
    try { iconUrl = chrome.runtime.getURL('icon128.png'); } catch (e) {}

    donateBtn.innerHTML = `<img src="${iconUrl}" class="what-if-donate-icon" alt="What-If Logo">`;

    donateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showWhatIfModal('Google Classroom Grade Calculator | GCGC', `
            <div class="what-if-credits-container">
                <img src="${iconUrl}" class="what-if-modal-logo" alt="What-If Logo">
                <p>Landon Schroering (&copy; 2026)</p>
                <p class="what-if-modal-desc">Calculate your overall class grade with hypothetical assignment, quiz, and exam scores directly in Classroom.</p>
                
                <div class="what-if-modal-links">
                    <a href="https://ko-fi.com/dareallando123" target="_blank" rel="noopener noreferrer" class="what-if-modal-btn donate-btn">
                        ☕ Support on Ko-fi
                    </a>
                    <a href="https://lando.run/GCGC" target="_blank" rel="noopener noreferrer" class="what-if-modal-btn site-btn">
                        🌐 Visit Website
                    </a>
                </div>
            </div>
        `);
    });

    document.body.appendChild(donateBtn);
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
    }, 400); 
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
    const topGrade = getOverallGradeElement();
    
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
            else refreshBreakdownOnly(courseId, activeWeights);
        });

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            delete window.whatIfState[assignmentId]; 
            input.value = input.dataset.original; 
            toggleFieldVisualFeedback(input);
            if (topGrade) recalculateOverall(topGrade, courseId, activeWeights);
            else refreshBreakdownOnly(courseId, activeWeights);
        });
        resetBtn.addEventListener('mousedown', stopProp);

        earnedSpan.style.display = 'none';
        container.insertBefore(input, earnedSpan);
        container.appendChild(resetBtn); 
    });

    if (topGrade) {
        recalculateOverall(topGrade, courseId, activeWeights);
    } else {
        refreshBreakdownOnly(courseId, activeWeights);
    }

    if (typeof observer !== 'undefined') startObserver();
}

function refreshBreakdownOnly(courseId, activeWeights) {
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

    updateImpactBreakdown(currentCourseId, activeWeights, categoryTotals, standardTotalPossible);
}

let observerTimer;
const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(injectHypotheticalInputs, 50);
});

function startObserver() {
    if (!location.href.includes('/sp/')) return;
    const mainContent = document.body;
    observer.observe(mainContent, { childList: true, subtree: true });
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

function getGradeColor(earned, possible) {
    if (possible <= 0) return '#9aa0a6'; // Muted gray for zero-point items
    
    const percentage = Math.min(Math.max((earned / possible), 0), 1);
    // Hue ranges from 0 (Red) at 0% to 120 (Green) at 100%
    const hue = percentage * 120;
    
    return `hsl(${hue}, 75%, 45%)`;
}

function updateImpactBreakdown(currentCourseId, activeWeights, categoryTotals, standardTotalPossible) {
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
    let filterContainer = document.querySelector(SELECTORS.filterContainer) 
                        || document.querySelector('.ZnooZb') 
                        || document.querySelector('[role="main"] > div')
                        || document.querySelector(SELECTORS.scoreContainer)?.closest('[role="main"]');

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
