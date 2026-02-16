export default {
  async init(App) {
    if (App.state.mapModuleInitialized) {
      if (App.state.mapboxMap) {
        setTimeout(() => App.state.mapboxMap.resize(), 0);
      }
      return;
    }

    App.state.mapModuleInitialized = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    App.mapModule.initMap();
  },
};
