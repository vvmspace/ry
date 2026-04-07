module.exports = {
  apps: [
    {
      name: "ry-api",
      script: "./src/api/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ry-jobs-list",
      script: "./src/workers/jobsListWorker.js",
      instances: 1,
      autorestart: false,
      cron_restart: "0 * * * *",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ry-jobs-parse",
      script: "./src/workers/jobPageWorker.js",
      instances: 1,
      autorestart: true,
      restart_delay: 60000,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        USER_DIR: "./ud2"
      },
    },
    {
      name: "ry-cv-generate",
      script: "./src/workers/cvGenerationWorker.js",
      instances: 1,
      autorestart: true,
      restart_delay: 120000,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ry-links-fixer",
      script: "./src/workers/linksFixerWorker.js",
      instances: 1,
      autorestart: true,
      restart_delay: 120000,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        USER_DIR: "./ud2"
      },
    },
  ],
};
