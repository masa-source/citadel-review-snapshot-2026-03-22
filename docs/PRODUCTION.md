# 本番環境での起動

## コマンド

```bash
pnpm start:prod
```

- **PostgreSQL**: 本番用 DB（Docker）
- **Backend**: 本番用 uvicorn（`--reload` なし）
- **Admin / Scout**: 事前に `pnpm build` した成果物を起動（`vite preview` または `serve dist`）

従来の `start:prod` は「DB だけ本番で、フロントは dev サーバー」でしたが、現在は **ビルド済みの Admin/Scout を起動する真正の本番モード** になっています。

## オフライン挙動

| アプリ    | 役割              | オフライン時                                                                                                                      |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Scout** | 現場アプリ（PWA） | 一度開いた画面と IndexedDB に保存したデータはオフラインでも利用可能。同期（アップロード・Handoff 受信）はオンライン復帰時に実行。 |
| **Admin** | ダッシュボード    | オンライン前提。オフラインでは利用しない想定。                                                                                    |

Scout は PWA のため、Service Worker がキャッシュしたアセットと IndexedDB 内のマスタ・レポートデータで、ネットが切れていても閲覧・編集（ローカル保存）が可能です。帰還時にオンラインでアップロードするとバックエンドと同期されます。

## 別PCから開く場合（同一LAN内など）

- **API の向き先**: `VITE_API_URL`（Scout/Admin）を未設定にすると、**表示中のページのホスト:8000** を参照します。  
  例: 別PCで `http://192.168.1.10:3001` を開くと、API は `http://192.168.1.10:8000` にアクセスするため、**ビルドし直さずに**同じサーバの API に届きます。  
  **IP で開く場合に API の向き先を固定したいとき**は、`.env` に `VITE_API_URL=http://YOUR_IP:8000` を設定し、**`pnpm start:prod` を再実行**（ビルドが走るため値がバンドルに焼き込まれる）してください。

- **CORS**: 別PCから `http://サーバIP:3001` や `http://サーバIP:3000`（Scout）で開く場合、ブラウザの Origin はその URL になります。  
  バックエンドの `.env` で `ALLOWED_ORIGINS` に **Scout と Admin の実際のオリジン**を追加してください。  
  例: `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.1.10:3000,http://192.168.1.10:3001`  
  設定後、**バックエンドを再起動**（`pnpm start:prod` をやり直す）してください。  
  Citadel から Scout を起動したあとデータが読み込めない場合は [HANDOFF_TROUBLESHOOTING.md](./HANDOFF_TROUBLESHOOTING.md) を参照してください。

## 本番でバックエンドと通信できない場合の確認

1. **VITE_API_URL**  
   - `.env` に設定した場合、その値は **ビルド時** にフロントに焼き込まれます。  
   - 変更したら必ず **`pnpm start:prod` を再実行**（または先に `pnpm build` してから起動）してください。
2. **ALLOWED_ORIGINS**  
   - ブラウザで **IP アドレス**（例: `http://192.168.1.10:3001`）で開いている場合、そのオリジンが `ALLOWED_ORIGINS` に含まれていないと CORS でブロックされます。  
   - `.env` に `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://YOUR_IP:3000,http://YOUR_IP:3001` を追加し、再起動してください。
3. **バックエンドの起動**  
   - `start:prod` ではバックエンドに `.env` の内容（`ALLOWED_ORIGINS` 含む）が渡されます。外部の env ファイル（`CITADEL_ENV_FILE`）を使っている場合は、そのファイルに上記を記載してください。

## 関連ドキュメント

- [NETWORK_SETUP.md](./NETWORK_SETUP.md) - ネットワーク接続環境（HTTPS・オフライン機能）の設定ガイド
- [HANDOFF_TROUBLESHOOTING.md](./HANDOFF_TROUBLESHOOTING.md) - Citadel → Scout データ読み込み失敗の原因と対処
