const cache = new Map();

const loaders = {
  monitoramentoAereo: () => import('../modules/monitoramentoAereo.module.js'),
  fleet: () => import('../fleet.js'),
};

export async function loadModule(name) {
  if (!loaders[name]) return null;
  if (cache.has(name)) return cache.get(name);
  const mod = await loaders[name]();
  cache.set(name, mod.default || mod);
  return cache.get(name);
}

export function prefetchModules(names = []) {
  names.forEach((name, index) => {
    const run = () => loadModule(name).catch((error) => console.warn(`[ModuleLoader] Prefetch falhou para ${name}`, error));
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 2500 + (index * 200) });
    } else {
      setTimeout(run, 200 + (index * 100));
    }
  });
}
