module.exports = {
  apps: [
    {
      name: 'frangello-store',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DATA_DIR: './data'
      }
    }
  ]
};

