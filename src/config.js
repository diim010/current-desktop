const Store = require('electron-store');

// Define the schema for settings
const schema = {
  libraryPath: {
    type: 'string',
    default: ''
  },
  theme: {
    type: 'string',
    enum: ['light', 'dark'],
    default: 'dark'
  }
};

const store = new Store({ schema });

module.exports = {
  /** Get a setting value */
  get: (key) => store.get(key),

  /** Set a setting value */
  set: (key, value) => store.set(key, value),

  /** Retrieve all settings */
  getAll: () => store.store,
};
