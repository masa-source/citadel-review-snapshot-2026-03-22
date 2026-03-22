/**
 * レポート一覧から編集・閲覧を開くときの完全遷移用 URL を返す。
 * 一覧では window.location.assign でこの URL に遷移し、読み込み時の URL に id が含まれるようにする。
 */
export function getReportEditPath(reportId: string, mode: "edit" | "view"): string {
  return `/reports/edit?id=${reportId}&mode=${mode}`;
}
