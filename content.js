const SELECTORS = {
    scoreContainer: '.zYqAyf', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]',
    categoryLabel: '[jscontroller="lxw7Rd"]',
    weightTable: '[jscontroller="Sol5if"]'
};

let dynamicCategoryWeights = null;

function getCourseId() {
    const match = location.href.match(/\/c\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'unknown';
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
        // shese weights to memory
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

    // initialize unweighted flag if it doesn't exist
    if (window.isKnownUnweighted === undefined) {
        window.isKnownUnweighted = false;
    }

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
            input.title = isLocked ? "Click the button above to load weights!" : "";
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
        input.title = isLocked ? "Click the button above to load weights!" : "";

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());

        input.addEventListener('input', () => {
            const topGrade = getOverallGradeElement();
            if (topGrade) recalculateOverall(topGrade);
        });

        earnedSpan.style.display = 'none';
        earnedSpan.parentNode.insertBefore(input, earnedSpan);
    });

    const detailsElement = getDetailsElement();

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
        if (currentText !== 'Click here to enable hypothetical grading for this class' && currentText !== 'Using Weighted Categories') {
            detailsElement.dataset.originalText = currentText;
        }

        if (hasCategories && !window.isKnownUnweighted) {
            if (isLocked) {
                detailsElement.textContent = 'Click here to enable hypothetical grading for this class';
                detailsElement.style.color = '#d93025'; 
            } else if (dynamicCategoryWeights) {
                detailsElement.textContent = 'Using Weighted Categories';
                detailsElement.style.color = '#188038'; 
            }
        } else {

            if (detailsElement.dataset.originalText) {
                detailsElement.textContent = detailsElement.dataset.originalText;
                detailsElement.style.color = ''; 
            }
        }
    }

    if (overallGradeElement) recalculateOverall(overallGradeElement);
}

function recalculateOverall(overallGradeElement) {
    let isChanged = false;
    let totalPossibleCheck = 0; 
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

        if (currentValue !== originalValue) {
            isChanged = true;
        }

        standardTotalEarned += currentValue;
        standardTotalPossible += possibleValue;
        totalPossibleCheck += possibleValue;

        if (!categoryTotals[cat]) {
            categoryTotals[cat] = { earned: 0, possible: 0 };
        }
        categoryTotals[cat].earned += currentValue;
        categoryTotals[cat].possible += possibleValue;
    });

    if (totalPossibleCheck > 0 && overallGradeElement) {
        if (isChanged) {
            let finalPercentage = 0;

            if (dynamicCategoryWeights) {
                let weightedGradeSum = 0;
                let totalWeightUsed = 0;

                for (let cat in dynamicCategoryWeights) {
                    if (categoryTotals[cat] && categoryTotals[cat].possible > 0) {
                        let catPercentage = categoryTotals[cat].earned / categoryTotals[cat].possible;
                        weightedGradeSum += (catPercentage * dynamicCategoryWeights[cat]);
                        totalWeightUsed += dynamicCategoryWeights[cat]; 
                    }
                }
                
                if (totalWeightUsed > 0) {
                    finalPercentage = (weightedGradeSum / totalWeightUsed) * 100;
                }
            } else {
                finalPercentage = (standardTotalEarned / standardTotalPossible) * 100;
            }

            overallGradeElement.innerText = `${finalPercentage.toFixed(2)}% (Hypothetical)`;
            overallGradeElement.classList.add('hypothetical-changed');
        } else {
            if (overallGradeElement.dataset.originalText) {
                overallGradeElement.innerText = overallGradeElement.dataset.originalText;
            }
            overallGradeElement.classList.remove('hypothetical-changed');
        }
    }
}

let observerTimer;
const observer = new MutationObserver((mutations) => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
        injectHypotheticalInputs();
    }, 150); 
});

observer.observe(document.body, { childList: true, subtree: true });
injectHypotheticalInputs();
injectSupport();

let lastURL = location.href;
setInterval(() => {
    if (location.href !== lastURL) {
        lastURL = location.href;
        
        dynamicCategoryWeights = null; 
        window.isKnownUnweighted = false;
        
        const overallGradeElement = getOverallGradeElement();
        if (overallGradeElement && overallGradeElement.dataset.originalText) {
            overallGradeElement.innerText = overallGradeElement.dataset.originalText;
            overallGradeElement.classList.remove('hypothetical-changed');
        }

        const detailsElement = getDetailsElement();
        if (detailsElement && detailsElement.dataset.originalText) {
            detailsElement.textContent = detailsElement.dataset.originalText;
            detailsElement.style.color = '';
        }
        
        document.querySelectorAll('.what-if-input').forEach(input => input.remove());
        document.querySelectorAll(SELECTORS.earnedScore).forEach(span => span.style.display = '');
        
        injectHypotheticalInputs();
    }
}, 1000);

function injectSupport() {
    if (document.getElementById('bmac-grade-calc-btn')) return;

    const bmacLink = document.createElement('a');
    bmacLink.id = 'bmac-grade-calc-btn';
    bmacLink.href = 'https://ko-fi.com/dareallando123/'; 
    bmacLink.target = '_blank'; 

    bmacLink.style.position = 'fixed';
    bmacLink.style.bottom = '60px';
    bmacLink.style.right = '15px';
    bmacLink.style.zIndex = '99999'; 
    bmacLink.style.transition = 'transform 0.2s ease-in-out';

    const bmacImg = document.createElement('img');
    bmacImg.src =  chrome.runtime.getURL("icon128.png");
    bmacImg.alt = 'Buy Me A Coffee';
    bmacImg.style.height = '45px'; 
    bmacImg.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    bmacImg.style.borderRadius = '8px';

    bmacLink.onmouseover = () => bmacLink.style.transform = 'scale(1.05)';
    bmacLink.onmouseout = () => bmacLink.style.transform = 'scale(1)';

    bmacLink.appendChild(bmacImg);
    document.body.appendChild(bmacLink);
}
