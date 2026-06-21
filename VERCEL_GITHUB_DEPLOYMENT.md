# GitHub + Vercel 部署方案

目標：把 Voice Cue Slide Tool 變成一個可公開使用、不同用戶都可以開網站使用的工具。

---

## 建議分階段部署

### Phase 1：Static MVP（最快可上線）

特點：

- 不用登入
- 不用後端
- 不儲存用戶檔案到伺服器
- 用戶在瀏覽器本機載入投影片圖片和 cue CSV
- Chrome / Edge 在瀏覽器內做語音辨識
- 可部署到 GitHub + Vercel

適合：先讓不同用戶試用工具。

目前 `voice_slide_web/index.html` 就是這個版本。

---

### Phase 2：Multi-user Project 版本

特點：

- 用戶登入
- 每個用戶有自己的 project
- 可上傳 slide 圖片 / PDF / cue / script
- 可儲存 cue 設定
- 可再次打開同一個 project

推薦技術：

- Frontend：Next.js on Vercel
- Auth：Supabase Auth
- Database：Supabase Postgres
- File Storage：Supabase Storage 或 Cloudflare R2

---

### Phase 3：自動解析 A/B 檔

特點：

- 上傳 PPTX / PDF / Canva 匯出檔
- 系統自動轉成 slide images
- 上傳 DOCX / PDF / TXT 司儀稿
- 系統自動抽取可讀句子
- 系統自動建議 cue

注意：

Vercel serverless 不適合直接跑 LibreOffice 轉 PPTX。建議：

- Vercel：網站 + API
- Supabase：Auth / DB / Storage
- 另一個 Docker Worker：PPTX → PDF/PNG，例如 Cloud Run / Render / Fly.io

---

## Phase 1 立即部署方法

### 1. 建立 GitHub repo

例如：

```txt
voice-cue-slide-tool
```

把 `voice_slide_web` 內的檔案放到 repo：

```txt
index.html
sample_cues_50th.csv
README.md
PRODUCT_PLAN.md
VERCEL_GITHUB_DEPLOYMENT.md
```

### 2. 在 Vercel 匯入 GitHub repo

1. 登入 <https://vercel.com>
2. Add New Project
3. Import GitHub Repository
4. Framework Preset 選 `Other`
5. Build Command 留空
6. Output Directory 留空或填 `.`
7. Deploy

Vercel 會給你一個 HTTPS 網址，例如：

```txt
https://voice-cue-slide-tool.vercel.app
```

### 3. 用戶使用方式

用戶只需要：

1. 打開網站
2. 上傳投影片圖片資料夾
3. 上傳 / 貼上 cue CSV
4. 按「開始聆聽」
5. 允許 microphone
6. 全螢幕播放

---

## 為甚麼 Phase 1 不先做登入？

因為 Phase 1 最大優點是：

- 不需要處理私隱檔案儲存
- 不需要資料庫
- 不需要後端維護
- Vercel 免費方案已足夠測試
- 投影片和司儀稿只留在用戶電腦，不上傳伺服器

對於會議文件、財務報告等資料，這反而更安全。

---

## Phase 2 建議架構

```txt
Browser
  ↓
Next.js App on Vercel
  ↓
Supabase Auth       用戶登入
Supabase Postgres   project / cue / script metadata
Supabase Storage    slide images / scripts / exports
```

### Database tables

#### profiles

```sql
id uuid primary key references auth.users(id)
email text
name text
created_at timestamptz default now()
```

#### projects

```sql
id uuid primary key default gen_random_uuid()
owner_id uuid references auth.users(id)
title text not null
language text default 'zh-HK'
mode text default 'sequential'
created_at timestamptz default now()
updated_at timestamptz default now()
```

#### slides

```sql
id uuid primary key default gen_random_uuid()
project_id uuid references projects(id) on delete cascade
slide_no integer not null
title text
image_path text not null
text_content text
created_at timestamptz default now()
```

#### cues

```sql
id uuid primary key default gen_random_uuid()
project_id uuid references projects(id) on delete cascade
cue_order integer not null
trigger_text text not null
action text default 'goto_slide' -- goto_slide / next_slide / goto_title
target_slide_no integer
target_title text
threshold integer default 84
enabled boolean default true
created_at timestamptz default now()
```

#### scripts

```sql
id uuid primary key default gen_random_uuid()
project_id uuid references projects(id) on delete cascade
content text not null
parsed_json jsonb
created_at timestamptz default now()
```

---

## Phase 2 UI 建議

### Dashboard

- 我的 Project
- 建立新 Project
- 複製 Project
- 刪除 Project

### Upload

- 上傳投影片圖片 / PDF
- 上傳司儀稿 TXT / DOCX
- 選語言

### Cue Builder

表格：

```txt
次序 | 觸發句 | 動作 | 目標頁 | 門檻 | 啟用
```

功能：

- 從司儀稿選一句做 cue
- 從 slide title 選目標頁
- 自動檢查 cue 是否太短或重複
- 匯入 / 匯出 CSV

### Rehearsal Mode

- 顯示目前聽到文字
- 顯示命中 cue
- 顯示 confidence
- 記錄失敗位置

### Present Mode

- 全螢幕 slide player
- Sequential lock
- 手動上一頁/下一頁/跳頁
- 一鍵暫停語音控制

---

## 音訊輸入注意

使用 Chrome/Edge 內置 Web Speech API 時，多數情況下會使用系統預設 microphone。正式場地建議：

1. 將 mixer / USB audio interface 設為 Windows 預設輸入
2. 打開網站後允許 microphone
3. 測試網站聽到的是 mixer 聲音，而不是 notebook 內置咪

如將來改用 cloud speech API，可以在網站內直接選擇 input device。

---

## Vercel 限制

Vercel 很適合：

- Frontend
- Login pages
- API route
- 儲存 project metadata
- 呼叫 Supabase

Vercel 不太適合：

- 長時間音訊串流處理
- 大檔案轉檔
- LibreOffice headless PPTX conversion
- 需要本地永久檔案系統的工作

所以正式產品建議把 PPTX conversion 放在獨立 worker。

---

## 最佳最小可行方案

第一個公開版本建議功能（目前已在 `index.html` + `styles.css` + `app.js` 實作）：

- 靜態網站部署 Vercel
- 投影片圖片本機載入
- 司儀稿貼上 / TXT 載入
- Cue CSV 本機載入 / 編輯 / 匯出
- Project JSON 匯入 / 匯出
- Web Speech API 語音辨識
- Sequential / Any / Confirm mode
- 指定句 Cue、逐字稿追蹤、參閱標題鎖定
- 全螢幕播放

之後才加入：

- 登入
- Project storage
- PPTX/DOCX 自動解析
- 逐字稿配對
- 參閱 XXX 標題鎖定
