module.exports = {
    apps: [
      {
        name: "nvccz-server",
        script: "dist/app.js",
        cwd: "/root/projects/nvccz-server",
        instances: 1,
        exec_mode: "cluster",
        env: {
          NODE_ENV: "production",
          PORT: 3000
        },
        env_file: ".env",
        error_file: "/var/log/pm2/nvccz-server-error.log",
        out_file: "/var/log/pm2/nvccz-server-out.log",
        log_file: "/var/log/pm2/nvccz-server.log",
        time: true,
        max_memory_restart: "1G",
        restart_delay: 4000,
        max_restarts: 10,
        min_uptime: "10s"
      }
    ]
  };
  