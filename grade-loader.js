// Loads Classroom's lazy assignment list before the calculator reads its totals.
window.createGradeLoader = function createGradeLoader(options) {
    const quietMs = options.quietMs ?? 1600;
    const readyQuietMs = options.readyQuietMs ?? 150;
    const maxDurationMs = options.maxDurationMs ?? 45000;
    const originalPositions = new Map();
    let active = false;
    let frame = null;
    let checkTimer;
    let timeoutTimer;
    let lastActivity;
    let lastTarget;
    let lastHeight;
    let lastViewport;
    let progressDirty = true;
    let lastProgress;

    function scrollMetrics(target) {
        const element = target === window ? document.scrollingElement : target;
        return {
            top: target === window ? window.scrollY : element.scrollTop,
            left: target === window ? window.scrollX : element.scrollLeft,
            height: element.scrollHeight,
            viewport: target === window ? window.innerHeight : element.clientHeight
        };
    }

    function cleanup(restorePosition) {
        active = false;
        mutationObserver.disconnect();
        clearTimeout(checkTimer);
        clearTimeout(timeoutTimer);
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (restorePosition) {
            originalPositions.forEach((position, target) => {
                if (target === window || target.isConnected) {
                    target.scrollTo({ ...position, behavior: 'instant' });
                }
            });
        }
    }

    function scheduleStep() {
        if (active && frame === null) frame = requestAnimationFrame(step);
    }

    function step() {
        frame = null;
        if (!active) return;
        const target = options.getScrollTarget();
        if (!target || (target !== window && !target.isConnected)) {
            stop('unavailable');
            return;
        }

        const metrics = scrollMetrics(target);
        const now = performance.now();
        if (!originalPositions.has(target)) {
            originalPositions.set(target, { top: metrics.top, left: metrics.left });
        }
        if (target !== lastTarget || metrics.height !== lastHeight || metrics.viewport !== lastViewport) {
            lastActivity = now;
            lastTarget = target;
            lastHeight = metrics.height;
            lastViewport = metrics.viewport;
        }

        if (progressDirty) {
            progressDirty = false;
            const progress = options.getProgress();
            if (!lastProgress || progress.gradeCount !== lastProgress.gradeCount ||
                progress.assignmentCount !== lastProgress.assignmentCount) {
                lastActivity = now;
                options.onProgress(progress);
            }
            lastProgress = progress;
        }

        const bottom = Math.max(0, metrics.height - metrics.viewport);
        const atBottom = Math.abs(metrics.top - bottom) <= 1;
        if (!atBottom) {
            lastActivity = now;
            target.scrollTo({ top: bottom, left: metrics.left, behavior: 'instant' });
        }

        const pending = options.hasPendingLoad();
        if (pending) lastActivity = now;
        // Classroom exposes no documented end-of-list signal. Require a quiet list
        // at the bottom, and keep waiting while its loading indicator is visible.
        const settleMs = lastProgress?.hasAllGradeData ? readyQuietMs : quietMs;
        if (atBottom && !pending && now - lastActivity >= settleMs) {
            cleanup(false);
            target.scrollTo({ top: 0, left: metrics.left, behavior: 'instant' });
            options.onComplete();
            return;
        }

        clearTimeout(checkTimer);
        checkTimer = setTimeout(scheduleStep, 150);
    }

    const mutationObserver = new MutationObserver(mutations => {
        if (!active || !mutations.some(options.isRelevantMutation)) return;
        lastActivity = performance.now();
        progressDirty = true;
        scheduleStep();
    });

    function stop(reason = 'cancelled') {
        if (!active) return;
        cleanup(true);
        options.onStop(reason);
    }

    return {
        start() {
            if (active) return;
            active = true;
            lastActivity = performance.now();
            mutationObserver.observe(options.root, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-busy', 'aria-hidden', 'hidden']
            });
            timeoutTimer = setTimeout(() => stop('timeout'), maxDurationMs);
            scheduleStep();
        },
        cancel({ restorePosition = false } = {}) {
            cleanup(restorePosition);
        },
        stop
    };
};
