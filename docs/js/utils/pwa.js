function registerServiceWorker(App) {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            App.state.deferredInstallPrompt = e;
            if (App.elements.installAppBtn) {
                App.elements.installAppBtn.style.display = 'flex';
            }
            console.log(`'beforeinstallprompt' event was fired.`);
        });
    }
}

export { registerServiceWorker };
