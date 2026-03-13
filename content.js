
const SELECTORS = {
    scoreContainer: '.zYqAyf', 
    earnedScore: '.wyQ9e',     
    overallGrade: '[jsname="V67aGc"]'
};

// Changes every google classroom update (no clue when) so if it breaks, inspect the elements and update the selectors accordingly.
// Actually idk the jsname might not change. Last update: 2025-3-13

function getOverallGradeElement() {
    const potentialElements = document.querySelectorAll(SELECTORS.overallGrade);
    for (const el of potentialElements) {
        if (el.innerText.includes('%')) return el;
    }
    return null;
}

function injectHypotheticalInputs() {
    const scoreContainers = document.querySelectorAll(SELECTORS.scoreContainer);
    const overallGradeElement = getOverallGradeElement();
    
    if (scoreContainers.length === 0) return;

    if (overallGradeElement && !overallGradeElement.dataset.originalText) {

        if (!overallGradeElement.innerText.includes('Hypothetical')) {
            overallGradeElement.dataset.originalText = overallGradeElement.innerText;
        }
    }

    scoreContainers.forEach(container => {

        if (container.querySelector('.what-if-input')) return;

        const earnedSpan = container.querySelector(SELECTORS.earnedScore);
        if (!earnedSpan) return;

        const earned = earnedSpan.innerText;
        const fullText = container.innerText; 
        const match = fullText.match(/\/\s*(\d+)/);
        const possible = match ? match[1] : 0; 

        const input = document.createElement('input');
        input.type = 'number';
        input.value = earned;
        input.className = 'what-if-input';
        input.dataset.possible = possible; 
        input.dataset.original = earned; 

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());

        input.addEventListener('input', () => {
            const topGrade = getOverallGradeElement();
            if (topGrade) recalculateOverall(topGrade);
        });


        earnedSpan.style.display = 'none';
        earnedSpan.parentNode.insertBefore(input, earnedSpan);
    });
}

function recalculateOverall(overallGradeElement) {
    let totalEarned = 0;
    let totalPossible = 0;
    let isChanged = false;

    const inputs = document.querySelectorAll('.what-if-input');
    
    inputs.forEach(input => {
        const currentValue = parseFloat(input.value) || 0;
        const originalValue = parseFloat(input.dataset.original) || 0;

        if (currentValue !== originalValue) {
            isChanged = true;
        }

        totalEarned += currentValue;
        totalPossible += parseFloat(input.dataset.possible) || 0;
    });

    if (totalPossible > 0) {
        if (isChanged) {
            const newPercentage = ((totalEarned / totalPossible) * 100).toFixed(2);
            overallGradeElement.innerText = `${newPercentage}% (Hypothetical)`;
            overallGradeElement.classList.add('hypothetical-changed');
        } else {
            overallGradeElement.innerText = overallGradeElement.dataset.originalText;
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

// breaks on SPA navigation, so we need to re-inject the inputs when the URL changes. simple way to detect URL changes without relying on specific events.
/*
let lastURL = location.href;
setInterval(() => {
    if (location.href !== lastURL) {
        lastURL = location.href;
        injectHypotheticalInputs();
    }
}, 1000);
*/