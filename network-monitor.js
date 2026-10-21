window.createClassroomNetworkMonitor = function createClassroomNetworkMonitor() {
    let state = { available: false, pending: 0, failed: false, revision: 0 };
    let port;
    let heartbeat;
    let watching = 0;
    const listeners = new Set();

    function notify() {
        listeners.forEach(listener => listener());
    }

    function connect() {
        if (port || !globalThis.chrome?.runtime?.connect) return;
        try {
            port = chrome.runtime.connect({ name: 'gcgc-network' });
            port.onMessage.addListener(message => {
                if (message.type !== 'network') return;
                const changed = state.available !== message.available || state.pending !== message.pending ||
                    state.failed !== message.failed;
                state = message;
                if (changed) notify();
            });
            port.onDisconnect.addListener(() => {
                void chrome.runtime.lastError;
                const failed = state.failed || state.pending > 0;
                state = { available: false, pending: 0, failed, revision: state.revision + 1 };
                port = null;
                notify();
            });
        } catch (error) { port = null; }
    }

    connect();
    return {
        getState: () => state,
        watch(listener) {
            listeners.add(listener);
            watching++;
            connect();
            if (!heartbeat && port) {
                // Keep the worker's request alive even on very slow connections
                heartbeat = setInterval(() => {
                    try { port?.postMessage({ type: 'ping' }); } catch (error) {}
                }, 20000);
            }
            return () => {
                listeners.delete(listener);
                if (--watching === 0) {
                    clearInterval(heartbeat);
                    heartbeat = null;
                }
            };
        },
        resetRoute() {
            connect();
            try { port?.postMessage({ type: 'route' }); } catch (error) {}
        },
        setActivity(phase, assignmentCount = 0) {
            connect();
            try { port?.postMessage({ type: 'activity', phase, assignmentCount }); } catch (error) {}
        }
    };
};
