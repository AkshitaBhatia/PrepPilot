module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      // Drizzle's migration bundle imports .sql files as strings. Without this
      // the app opens a database whose tables were never created, and the first
      // query fails at runtime.
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
