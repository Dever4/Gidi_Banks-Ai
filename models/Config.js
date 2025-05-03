// This file is disabled to prevent MongoDB initialization errors
// The application now uses QuickDB for configuration storage

const Config = {
  // Stub methods to prevent errors if any code still tries to use this module
  getByKey: async function(key, defaultValue = null) {
    console.warn(`⚠️ Deprecated: Config.getByKey('${key}') called. Use QuickDB instead.`);
    return defaultValue;
  },

  setByKey: async function(key, value, description = '', updatedBy = 'system') {
    console.warn(`⚠️ Deprecated: Config.setByKey('${key}') called. Use QuickDB instead.`);
    return { key, value };
  }
};

module.exports = Config;
