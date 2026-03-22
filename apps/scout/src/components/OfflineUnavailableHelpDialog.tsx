import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@citadel/ui";
import { WifiOff, Shield, Link2, Wrench } from "lucide-react";

export interface OfflineUnavailableHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 非セキュア環境でオフライン機能が使えない理由と解決策を説明するヘルプダイアログ。
 * 初心者向けに「なぜ？」と「どうすればよいか」を分かりやすく記載する。
 */
export function OfflineUnavailableHelpDialog({
  open,
  onOpenChange,
}: OfflineUnavailableHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-amber-600" />
            オフライン機能が利用できない理由
          </DialogTitle>
          <DialogDescription>
            現在の接続環境では、ブラウザの制限によりオフライン機能（オフラインでの起動・データのキャッシュなど）が使えません。以下で理由と対処方法を説明します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* 理由 */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <Shield className="h-4 w-4" />
              なぜこのような制限があるのか
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              ブラウザには「セキュリティ保護機能」があり、安全が確認できない接続では、データの保存やオフライン動作などの重要な機能が強制的に停止されます。
              いま接続しているのは、暗号化されていない通信（
              <code className="rounded bg-muted px-1">http://</code>{" "}
              で始まるアドレスや、IPアドレスへの直接接続など）のため、ブラウザが「安全でない」と判断し、オフライン機能をブロックしています。
            </p>
          </section>

          {/* 推奨解決策 */}
          <Alert
            variant="default"
            className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
          >
            <Link2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800 dark:text-green-200">推奨する解決策</AlertTitle>
            <AlertDescription>
              <p className="mt-1 text-green-800 dark:text-green-200">
                システムの管理者に連絡し、接続先を「<strong>https://</strong>
                」で始まる安全なURLに変更してもらってください。 例：
                <code className="rounded bg-green-100 px-1 dark:bg-green-900">
                  https://scout.example.com
                </code>
                これにより、オフライン機能が利用可能になり、データも暗号化されて保護されます。
              </p>
            </AlertDescription>
          </Alert>

          {/* 緊急の回避策 */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <Wrench className="h-4 w-4" />
              緊急時の回避策（管理者・上級者向け）
            </h3>
            <p className="mb-2 text-muted-foreground leading-relaxed">
              すぐに HTTPS に切り替えられない場合、Chrome または Edge
              の「フラグ」設定で、この接続先だけを例外として「安全」と認識させることができます。手順は以下のとおりです。
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>
                ブラウザのアドレスバーに{" "}
                <code className="rounded bg-muted px-1">
                  chrome://flags/#unsafely-treat-insecure-origin-as-secure
                </code>{" "}
                と入力して Enter を押す（Edge の場合は{" "}
                <code className="rounded bg-muted px-1">edge://flags/...</code> でも同様）。
              </li>
              <li>
                「Insecure origins treated as secure」という項目を探し、テキスト欄に
                <strong>今の接続先のアドレス</strong>を入力する（例：
                <code className="rounded bg-muted px-1">http://100.x.x.x:3000</code>）。
              </li>
              <li>右側のドロップダウンを「Enabled」に変更する。</li>
              <li>画面下部の「Relaunch」ボタンでブラウザを再起動する。</li>
            </ol>
            <p className="mt-2 text-muted-foreground leading-relaxed">
              この設定は一時的な回避策です。可能な限り、早めに HTTPS
              環境への移行を検討してください。詳細な手順は、プロジェクト内の{" "}
              <code className="rounded bg-muted px-1">docs/NETWORK_SETUP.md</code>{" "}
              も参照してください。
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
