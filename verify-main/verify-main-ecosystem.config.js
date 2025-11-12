module.exports = {
  apps: [
    {
      name: 'verify-main',
      script: './.next/standalone/status-verify/verify-main/server.js',
      //cwd: '/Users/pegasus/Documents/argos/_project/status-verify/verify-main',
      cwd: '/home/ubuntu/status-verify/verify-main/',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 80
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 80
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 80
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 5000,
      kill_timeout: 5000,
      wait_ready: true
    }
  ],

  // PM2 Deploy Configuration
  // 사용법: pm2 deploy ecosystem.config.js production setup
  //        pm2 deploy ecosystem.config.js production
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/verify-main.git',
      path: '/var/www/verify-main',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build:standalone && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
