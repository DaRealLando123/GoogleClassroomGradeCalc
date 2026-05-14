const SELECTORS = {
    scoreContainer: '.zYqAyf', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]',
    categoryLabel: '[jscontroller="lxw7Rd"]',
    weightTable: '[jscontroller="Sol5if"]'
};

let dynamicCategoryWeights = null;
window.hasAutoClicked = false; // Flag to prevent infinite click loops

function getCourseId() {
    const match = location.href.match(/\/c\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'unknown';
}

// Simulates a full mouse interaction to bypass strict event listeners
function triggerNativeClick(el) {
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        el.dispatchEvent(new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        }));
    });
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
        if (el.textContent.includes('%') && el.getBoundingClientRect().width > 0) {
            return el;
        }
    }
    return null;
}

function getDetailsElement() {
    const potentialElements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of potentialElements) {
        const text = el.textContent;
        // Looking for the "View details" button specifically
        if ((text.includes('View details') || text.includes('hypothetical') || text.includes('Weighted')) && el.getBoundingClientRect().width > 0) {
            return el;
        }
    }
    return null;
}

function injectHypotheticalInputs() {
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

    // AUTO-CLICK LOGIC: If weights aren't loaded and we haven't clicked yet, trigger it.
    if (detailsElement && !dynamicCategoryWeights && !window.isKnownUnweighted && !window.hasAutoClicked) {
        window.hasAutoClicked = true; 
        setTimeout(() => {
            triggerNativeClick(detailsElement);
            // Optional: You could add logic here to find and click the "Close" button 
            // of the modal after a 500ms delay to hide the UI pop-up.
        }, 800);
    }

    const scoreContainers = document.querySelectorAll(SELECTORS.scoreContainer);
    const overallGradeElement = getOverallGradeElement();
    
    if (scoreContainers.length === 0) return;

    if (overallGradeElement) {
        const realText = overallGradeElement.textContent;
        if (!realText.includes('Hypothetical') && overallGradeElement.dataset.originalText !== realText) {
            overallGradeElement.dataset.originalText = realText;
        }
    }

    const hasCategories = document.querySelector(SELECTORS.categoryLabel) !== null;
    const isLocked = hasCategories && !dynamicCategoryWeights && !window.isKnownUnweighted;

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

        let input = container.querySelector('.what-if-input');

        if (input) {
            if (input.dataset.original !== earned) {
                input.value = earned;
                input.dataset.original = earned;
                input.dataset.possible = possible;
                input.dataset.category = categoryText;
            }
            input.disabled = isLocked;
            return;
        }

        input = document.createElement('input');
        input.type = 'number';
        input.value = earned;
        input.className = 'what-if-input';
        input.dataset.possible = possible; 
        input.dataset.original = earned; 
        input.dataset.category = categoryText; 
        input.disabled = isLocked;

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('input', () => {
            const topGrade = getOverallGradeElement();
            if (topGrade) recalculateOverall(topGrade);
        });

        earnedSpan.style.display = 'none';
        earnedSpan.parentNode.insertBefore(input, earnedSpan);
    });

    if (detailsElement) {
        if (!detailsElement.dataset.clickListenerAttached) {
            detailsElement.addEventListener('click', () => {
                setTimeout(() => {
                    const tableExists = document.querySelector(SELECTORS.weightTable);
                    if (!tableExists) {
                        window.isKnownUnweighted = true;
                        dynamicCategoryWeights = null;
                        localStorage.setItem(storageKey, 'UNWEIGHTED');
                        injectHypotheticalInputs();
                    }
                }, 500);
            });
            detailsElement.dataset.clickListenerAttached = 'true';
        }

        const currentText = detailsElement.textContent.trim();
        if (!currentText.includes('enable') && !currentText.includes('Using')) {
            detailsElement.dataset.originalText = currentText;
        }

        if (hasCategories && !window.isKnownUnweighted) {
            if (isLocked) {
                detailsElement.textContent = 'Click here to enable hypothetical grading';
                detailsElement.style.color = '#d93025'; 
            } else if (dynamicCategoryWeights) {
                detailsElement.textContent = 'Using Weighted Categories';
                detailsElement.style.color = '#188038'; 
            }
        }
    }

    if (overallGradeElement) recalculateOverall(overallGradeElement);
}

function recalculateOverall(overallGradeElement) {
    let isChanged = false;
    const inputs = document.querySelectorAll('.what-if-input');
    
    let categoryTotals = {};
    let standardTotalEarned = 0;
    let standardTotalPossible = 0;

    inputs.forEach(input => {
        if (input.getBoundingClientRect().width === 0) return;

        const currentValue = parseFloat(input.value) || 0;
        const originalValue = parseFloat(input.dataset.original) || 0;
        const possibleValue = parseFloat(input.dataset.possible) || 0;
        const cat = input.dataset.category;

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

// Observer and URL monitoring
const observer = new MutationObserver(() => injectHypotheticalInputs());
observer.observe(document.body, { childList: true, subtree: true });

let lastURL = location.href;
setInterval(() => {
    if (location.href !== lastURL) {
        lastURL = location.href;
        window.hasAutoClicked = false; // Reset for new class page
        dynamicCategoryWeights = null; 
        window.isKnownUnweighted = false;
        document.querySelectorAll('.what-if-input').forEach(input => input.remove());
        document.querySelectorAll(SELECTORS.earnedScore).forEach(span => span.style.display = '');
        injectHypotheticalInputs();
    }
}, 1000);

injectHypotheticalInputs();