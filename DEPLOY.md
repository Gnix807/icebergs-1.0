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

上传代码：
- 终端执行 `git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs`
- 或者下载 ZIP 后通过 1Panel 文件管理上传解压

### 3. 首次安装

打开 1Panel 终端，执行：

```bash
cd /opt/icebergs
cp .env.example .env      # 编辑 .env（见下方说明）
npm install
npx prisma generate
npx prisma db push
node prisma/seed.mjs
node prisma/seed-achievements.mjs
# 可选：生成演示数据
node prisma/seed-demo.mjs
```

构建前，将 `astro.config.mjs` 中的 `site` 改为你的域名：
```js
site: 'https://你的域名',
```

然后构建：
```bash
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

> **注意**：SEO 相关配置（搜索引擎验证码、分析代码等）不需要写在 `.env` 里。部署后在管理后台 → SEO 面板中填入即可，数据存储在数据库中。

### 5. 初始化全文搜索

1Panel → 数据库 → icebergs → SQL 窗口 → 粘贴 `prisma/migrations/001_fulltext_search.sql` 内容并执行。

### 6. 创建反向代理

1. 1Panel → **网站** → **创建网站** → **反向代理**
2. 域名填你的域名，代理地址 `http://127.0.0.1:4321`
3. 创建后在 **SSL** 页一键申请证书

### 7. 启动进程守护

1. 1Panel → **进程守护** → **新建**
2. 名称：`icebergs`
3. 启动命令：`/usr/bin/node /opt/icebergs/dist/server/entry.mjs`
4. 工作目录：`/opt/icebergs`
5. 进程数：`1`

### 8. 更新 GitHub OAuth 回调

GitHub → Settings → Developer Settings → OAuth Apps，将回调地址改为：
```
https://你的域名/api/auth/callback
```

### 9. 接入搜索引擎（可选，推荐）

部署完成后，登录管理面板 `/user/你的用户名?tab=admin` → **SEO** 标签页：

1. **Google**：Google Search Console → 添加资源 → HTML 标记验证 → 复制 `content` 值填入「Google 验证码」→ 保存 → 回到 Search Console 验证 → 提交 `/sitemap.xml`
2. **百度**：百度搜索资源平台 → 站点验证 → HTML 标签验证 → 复制 `content` 值填入「百度验证码」→ 保存 → 验证通过 → 提交 sitemap
3. **Bing**：Bing Webmaster Tools → 添加站点 → 复制验证码填入「Bing 验证码」→ 验证 → 提交 sitemap
4. **分析代码**：填入 Google Analytics ID（G-XXX）和百度统计 ID，保存后全站生效

### 10. 可选：Cron 定时任务

1Panel → **计划任务**，添加：

| 脚本名 | 周期 | 命令 |
|--------|------|------|
| 选举推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-elections` |
| RfA 推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-rfa` |
| 弹劾推进 | `*/10 * * * *` | `curl -s https://你的域名/api/admin/cron/advance-impeach` |

---

---

## 数据库备份

1Panel → **计划任务**，添加定时备份脚本：

| 脚本名 | 周期 | 命令 |
|--------|------|------|
| 数据库备份 | `0 3 * * *` | `pg_dump -U icebergs icebergs > /opt/backups/icebergs_$(date +%Y%m%d).sql` |

或使用 1Panel 内置的数据库备份功能：数据库 → icebergs → 备份 → 设置自动备份周期。

---

## 后续更新

以后每次更新代码只需要：

```bash
cd /opt/icebergs && bash deploy.sh
```

或在 1Panel 计划任务中设置定时执行 `bash /opt/icebergs/deploy.sh`。

唯一需要手动改的永远是 `.env`，其他全部自动。

## 部署检查清单

- [ ] PostgreSQL 数据库已创建
- [ ] `.env` 已配置
- [ ] `npm run build` 无报错
- [ ] 全文搜索 SQL 已执行
- [ ] 反向代理 + SSL 已配置
- [ ] 进程守护已启动
- [ ] GitHub OAuth 回调地址已更新
- [ ] 浏览器打开 `https://你的域名` 确认可访问
- [ ] SEO 面板配置搜索引擎验证码（Google / 百度 / Bing）
- [ ] 搜索引擎提交 `/sitemap.xml`

---

## 性能调优（推荐）

### Nginx 缓存静态资源

在 1Panel → 网站 → 你的域名 → 配置 → 添加：

```nginx
# 静态文件缓存 30 天
location ~* \.(js|css|png|jpg|svg|woff2)$ {
  expires 30d;
  add_header Cache-Control "public, immutable";
}
```

### PostgreSQL 内存优化

编辑 PostgreSQL 配置文件（通常在 `/var/lib/pgsql/data/postgresql.conf` 或 1Panel 数据库设置中）：

```
shared_buffers = 512MB
effective_cache_size = 2GB
work_mem = 16MB
```

### Cloudflare CDN（免费）

将域名 DNS 托管到 Cloudflare，获得全球 CDN 缓存和 DDoS 防护。

---

## 上线前清理

如果从本地数据库迁移到生产，建议清理测试数据：

```bash
# 删除演示冰山图
psql -U icebergs icebergs -c "DELETE FROM icebergs WHERE slug LIKE 'demo_%';"

# 清空测试用户的成就数据（保留成就定义）
psql -U icebergs icebergs -c "DELETE FROM user_achievements;"

# 创始人密码置空，上线后用「忘记密码」重设
psql -U icebergs icebergs -c "UPDATE users SET \"passwordHash\" = NULL WHERE \"isFounder\" = true;"
```

测试账号（如 `test1@icebergs.local`）可直接在 1Panel 数据库界面删除。
