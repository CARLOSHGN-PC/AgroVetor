export default class VirtualList {
    constructor({ containerId, items, renderItem, pageSize = 20, emptyMessage = 'Nenhum item encontrado.' }) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.items = items;
        this.renderItem = renderItem;
        this.pageSize = pageSize;
        this.emptyMessage = emptyMessage;
        this.currentIndex = 0;
        this.loading = false;

        this.init();
    }

    init() {
        this.container.innerHTML = '';
        if (!this.items || this.items.length === 0) {
            this.container.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--color-text-light);">${this.emptyMessage}</p>`;
            return;
        }

        // Create a sentinel element for IntersectionObserver
        this.sentinel = document.createElement('div');
        this.sentinel.className = 'virtual-list-sentinel';
        this.sentinel.style.height = '20px';
        this.sentinel.style.width = '100%';
        // this.sentinel.style.backgroundColor = 'red'; // Debug

        this.renderBatch();

        // Setup observer
        const options = {
            root: null, // viewport
            rootMargin: '0px',
            threshold: 0.1
        };

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.renderBatch();
            }
        }, options);

        this.container.appendChild(this.sentinel);
        this.observer.observe(this.sentinel);
    }

    renderBatch() {
        if (this.loading || this.currentIndex >= this.items.length) {
            return;
        }

        this.loading = true;

        // Temporarily unobserve
        if (this.sentinel) {
            this.observer.unobserve(this.sentinel);
            this.sentinel.remove();
        }

        const fragment = document.createDocumentFragment();
        const nextIndex = Math.min(this.currentIndex + this.pageSize, this.items.length);

        for (let i = this.currentIndex; i < nextIndex; i++) {
            const item = this.items[i];
            const itemContent = this.renderItem(item);

            if (itemContent instanceof Node) {
                fragment.appendChild(itemContent);
            } else if (typeof itemContent === 'string') {
                const temp = document.createElement('div');
                temp.innerHTML = itemContent.trim();
                while (temp.firstChild) {
                    fragment.appendChild(temp.firstChild);
                }
            }
        }

        this.container.appendChild(fragment);
        this.currentIndex = nextIndex;

        // Re-append sentinel if there are more items
        if (this.currentIndex < this.items.length) {
            this.container.appendChild(this.sentinel);
            this.observer.observe(this.sentinel);
        }

        this.loading = false;
    }

    updateItems(newItems) {
        this.items = newItems;
        this.currentIndex = 0;
        this.init();
    }
}
