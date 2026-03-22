import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

function run(cmd, options = {}) {
  try {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: "inherit", shell: "powershell.exe", ...options });
    return true;
  } catch (e) {
    return false;
  }
}

function findDaggerBinary() {
  const cachePath = path.join(process.env.LOCALAPPDATA, "Cache", "dagger");
  if (fs.existsSync(cachePath)) {
    const files = fs.readdirSync(cachePath);
    const daggerExe = files.find((f) => f.startsWith("dagger-") && f.endsWith(".exe"));
    if (daggerExe) return path.join(cachePath, daggerExe);
  }
  return null;
}

async function getVmmemMemory() {
  try {
    const output = execSync(
      'powershell.exe -NoProfile -Command "(Get-Process -Name vmmemWSL -ErrorAction SilentlyContinue).WorkingSet64 / 1MB"',
      { encoding: "utf8" }
    );
    return Math.round(parseFloat(output.trim()) || 0);
  } catch (e) {
    return 0;
  }
}

function cleanup() {
  console.log("🧹 [Reset] Thoroughly cleaning up Docker/Dagger resources...");
  // エンジンを停止してメモリを強制解放
  run('docker ps -q --filter "name=dagger-engine" | ForEach-Object { docker stop $_ }');
  // 全ボリューム（キャッシュ含む）と一時リソースを削除
  run("docker system prune -af --volumes");
  // WSL メモリ解放
  run('wsl -u root -e sh -c "sync; echo 3 > /proc/sys/vm/drop_caches"');
}

async function main() {
  console.log("\n📊 --- Local CI Resource Monitor (FULL RESET MODE) ---");

  const initialMem = await getVmmemMemory();
  console.log(`[Before] VmmemWSL Memory: ${initialMem} MB`);

  console.log("\n🔄 Step 1: Pre-run Reset...");
  cleanup();

  const daggerBin = findDaggerBinary();
  console.log("\n🚀 Step 2: Running CI Suite (Fresh Start)...");

  let success;
  if (daggerBin) {
    success = run(`& "${daggerBin}" run node scripts/ci-dagger-run.mjs`);
  } else {
    success = run("node scripts/ci-dagger-run.mjs");
  }

  console.log("\n🔄 Step 3: Post-run Cleanup...");
  cleanup();

  const finalMem = await getVmmemMemory();
  console.log(`\n[After]  VmmemWSL Memory: ${finalMem} MB`);
  console.log(`[Diff]   Memory Change: ${finalMem - initialMem} MB`);

  if (!success) {
    console.error("\n❌ CI execution failed.");
    process.exit(1);
  } else {
    console.log("\n✅ CI Reset cycle finished successfully.");
  }
}

main();
