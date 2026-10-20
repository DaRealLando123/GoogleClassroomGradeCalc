// Loads Classroom's lazy assignment list before the calculator reads its totals.
window.createGradeLoader = function createGradeLoader(options) {
    const quietMs = options.quietMs ?? 1600;
    const readyQuietMs = options.readyQuietMs ?? 150;
    const maxDurationMs = options.maxDurationMs ?? 0;
    const originalPositions = new Map();
    let active = false;
    let frame = null;
    let checkTimer;
    let timeoutTimer;
    let lastActivity;
    let lastListActivity;
    let lastTarget;
    let lastHeight;
    let lastViewport;
    let progressDirty = true;
    let lastProgress;
    let sweepTarget;
    let nextSweepTop = 0;
    let unwatchNetwork;

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
        unwatchNetwork?.();
        unwatchNetwork = null;
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
        const network = options.network?.getState();
        if (network?.failed) {
            stop('network-error');
            return;
        }
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
            lastListActivity = now;
            if (target !== lastTarget || metrics.height < lastHeight - metrics.viewport || metrics.viewport !== lastViewport) {
                sweepTarget = null;
            }
            lastTarget = target;
            lastHeight = metrics.height;
            lastViewport = metrics.viewport;
        }

        if (progressDirty) {
            progressDirty = false;
            const progress = options.getProgress();
            if (!lastProgress || progress.assignmentCount !== lastProgress.assignmentCount) lastListActivity = now;
            if (!lastProgress || progress.gradeCount !== lastProgress.gradeCount ||
                progress.assignmentCount !== lastProgress.assignmentCount) {
                lastActivity = now;
                options.onProgress(progress);
            }
            lastProgress = progress;
        }

        const bottom = Math.max(0, metrics.height - metrics.viewport);
        // Missing grades may hydrate only when their rows enter the viewport.
        // Overlap each position and allow a paint before advancing again.
        if (lastProgress?.hasAllGradeData === false && metrics.viewport > 0) {
            if (sweepTarget !== target) {
                sweepTarget = target;
                nextSweepTop = 0;
            }
            if (nextSweepTop < bottom) {
                target.scrollTo({ top: nextSweepTop, left: metrics.left, behavior: 'instant' });
                nextSweepTop += Math.max(1, metrics.viewport * 0.8);
                lastActivity = now;
                lastListActivity = now;
                scheduleStep();
                return;
            }
        }
        const atBottom = Math.abs(metrics.top - bottom) <= 1;
        if (!atBottom) {
            lastActivity = now;
            lastListActivity = now;
            target.scrollTo({ top: bottom, left: metrics.left, behavior: 'instant' });
        }

        const pending = network?.pending > 0 || options.hasPendingLoad();
        if (pending) lastActivity = now;
        // A complete visible batch does not prove that pagination is finished.
        // Track list stability separately so late scores need only a short settle
        // once the assignment list itself has already been quiet.
        // Titles include ungraded assignments. A fully swept, network-idle list
        // must not wait for a numeric score to appear on every title.
        const scoresReady = lastProgress?.hasAllGradeData ||
            (lastProgress?.hasPendingGradeData === false && lastProgress.gradeCount > 0);
        const fastCompletion = network?.available && scoresReady;
        const listQuietMs = fastCompletion ? readyQuietMs : quietMs;
        const settleMs = fastCompletion || lastProgress?.hasAllGradeData ? readyQuietMs : quietMs;
        if (atBottom && !pending && now - lastListActivity >= listQuietMs && now - lastActivity >= settleMs) {
            cleanup(false);
            target.scrollTo({ top: 0, left: metrics.left, behavior: 'instant' });
            options.onComplete();
            return;
        }

        clearTimeout(checkTimer);
        const untilReady = Math.max(listQuietMs - (now - lastListActivity), settleMs - (now - lastActivity));
        checkTimer = setTimeout(scheduleStep, pending ? 250 : Math.max(16, Math.min(250, untilReady)));
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
            lastListActivity = lastActivity;
            mutationObserver.observe(options.root, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-busy', 'aria-hidden', 'hidden']
            });
            unwatchNetwork = options.network?.watch(() => {
                lastActivity = performance.now();
                progressDirty = true;
                scheduleStep();
            });
            if (maxDurationMs > 0) timeoutTimer = setTimeout(() => stop('timeout'), maxDurationMs);
            scheduleStep();
        },
        cancel({ restorePosition = false } = {}) {
            cleanup(restorePosition);
        },
        stop
    };
};
