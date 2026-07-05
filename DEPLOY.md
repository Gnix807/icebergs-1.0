# 部署指南 (1Panel)

## 1. 创建 PostgreSQL 数据库

1. 进入 1Panel → **数据库** → **PostgreSQL**
2. 点击 **创建数据库**
3. 填写：
   - 数据库名：`icebergs`
   - 用户名：`icebergs`
   - 密码：设置一个强密码
4. 记录连接信息，之后要填入 `.env`

## 首次部署

### 1. 创建 PostgreSQL 数据库

1. 1Panel → **数据库** → **PostgreSQL** → **创建数据库**
2. 填写数据库名 `icebergs`，用户名 `icebergs`，设置密码。

### 2. 上传项目

1Panel → **文件** → 进入 `/opt/` → 创建目录 `icebergs`。

上传代码（二选一）：
- ZIP 上传后解压
- 终端执行 `git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs`

### 3. 首次安装

打开 1Panel 终端，执行：

```bash
cd /opt/icebergs/frontend
cp .env.example .env      # 编辑 .env（见下方说明）
npm install
npx prisma generate
npx prisma db push
node prisma/seed.mjs
node prisma/seed-achievements.mjs
npm run build
```

### 4. 配置 .env

用 1Panel 文件编辑器编辑 `.env`：

```env
DATABASE_URL="postgresql://icebergs:你的密码@localhost:5432/icebergs"
GITHUB_CLIENT_ID=你的ClientID
GITHUB_CLIENT_SECRET=你的ClientSecret
REDIRECT_URI=https://你的域名/api/auth/callback
NODE_ENV=production
CRON_SECRET=随机字符串
```

### 5. 初始化全文搜索

1Panel → 数据库 → icebergs → SQL 窗口 → 粘贴 `prisma/migrations/001_fulltext_search.sql` 内容并执行。

### 6. 创建反向代理

1. 1Panel → **网站** → **创建网站** → **反向代理**
2. 域名填你的域名，代理地址 `http://127.0.0.1:4321`
3. 创建后在 **SSL** 页一键申请证书

### 7. 启动进程守护

1. 1Panel → **进程守护** → **新建**
2. 名称：`icebergs`
3. 启动命令：`/usr/bin/node /opt/icebergs/frontend/dist/server/entry.mjs`
4. 工作目录：`/opt/icebergs/frontend`
5. 进程数：`1`

### 8. 更新 GitHub OAuth 回调

GitHub → Settings → Developer Settings → OAuth Apps，将回调地址改为：
```
https://你的域名/api/auth/callback
```

### 9. 可选：Cron 定时任务

1Panel → **计划任务**，添加：

| 脚本名 | 周期 | 命令 |
|--------|------|------|
| 选举推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-elections` |
| RfA 推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-rfa` |
| 弹劾推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-impeach` |

---

## 后续更新

以后每次更新代码只需要：

```bash
cd /opt/icebergs/frontend && bash deploy.sh
```

或在 1Panel 计划任务中设置定时执行 `bash /opt/icebergs/frontend/deploy.sh`。

唯一需要手动改的永远是 `.env`，其他全部自动。

## 部署检查清单

- [ ] PostgreSQL 数据库已创建
- [ ] `.env` 已配置（唯一需要手动编辑的文件）
- [ ] `npm run build` 无报错
- [ ] 全文搜索 SQL 已执行
- [ ] 反向代理 + SSL 已配置
- [ ] 进程守护已启动
- [ ] GitHub OAuth 回调地址已更新
- [ ] 浏览器打开 `https://你的域名` 确认可访问
