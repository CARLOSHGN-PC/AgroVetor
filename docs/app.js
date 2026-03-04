import './modules/core/app-core.js';
import './modules/core/dom.js';

import './modules/apontamentos/apontamento-plantio.js';
import './modules/apontamentos/apontamento-colheita.js';

import './modules/relatorios/relatorio-plantio.js';
import './modules/relatorios/relatorio-colheita.js';

import './modules/services/firestore.js';
import './modules/services/offline.js';

if (window.App && typeof window.App.init === 'function' && !window.__AGROVETOR_APP_INITIALIZED__) {
  window.__AGROVETOR_APP_INITIALIZED__ = true;
  window.App.init();
}
