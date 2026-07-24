import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve("src/assets/appIcon.png");
const output = resolve("src/assets/appIcon.icns");
const workingDirectory = mkdtempSync(join(tmpdir(), "stayfree-app-icon-"));

const iconEntries = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
];

try {
  const chunks = iconEntries.map(([type, size]) => {
    const pngPath = join(workingDirectory, `${size}.png`);
    execFileSync("sips", [
      "-z",
      String(size),
      String(size),
      source,
      "--out",
      pngPath,
    ]);

    const png = readFileSync(pngPath);
    const chunkLength = Buffer.alloc(4);
    chunkLength.writeUInt32BE(png.length + 8);
    return Buffer.concat([Buffer.from(type), chunkLength, png]);
  });

  const body = Buffer.concat(chunks);
  const fileLength = Buffer.alloc(4);
  fileLength.writeUInt32BE(body.length + 8);
  writeFileSync(output, Buffer.concat([Buffer.from("icns"), fileLength, body]));
  console.log(`[icon] generated ${output}`);
} finally {
  rmSync(workingDirectory, { recursive: true, force: true });
}
