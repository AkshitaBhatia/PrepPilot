module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'better-sqlite3' && pkg.scripts) {
        delete pkg.scripts.install;
        delete pkg.scripts.postinstall;
        delete pkg.scripts.build;
      }
      return pkg;
    }
  }
};
