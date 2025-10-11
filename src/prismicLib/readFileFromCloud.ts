import fs from "fs/promises";

export async function readFileFromCloud(path: string) {
  const dice = Math.random();

  if (dice < 0.1) throw new Error("Read failed: filesystem error");

  if (dice < 0.2) {
    await new Promise((res) => setTimeout(res, 60000));
  }

  const raw = await fs.readFile(path, "utf-8");

  if (dice < 0.3) {
    const cutAt = Math.floor(raw.length * (0.5 + Math.random() * 0.4));
    return raw.slice(0, cutAt);
  }

  return raw;
}
