# GitHub + Vercel 部署教學

此資料夾是一個純靜態網站 MVP：不需要後端、不需要資料庫、不需要 Python。

## 1. 放到 GitHub

建立一個 GitHub repository，例如：

```txt
voice-cue-slide-tool
```

將 `voice_slide_web` 內的檔案放到 repository root，或保留 `voice_slide_web` 作為子資料夾。

必要檔案：

```txt
index.html
styles.css
app.js
vercel.json
package.json
sample_project.vcue.json
sample_cues_50th.csv
README.md
```

## 2. Vercel 設定

在 Vercel：

```txt
Add New Project → Import GitHub Repository
```

如果 repo root 就是此資料夾內容：

```txt
Framework Preset: Other
Build Command: 留空，或 npm run build
Output Directory: .，或 dist（如果使用 npm run build）
```

如果此資料夾是 repo 內的 `voice_slide_web/`：

```txt
Root Directory: voice_slide_web
Framework Preset: Other
Build Command: 留空
Output Directory: .
```

最簡單建議：

```txt
Root Directory: voice_slide_web
Build Command: 留空
Output Directory: .
```

## 3. 部署後測試

Vercel 會給你一個 HTTPS URL，例如：

```txt
https://voice-cue-slide-tool.vercel.app
```

測試流程：

1. 用 Chrome / Edge 開網站
2. 載入 `sample_project.vcue.json`
3. 選擇投影片圖片資料夾
4. 到「放映 / 彩排」
5. 用「模擬聽到一句說話」先測試命中
6. 再按「開始聆聽」測試咪高峰

## 4. 麥克風權限

Web Speech API 需要：

- Chrome 或 Edge
- HTTPS 網址
- 允許 microphone 權限
- 通常需要網絡

如使用現場 mixer，請在 Windows 將 mixer / USB audio interface 設為預設輸入裝置。

## 5. Google Drive 手動工作流

第一版不接 Google API。建議用戶建立 Drive 活動資料夾：

```txt
2026 周年大會/
  slides/
    Slide1.png
    Slide2.png
  司儀稿.txt
  project.vcue.json
```

使用時：

1. 從 Drive 下載/同步資料夾到電腦
2. 網站載入 project.vcue.json
3. 選擇 slides 資料夾
4. 開始彩排/放映

第二版可再加入 Google Picker / Drive API，直接從 Drive 選資料夾。
