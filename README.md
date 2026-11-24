# 黑曜 · 个人博客

一个面向 Cloudflare Pages 的中文个人博客项目。前端为纯 HTML/CSS/JavaScript，后端使用 Cloudflare Pages Functions，文章存储在 D1，图片存储在 R2。

## 功能
- 黑色简约科技风，桌面与手机自适应
- 文章列表、分类筛选、关键词搜索
- 文章详情、Markdown 正文
- 管理后台：登录、创建、编辑、发布/取消发布、删除文章
- 图片上传到 Cloudflare R2，并可插入文章
- 不依赖付费模板或商业 CMS

## 部署前准备
需要 Cloudflare 免费账户。Pages、D1、R2 的免费额度和政策可能变化，超出免费额度可能无法继续使用或产生费用；请在 Cloudflare 控制台确认当前额度。R2 创建时选择免费额度适用的存储类别，不要启用额外付费服务。

## 一、创建 D1 数据库
1. 登录 https://dash.cloudflare.com/
2. 左侧进入 **Workers & Pages → D1 SQL Database**（控制台名称可能略有变化）。
3. 点击 **Create database**，数据库名称填写 `black-blog-db`。
4. 创建后记下 Database ID。
5. 进入数据库的 **Console**，执行 `schema.sql` 中全部 SQL。

## 二、创建 R2 图片存储桶
1. 控制台进入 **R2 Object Storage**。
2. 创建 bucket，名称填写 `black-blog-images`。
3. 不要公开整个 bucket；本项目通过 Pages Function `/api/image/...` 读取图片。
4. 记下 bucket 名称。

## 三、配置项目
打开 `wrangler.toml`：
- 把 `REPLACE_WITH_D1_DATABASE_ID` 替换成 D1 页面显示的 Database ID。
- `database_name` 应与创建时名称一致。
- bucket_name 应与 R2 bucket 名称一致。

## 四、设置后台密码和会话密钥
在 Windows 11 PowerShell 中，进入项目目录后运行：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

复制生成的随机字符串，作为 `SESSION_SECRET`。

安装 Wrangler（需要 Node.js LTS）：

```powershell
npm install
npx wrangler login
npx wrangler pages secret put ADMIN_PASSWORD --project-name black-blog
npx wrangler pages secret put SESSION_SECRET --project-name black-blog
```

按提示分别输入你自己设置的后台密码和随机会话密钥。不要把密码、密钥提交到 GitHub。

## 五、部署到 Cloudflare Pages
### 方法 A：命令行部署（适合第一次部署）
1. 安装 Node.js LTS：https://nodejs.org/
2. 解压项目 ZIP，PowerShell `cd` 到项目目录。
3. 运行：

```powershell
npm install
npx wrangler login
npx wrangler pages project create black-blog
npx wrangler pages deploy public --project-name black-blog
```

4. 在 Cloudflare Pages 项目的 **Settings → Functions → D1 database bindings** 中添加绑定：
   - Variable name: `DB`
   - D1 database: `black-blog-db`
5. 在 **R2 bucket bindings** 中添加绑定：
   - Variable name: `BLOG_IMAGES`
   - R2 bucket: `black-blog-images`
6. 确认生产环境和预览环境的绑定设置。生产环境至少要设置。
7. 在 Pages 项目 **Settings → Variables and Secrets** 中设置：
   - `ADMIN_PASSWORD`：后台登录密码
   - `SESSION_SECRET`：上面生成的随机密钥
8. 重新部署一次，让新绑定生效：

```powershell
npx wrangler pages deploy public --project-name black-blog
```

### 方法 B：GitHub 自动部署
可以把项目推送到 GitHub，再在 Cloudflare Pages 选择 **Connect to Git**。构建设置：
- Framework preset: None
- Build command: 留空
- Build output directory: `public`
然后仍需按上面步骤添加 D1、R2 绑定和 Secrets。

## 六、访问
- 博客首页：`https://你的项目名.pages.dev/`
- 管理后台：`https://你的项目名.pages.dev/admin/`

## 本地预览
安装依赖后：
```powershell
npm install
npx wrangler pages dev public
```
本地 API 需要先配置本地 D1/R2 绑定；首次部署建议按线上步骤创建资源。

## 安全提示
- 请使用强后台密码，并妥善保管 SESSION_SECRET。
- 不要把 `.dev.vars`、密码、私钥提交到公开仓库。
- 当前登录采用 HttpOnly Cookie + HMAC 签名会话；适合个人博客管理，不建议用作多用户企业 CMS。
- 图片上传限制为 5MB，允许 JPEG、PNG、WebP、GIF。
- 公开文章内容是访客可见内容，不要上传个人敏感资料。
- 自定义域名可在 Pages 项目 Custom domains 中绑定。
