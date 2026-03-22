import { generateUUID } from "@/utils/uuid";

/**
 * デバイス識別子（Heartbeat 等で使用）。
 * LocalStorage に保存して永続化。
 */
const STORAGE_KEY = "citadel_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = `device_${generateUUID()}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
}
