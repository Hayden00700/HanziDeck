# Hanzi Deck (漢字卡)

**Hanzi Deck** 是一個極簡、現代化的網頁版漢字學習工具。它採用了類似 Anki 的**間隔重複系統 (Spaced Repetition System, SRS)**，幫助您高效、科學地記憶漢字。所有進度皆可透過 GitHub Gist 在您的不同裝置間無縫同步。

## ✨ 主要功能

*   **智慧複習系統 (SRS)**：根據您的記憶曲線，自動安排每個漢字的最佳複習時間。
*   **多使用者配置 (Multi-Profile)**：您可以建立多個獨立的學習配置（Profile），例如為不同教材或學習者建立專屬的字卡庫與進度，且所有配置都會同步。
*   **雲端同步**：只需一個 GitHub Gist，即可在電腦、手機、平板之間安全地同步您所有的學習配置和進度，永不遺失。
*   **筆順動畫與練習**：整合強大的 `hanzi-writer` 引擎，提供每個漢字的標準筆順動畫，並設有描摹測驗模式，加深肌肉記憶。
*   **內建字典查詢**：在學習時點擊發音按鈕，即可即時查詢該字的注音、詞性、定義與例句（資料來源：[萌典 API](https://www.moedict.tw/)）。
*   **學習統計**：提供視覺化圖表，清晰展示您的字卡熟練度分佈以及未來一週的複習量預測。
*   **字卡庫管理**：支援批次新增漢字，並可在編輯頁面中查看、排序、刪除字卡。
*   **自由書寫板**：提供一個獨立的畫布頁面，讓您隨時可以自由練習寫字。

## 🚀 如何使用

您可以直接在瀏覽器中開啟 `index.html` 來使用本應用。為了獲得最佳體驗（特別是 API 功能），建議透過本地伺服器運行。

### 基本操作

1.  **複習**：在主畫面，系統會顯示當前到期的字卡。根據您對漢字的熟悉程度，點擊下方的三個按鈕之一：
    *   **Again (忘記)**：短期內會再次出現。
    *   **Good (記得)**：根據當前間隔，安排下一次複習。
    *   **Easy (簡單)**：大幅延長下一次複習的間隔。
2.  **查詢定義**：點擊發音按鈕，除了播放發音外，下方會自動載入該字的詳細定義。
3.  **練習筆順**：點擊筆順按鈕，進入該字的練習模式，您可以觀看動畫或進行描摹測驗。

### ⚙️ 設定雲端同步 (GitHub Gist)

這是本工具的核心功能之一。透過簡單設定，您可以將所有學習資料備份到雲端並在多裝置間同步。

**前置需求：** 一個 GitHub 帳號。

#### **第一步：建立 Personal Access Token (PAT)**

1.  前往 GitHub [**Tokens (classic)**](https://github.com/settings/tokens?type=beta) 頁面。
2.  點擊 "Generate new token"，選擇 "Generate new token (classic)"。
3.  **Note**：給您的 Token 取一個好記的名字，例如 `hanzi-deck-sync`。
4.  **Expiration**：設定一個有效期，例如 90 天或 `No expiration` (不建議)。
5.  **Select scopes**：**最重要的一步！** 只需勾選 `gist` 權限即可。**請勿授予更多權限**。
    
6.  點擊頁面底部的 "Generate token"。
7.  **立即複製產生的 Token！** 這個 Token 只會顯示一次，請妥善保管。

#### **第二步：建立一個 Secret Gist**

1.  前往 [gist.github.com](https://gist.github.com/)。
2.  **Gist description...**：可選填，例如 `Hanzi Deck Data`。
3.  **Filename including extension...**：輸入 `profiles.json`。
4.  **File content...**：輸入 `["Default"]`。
5.  **最重要的一步！** 點擊 "Create secret gist" 按鈕。這確保只有您自己能看到您的學習資料。
    
6.  建立後，瀏覽器網址列會是 `https://gist.github.com/YourUsername/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`。複製網址中那串長長的 **ID**。

#### **第三步：在應用程式中設定**

1.  回到 Hanzi Deck，點擊右上角的設定圖示進入編輯頁面。
2.  在 "GitHub Gist Sync" 區塊：
    *   貼上您在**第一步**複製的 **Personal Access Token**。
    *   貼上您在**第二步**複製的 **Gist ID**。
3.  點擊 "Save & Connect"。
4.  頁面將會自動重新整理。如果一切順利，狀態會顯示 "Successfully connected to Gist."，主畫面的狀態指示燈會變為綠色。

設定完成後，您所有的學習進度（包括新增、刪除、切換 Profile）都會自動同步。

### 🧑‍🤝‍🧑 使用者配置管理 (Profile)

在設定頁面，您可以管理多個獨立的學習配置。

*   **切換配置**：從下拉選單中選擇您想學習的 Profile，頁面將自動重新載入該進度。
*   **建立配置**：在輸入框中填寫新配置的名稱，點擊 "Create"，應用會立即建立並切換到該 Profile。
*   **刪除配置**：點擊 "Delete Current Profile" 按鈕可刪除**當前**選中的配置。**此操作會同時刪除雲端和本地的資料，且無法復原，請謹慎操作！**

