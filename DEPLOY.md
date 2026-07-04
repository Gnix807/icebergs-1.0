# 部署指南

## 1. 服务器准备

### 环境要求
- Ubuntu 22.04+ / Debian 12+
- Node.js 22+
- PostgreSQL 18
- Nginx（反向代理 + HTTPS）

### 安装依赖
```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Nginx
sudo apt-get install -y nginx

# PM2（进程守护）
sudo npm install -g pm2
```

### 创建数据库
```bash
sudo -u postgres psql
CREATE USER icebergs WITH PASSWORD '你的强密码' CREATEDB;
CREATE DATABASE icebergs OWNER icebergs;
\q
```

---

## 2. 部署项目

```bash
# 克隆代码
git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs
cd /opt/icebergs/frontend

# 配置环境变量（生产环境）
cp .env.example .env
nano .env

# 安装依赖并构建
npm install
npx prisma generate
npx prisma db push
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql
npm run build

# PM2 启动
pm2 start dist/server/entry.mjs --name icebergs
pm2 save
pm2 startup
```

---

## 3. 环境变量（生产环境 `.env`）

```env
# 数据库
DATABASE_URL="postgresql://icebergs:你的密码@localhost:5432/icebergs"

# GitHub OAuth（需要在 GitHub 更新回调地址）
GITHUB_CLIENT_ID=你的ClientID
GITHUB_CLIENT_SECRET=你的ClientSecret

# 回调地址 → 改为你的域名
REDIRECT_URI=https://你的域名.com/api/auth/callback

# 环境
NODE_ENV=production

# Cron 密钥（改成随机字符串）
CRON_SECRET=随机字符串
```

---

## 4. Nginx 配置

`/etc/nginx/sites-available/icebergs`:

```nginx
server {
    listen 80;
    server_name 你的域名.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 你的域名.com;

    ssl_certificate     /etc/letsencrypt/live/你的域名.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/你的域名.com/privkey.pem;

    # 用户上传文件
    location /uploads/ {
        alias /opt/icebergs/frontend/public/uploads/;
        expires 30d;
    }

    # 静态资源缓存
    location /_astro/ {
        alias /opt/icebergs/frontend/dist/client/_astro/;
        expires 1y;
    }

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/icebergs /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. HTTPS（Let's Encrypt）

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
sudo systemctl enable certbot.timer
```

---

## 6. 部署后检查清单

- [ ] `.env` 已配置生产环境变量
- [ ] `NODE_ENV=production` 已设置
- [ ] `REDIRECT_URI` 已更新为生产域名
- [ ] GitHub OAuth App 的回调地址已更新为 `https://你的域名.com/api/auth/callback`
- [ ] POST 请求正常（`npm run build` 并在浏览器打开后登录试试）
- [ ] Nginx HTTPS 已配置
- [ ] PM2 已设置自启动（`pm2 startup`）
- [ ] Cron 端点已配置定时任务（可选，用于选举/RfA 自动推进）

---

## 7. Cron 定时任务（可选）

如果启用了社区治理功能（选举/RfA/弹劾），需要配置定时任务：

```bash
# 每 10 分钟检查一次
*/10 * * * * curl -s -H "Authorization: Bearer CRON_SECRET" https://你的域名.com/api/admin/cron/advance-elections > /dev/null 2>&1
*/10 * * * * curl -s -H "Authorization: Bearer CRON_SECRET" https://你的域名.com/api/admin/cron/advance-rfa > /dev/null 2>&1
*/10 * * * * curl -s -H "Authorization: Bearer CRON_SECRET" https://你的域名.com/api/admin/cron/advance-impeach > /dev/null 2>&1
```

---

## 8. 日常维护

```bash
# 更新代码
cd /opt/icebergs/frontend
git pull
npm install
npx prisma db push
npm run build
pm2 restart icebergs

# 查看日志
pm2 logs icebergs

# 查看状态
pm2 status
```
