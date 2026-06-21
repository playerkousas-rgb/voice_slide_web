# Voice Cue Slide Tool

一個可部署到 GitHub + Vercel 的純瀏覽器語音 Cue 投影片工具。

用戶可以：

1. 選擇使用模式：
   - 純瀏覽器即插即用
   - Google Drive 資料夾模式（第一版為手動工作流）
2. 載入 A 檔：投影片圖片資料夾
3. 載入 B 檔：司儀稿 / 逐字稿
4. 選擇 Cue 模式：
   - 指定句 / 關鍵字 Cue
   - 逐字稿配對
   - 「參閱 XXX」標題鎖定
5. 在 Cue Builder 設定觸發句子和動作
6. 全螢幕放映，聽到 cue 後自動跳頁
7. 下載 `project.vcue.json`，下次重用設定

---

## 檔案結構

```txt
index.html                主頁面
styles.css                介面樣式
app.js                    前端邏輯 / 語音辨識 / Cue matching
sample_project.vcue.json  示例 Project
sample_cues_50th.csv      示例 Cue CSV
vercel.json               Vercel header 設定
package.json              可選 build script
DEPLOYMENT.md             GitHub + Vercel 部署教學
```

---

## 本機測試

在此資料夾執行：

```bash
python -m http.server 3000
```

然後開：

```txt
http://localhost:3000
```

注意：真實 microphone 測試建議部署到 Vercel HTTPS 後，用 Chrome / Edge 測試。

---

## Vercel 部署

詳見：

```txt
DEPLOYMENT.md
```

建議設定：

```txt
Vercel → Import GitHub Repository
Root Directory: voice_slide_web
Framework Preset: Other
Build Command: npm run build
Output Directory: public
```

如果你把 Build Command 留空，Output Directory 才使用 `.`。若 Vercel 自動執行 `npm run build`，請用 `public`。

---

## 使用流程

### 第一次設定

1. 投影片先匯出成 PNG/JPG 圖片
2. 打開網站
3. 選擇 slides 資料夾
4. 貼上 / 載入司儀稿
5. 在 Cue Builder 設定 cue
6. 到放映頁測試
7. 下載 `project.vcue.json`

### 下次重用

1. 打開網站
2. 載入 `project.vcue.json`
3. 再選一次 slides 資料夾
4. 開始放映

### 投影模式 / F11

如果想接近 PowerPoint 投影效果，建議在「放映 / 彩排」頁：

1. 按「投影模式/F11」隱藏網站 UI，只保留投影片
2. 再按鍵盤 `F11` 隱藏瀏覽器工具列
3. 如畫面仍有黑邊，可把顯示方式改為「填滿畫面｜可裁切」
4. 按 `P` 或 `Esc` 可離開網站投影模式；按 `F11` 可離開瀏覽器全螢幕

---

## 重要限制

- 第一版不會將檔案上傳到 server；全部只在用戶瀏覽器處理。
- Browser 模式不能自動記住本機圖片路徑；重用時要重新選 slides 資料夾。
- Web Speech API 通常需要 Chrome / Edge + HTTPS + 網絡。
- PowerPoint 動畫/影片不會保留；如需要動畫，請拆成多頁圖片。

---

## 正式活動建議

- 使用 Sequential 模式。
- Cue 句子不要太短，不要重複。
- 保留人手 clicker / 鍵盤作後備。
- 最好由現場 mixer / USB audio interface 輸入電腦，不要只靠 notebook 內置咪。
- 完整彩排一次後再正式使用。
