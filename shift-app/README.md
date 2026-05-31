# 📅 シフト管理アプリ

アルバイトスタッフが出勤予定を登録・共有できるカレンダーアプリです。

---

## セットアップ手順

### 1. Firebase プロジェクトを作成する

1. [https://console.firebase.google.com](https://console.firebase.google.com) にアクセス
2. 「プロジェクトを追加」→ 名前をつけて作成（Googleアナリティクスはオフでもよい）
3. 左メニューの「構築」→「Firestore Database」→「データベースを作成」
   - モードは「**テストモード**」を選択（後で変更可）
   - ロケーションは `asia-northeast1`（東京）を選択
4. 左メニューの「プロジェクトの概要（歯車）」→「プロジェクトの設定」
5. 「マイアプリ」→「ウェブ（</>）」アイコンをクリックしてアプリを登録
6. 表示された `firebaseConfig` の内容をコピー

### 2. Firebase設定を貼り付ける

`src/firebase.js` を開いて、コピーした値を貼り付けてください：

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "your-app.firebaseapp.com",
  projectId:         "your-app",
  storageBucket:     "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...",
}
```

### 3. GitHubにアップロードする

```bash
git init
git add .
git commit -m "initial commit"
```

GitHubで新しいリポジトリを作成して push してください。

### 4. Vercelにデプロイする

1. [https://vercel.com](https://vercel.com) にアクセスしてGitHubアカウントでログイン
2. 「New Project」→ 先ほどのリポジトリを選択
3. 設定はデフォルトのままで「Deploy」をクリック
4. デプロイ完了後に表示されるURLをスタッフ全員に共有！

---

## ローカルで動かす場合

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

---

## 機能

- 📅 月ごとのカレンダー表示
- ➕ 日付ごとにシフトを追加
- 👤 スタッフ別ビュー（月間出勤日数・時間集計）
- ⚙️ スタッフの追加・削除
- 🌐 Firebaseによるリアルタイム共有・自動保存
