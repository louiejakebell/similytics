import fs from "fs/promises";

export async function writeFileToCloud(file: string, data: string) {
  const dice = Math.random();

  if (dice < 0.1) throw new Error("Write failed: filesystem error");

  if (dice < 0.2) {
    await new Promise((res) => setTimeout(res, 60000));
  }

  if (dice < 0.3) {
    const cutAt = Math.floor(data.length * (0.5 + Math.random() * 0.4));
    return fs.writeFile(file, data.slice(0, cutAt));
  }

  return fs.writeFile(file, data);
}
