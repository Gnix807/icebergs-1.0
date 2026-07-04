# 部署指南 (1Panel)

## 1. 创建 PostgreSQL 数据库

1. 进入 1Panel → **数据库** → **PostgreSQL**
2. 点击 **创建数据库**
3. 填写：
   - 数据库名：`icebergs`
   - 用户名：`icebergs`
   - 密码：设置一个强密码
4. 记录连接信息，之后要填入 `.env`

## 2. 上传项目

1. 1Panel → **文件** → 进入 `/opt/`，创建目录 `icebergs`
2. 上传代码（二选一）：
   - **ZIP 上传**：本地打包 `frontend/` 目录，在文件管理里上传解压
   - **Git 克隆**：在 1Panel 终端执行：
     ```bash
     git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs
     ```

> 项目代码在 `/opt/icebergs/frontend/` 目录下，后续所有路径以此为准。

## 3. 安装依赖 + 构建

在 1Panel 终端执行：

```bash
cd /opt/icebergs/frontend

# 配置环境变量
cp .env.example .env
# 用 1Panel 文件编辑器修改 .env（内容见下一步）

# 安装依赖
npm install

# 初始化数据库
npx prisma generate
npx prisma db push

# 构建
npm run build
```

### 初始化全文搜索索引

在 1Panel 数据库 UI 中找到 `icebergs` 库 → 点击 **SQL 窗口** → 将以下文件内容粘贴执行：

```
prisma/migrations/001_fulltext_search.sql
```

## 4. 配置环境变量（`.env`）

用 1Panel 文件编辑器打开 `/opt/icebergs/frontend/.env`：

```env
DATABASE_URL="postgresql://icebergs:你的密码@localhost:5432/icebergs"
GITHUB_CLIENT_ID=你的ClientID
GITHUB_CLIENT_SECRET=你的ClientSecret
REDIRECT_URI=https://你的域名/api/auth/callback
NODE_ENV=production
CRON_SECRET=随机字符串
```

## 5. 创建网站 + 反向代理

1. 1Panel → **网站** → **创建网站** → **反向代理**
2. 填写：
   - 域名：`你的域名.com`
   - 代理地址：`http://127.0.0.1:4321`
3. 创建后在 **网站设置** → **SSL** 中一键申请 Let's Encrypt 证书
4. 在 **配置文件** 中追加静态资源缓存：

```nginx
location /uploads/ {
    alias /opt/icebergs/frontend/public/uploads/;
    expires 30d;
}
location /_astro/ {
    alias /opt/icebergs/frontend/dist/client/_astro/;
    expires 1y;
}
```

## 6. 启动并守护进程

选择以下两种方式之一：

### 方式 A：进程守护（推荐）

1. 1Panel → **进程守护** → **新建**
2. 填写：
   - 名称：`icebergs`
   - 启动命令：`/usr/bin/node /opt/icebergs/frontend/dist/server/entry.mjs`
   - 工作目录：`/opt/icebergs/frontend`
   - 进程数：`1`
3. 点击确定，自动启动并守护

### 方式 B：PM2

```bash
cd /opt/icebergs/frontend
npm install -g pm2
pm2 start dist/server/entry.mjs --name icebergs
pm2 save
pm2 startup
```

## 7. 更新 GitHub OAuth 回调地址

GitHub → Settings → Developer Settings → OAuth Apps → 你的 App，将回调地址更新为：

```
https://你的域名/api/auth/callback
```

> 如果不更新，GitHub 登录回调会失败。

## 8. Cron 定时任务（可选）

如启用了选举/RfA/弹劾功能，在 1Panel → **计划任务** 中添加：

| 脚本名 | 周期 | 命令 |
|--------|------|------|
| 选举推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-elections` |
| RfA 推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-rfa` |
| 弹劾推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-impeach` |

---

## 9. 日常维护

```bash
# 更新代码
cd /opt/icebergs/frontend
git pull
npm install
npx prisma db push
npm run build
# 然后在 1Panel 进程守护中重启 icebergs

# 或者在 PM2 中
pm2 restart icebergs
```

## 10. 部署检查清单

- [ ] `.env` 已配置生产环境变量
- [ ] `NODE_ENV=production`
- [ ] `REDIRECT_URI` 已更新为生产域名
- [ ] GitHub OAuth App 回调地址已更新
- [ ] 数据库已创建，`prisma db push` 已执行
- [ ] 全文搜索 SQL 已执行
- [ ] 网站反向代理已创建
- [ ] SSL 证书已申请
- [ ] 进程守护/PM2 已配置
- [ ] 浏览器打开 `https://你的域名` 确认可访问
