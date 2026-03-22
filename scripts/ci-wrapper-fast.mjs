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

// SDK がダウンロードした Dagger CLI を自動検出
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

function softCleanup() {
  console.log("🧹 Performing soft cleanup (keeping engine & volumes)...");
  run("docker container prune -f");
  run("docker image prune -f"); // 未使用イメージを削除

  // Dagger エンジン内部のビルドキャッシュを明示的に削除
  run(`docker exec ${ENGINE_NAME} buildctl prune`, { stdio: "ignore" });

  run('wsl -u root -e sh -c "sync; echo 3 > /proc/sys/vm/drop_caches"');
}

const ENGINE_NAME = "dagger-engine-v0.14.0"; // Dagger が期待するデフォルト名
const VOLUME_NAME = "citadel-dagger-cache";
const DAGGER_IMAGE = "registry.dagger.io/engine:v0.14.0";

// GC ポリシーの設定 (MB 単位)
// Reserved: GC 後に最低限保持するキャッシュ量
// Free: 空き容量がこれを下回ると GC 開始
// Maximum: 最大キャッシュ量
const GC_POLICY = "4096,2048,8192";

function ensureDaggerEngine() {
  console.log(`\n🔍 Ensuring Dagger Engine and Persistent Volume...`);

  // 名前付きボリュームの存在を確認
  const volumeExists = run(`docker volume inspect ${VOLUME_NAME}`, { stdio: "ignore" });
  if (!volumeExists) {
    console.log(`📦 Creating Named Volume: ${VOLUME_NAME}`);
    run(`docker volume create ${VOLUME_NAME}`);
  }

  // エンジンコンテナの状態を確認
  const containerSpecs = execSync(
    `docker ps -a --filter "name=${ENGINE_NAME}" --format "{{.ID}}|{{.Mounts}}"`,
    { encoding: "utf8" }
  ).trim();

  let needsCreate = true;
  if (containerSpecs) {
    const [id, mounts] = containerSpecs.split("|");
    // 正しいボリュームをマウントしているか精査（名前が含まれているか）
    if (mounts.includes(VOLUME_NAME)) {
      console.log(`✅ Default Engine is already configured with ${VOLUME_NAME}.`);
      needsCreate = false;
      const isRunning =
        execSync(`docker inspect -f '{{.State.Running}}' ${id}`, { encoding: "utf8" }).trim() ===
        "true";
      if (!isRunning) {
        console.log(`▶️ Starting Engine...`);
        run(`docker start ${id}`);
      }
    } else {
      console.log(`⚠️ Existing Engine has wrong mount (Anonymous volume detected). Recreating...`);
      run(`docker stop ${id}`);
      run(`docker rm ${id}`);
    }
  }

  if (needsCreate) {
    console.log(
      `🚀 Creating Dagger Engine with Named Volume: ${VOLUME_NAME} (GC Policy: ${GC_POLICY})`
    );
    run(
      `docker run -d --name ${ENGINE_NAME} --restart always --privileged -v ${VOLUME_NAME}:/var/lib/dagger ${DAGGER_IMAGE} --oci-worker-gc --oci-worker-gc-keepstorage "${GC_POLICY}"`
    );
  }

  // 念のため接続先を明示（Windows上での確実な認識のため）
  process.env.DAGGER_ENGINE_HOST = `docker-container://${ENGINE_NAME}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDaggerEngine(daggerBin, engineName) {
  console.log(`\n⏳ Waiting for Dagger Engine (${engineName}) to be ready...`);
  const maxRetries = 15;
  const delayMs = 2000;

  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`[Attempt ${i}/${maxRetries}] Checking engine connectivity...`);
      // Dagger Engine への疎通確認（version コマンドを使用）
      const cmd = `$env:DAGGER_ENGINE_HOST="docker-container://${engineName}"; & "${daggerBin}" version`;
      execSync(cmd, { stdio: "ignore", shell: "powershell.exe" });
      console.log("✅ Engine is ready and reachable.");
      return true;
    } catch (e) {
      if (i === maxRetries) break;
      console.log(`⚠️ Engine not ready yet, retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
  }
  return false;
}

async function main() {
  console.log("\n📊 --- Local CI Resource Monitor (PERSISTENT ENGINE MODE) ---");

  const initialMem = await getVmmemMemory();
  console.log(`[Before] VmmemWSL Memory: ${initialMem} MB`);

  ensureDaggerEngine();

  const daggerBin = findDaggerBinary();
  if (!daggerBin) {
    console.error("❌ Dagger binary not found. Please ensure Dagger SDK is installed.");
    process.exit(1);
  }

  // エンジンの起動・疎通を待機
  const isReady = await waitForDaggerEngine(daggerBin, ENGINE_NAME);
  if (!isReady) {
    console.error("❌ Dagger Engine connection failed after multiple retries.");
    process.exit(1);
  }

  console.log("\n🚀 Step 1: Running CI Suite...");

  let success;
  if (daggerBin) {
    // 確実に環境変数が伝播するようにpowershellのセッション内でセット
    success = run(
      `$env:DAGGER_ENGINE_HOST="docker-container://${ENGINE_NAME}"; & "${daggerBin}" run node scripts/ci-dagger-run.mjs`
    );
  } else {
    success = run("node scripts/ci-dagger-run.mjs");
  }

  if (!success) {
    console.error("\n❌ CI execution failed. Engine kept alive for debugging.");
    const finalMem = await getVmmemMemory();
    console.log(`\n[After]  VmmemWSL Memory: ${finalMem} MB`);
    process.exit(1);
  } else {
    console.log("\n✅ CI finished successfully.");

    console.log(`\n🔄 Step 2: Releasing Resources (Stopping ${ENGINE_NAME})...`);
    run(`docker stop ${ENGINE_NAME}`);

    // 不要な副産物コンテナ（サイドカー等）を削除
    run("docker container prune -f");

    softCleanup();

    const finalMem = await getVmmemMemory();
    console.log(`\n[After]  VmmemWSL Memory: ${finalMem} MB`);
    console.log(`[Diff]   Memory Change: ${finalMem - initialMem} MB`);
    console.log("\n✅ CI complete. Cache is safe in Named Volume.");
  }
}

main();
