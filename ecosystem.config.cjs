// Janggi Arena — PM2 구성
// 주의: janggi-tunnel-* 는 Cloudflare 퀵 터널이라 재시작하면 URL이 바뀐다.
// URL이 바뀌면 web은 NEXT_PUBLIC_SERVER_URL로 재빌드, server는 CORS_ORIGIN 갱신 후 재시작 필요.
module.exports = {
  apps: [
    {
      name: "janggi-server",
      cwd: __dirname + "/apps/server",
      script: "dist/main.js",
      env: {
        PORT: 4301,
        CORS_ORIGIN: "https://locked-arising-primarily-gdp.trycloudflare.com",
      },
    },
    {
      name: "janggi-web",
      cwd: __dirname + "/apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 4302",
    },
    {
      name: "janggi-tunnel-web",
      script: "cloudflared",
      args: "tunnel --url http://localhost:4302 --no-autoupdate",
    },
    {
      name: "janggi-tunnel-server",
      script: "cloudflared",
      args: "tunnel --url http://localhost:4301 --no-autoupdate",
    },
  ],
};
