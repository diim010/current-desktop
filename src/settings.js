const Store = require('electron-store');

const schema = {
  libraryPath: {
    type: 'string',
    description: 'Directory where downloaded tracks are stored',
  },
  theme: {
    type: 'string',
    enum: ['light', 'dark'],
    default: 'dark',
    description: 'UI theme',
  },
};

const store = new Store({ schema });

module.exports = {
  getConfig: () => store.store,
  setConfig: (partial) => store.set(partial),
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
};
