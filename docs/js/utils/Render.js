
// utils/Render.js

/**
 * Optimizes list rendering using DocumentFragment to avoid reflows.
 * @param {HTMLElement} container - The container element.
 * @param {Array} items - Data array.
 * @param {Function} renderItemFn - Function that returns an HTML string or Element for a single item.
 */
export function renderListOptimized(container, items, renderItemFn) {
    if (!container) return;

    container.innerHTML = ''; // Clear once

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum item encontrado.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const itemContent = renderItemFn(item);

        if (typeof itemContent === 'string') {
            // If string, we need a wrapper or temporary container
            // This is slightly less efficient than returning Elements but compatible with legacy strings
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = itemContent;
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
        } else if (itemContent instanceof Node) {
            fragment.appendChild(itemContent);
        }
    });

    container.appendChild(fragment); // Single Reflow
}

// Example usage function for 'Planejamento'
export function renderPlanejamentoCard(plano) {
    const card = document.createElement('div');
    card.className = 'plano-card';
    // Using Template Literals securely
    card.innerHTML = `
        <div class="plano-header">
            <span class="plano-title">
                <i class="fas fa-${plano.tipo === 'broca' ? 'bug' : 'dollar-sign'}"></i>
                ${plano.fazendaCodigo} - Talhão: ${plano.talhao}
            </span>
            <span class="plano-status ${plano.status.toLowerCase()}">${plano.status}</span>
        </div>
        <div class="plano-details">
            <div><i class="fas fa-calendar-day"></i> ${plano.dataPrevista}</div>
            <div><i class="fas fa-user-check"></i> ${plano.usuarioResponsavel}</div>
        </div>
        <div class="plano-actions">
            <button class="btn-action" data-id="${plano.id}">Ação</button>
        </div>
    `;
    return card;
}
