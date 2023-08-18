import * as fs from "node:fs/promises";
import * as fs2 from "node:fs";
import * as path from "node:path";
import { rollup } from "rollup";
import terser from "@rollup/plugin-terser";
import admzip from "adm-zip";
import ZipStream from "zip-stream";
import archiver from "archiver";
import { parseAssets } from "./parse-obj.mjs";
import chokidar from "chokidar";

const SRC_DIR = "src";
const DST_DIR = "dst";

export const typeMap = [
  "jp-ship",
  "jp-boarding-ship",
  "mn-ship",
  "mn-cannon-ship",
  "cloud-small",
  "cloud-med",
  "cloud-large",
];

async function build() {
  try {
    await fs.mkdir(DST_DIR);
  } catch {}

  const files = await fs.readdir(SRC_DIR);

  function getMinifiedName(index) {
    if (index < 26) {
      return String.fromCharCode(index + 97);
    } else {
      return String.fromCharCode(index - 26 + 65);
    }
  }

  function minifyVarNames(src, names) {
    let i = 0;
    for (const n of names) {
      src = src.replace(
        new RegExp(`(\\W)${n}(\\W)`, "g"),
        `$1${getMinifiedName(i)}$2`
      );
      i++;
    }
    return src;
  }

  async function minifyAndCopyShader(p) {
    let file = (await fs.readFile(path.join(SRC_DIR, p))).toString();
    file = file
      // remove comments
      .replace(/\/\/[^\n]*/g, "")
      // remove groups of 2+ whitespace
      .replace(/\s{2,}/g, "")
      // remove spaces between word and non-word chars (e.g. operators)
      .replace(/(\w)\s([^\w])/g, "$1$2")
      .replace(/([^\w])\s(\w)/g, "$1$2")
      // add space for version pragma
      .replace("#version 300 es", "#version 300 es\n")
      // remove the 0 after decimal numbers
      .replace(/(\d)\.0([^\d])/g, "$1.$2");
    file = minifyVarNames(file, [
      "vel",
      "delta_t",
      "params",
      "pos",
      "epsilon",
      "rho",
      "vel_at",
      "diverged_fields",
      "delta_pos",
      "pressured_fields",
      "pressure",
    ]);
    await fs.writeFile(path.join(DST_DIR, p), file);
  }

  async function bundleAssets(file) {
    const src = (await fs.readFile(path.join(SRC_DIR, file))).toString();
    const arr = parseAssets(src);
    await fs.writeFile(
      path.join(DST_DIR, path.basename(file, ".obj")),
      new Int8Array(arr)
    );
  }

  for (const file of files) {
    const extname = path.extname(file);

    const copies = [];

    if ([".html", ".css"].includes(extname)) {
      copies.push(
        fs.copyFile(path.join(SRC_DIR, file), path.join(DST_DIR, file))
      );
    }

    if ([".vert", ".frag"].includes(extname)) {
      copies.push(minifyAndCopyShader(file));
    }

    if ([".obj"].includes(extname)) {
      copies.push(bundleAssets(file));
    }

    await Promise.all(copies);
  }

  const bundle = await rollup({
    input: [path.join(SRC_DIR, "index.js")],
    plugins: [
      terser({
        mangle: {
          eval: true,
          toplevel: true,
          properties: {},
        },
      }),
    ],
    output: {
      dir: DST_DIR,
    },
  });

  await bundle.write({
    dir: DST_DIR,
  });

  function serializeLevel(level) {
    let buffer = [];
    buffer.push(level.name.length);
    for (const char of level.name) {
      buffer.push(char.charCodeAt(0));
    }

    buffer.push(level.data.length);
    for (const item of level.data) {
      buffer.push(item.x + item.y * 16);
      const typeid = typeMap.indexOf(item.type);
      if (typeid === -1) {
        console.error(`Unrecognized type '${item.type}'`);
      }
      buffer.push(typeid);
    }

    return buffer;
  }

  function serializeLevels(lvls) {
    let buffer = [lvls.length];
    for (const lvl of lvls) buffer.push(...serializeLevel(lvl));
    return new Uint8Array(buffer);
  }

  const levels = JSON.parse(
    await fs.readFile(path.join(SRC_DIR, "levels.json"))
  );

  await fs.writeFile(path.join(DST_DIR, "levels"), serializeLevels(levels));

  const zip = admzip();
  await zip.addLocalFolderPromise(DST_DIR);
  await zip.writeZip("./bundle.zip");

  console.log("Bundle Size: ", (await fs.stat("bundle.zip")).size);
}
// const zip = archiver("zip", {
//   zlib: { level: 9 }, // Sets the compression level.
// });

// for await (const file of await fs.readdir(DST_DIR)) {
//   zip.append(await fs.readFile(path.join(DST_DIR, file)), {
//     name: file,
//   });
// }

// zip.finalize();
// {
//   const bundle = fs2.createWriteStream("./bundle.zip", { flag: "w" });
//   bundle.on("open", () => {
//     zip.pipe(bundle);
//   });
// }

// try {
//   await fs.rm("bundle.zip");
// } catch {}

const watcher = chokidar.watch(SRC_DIR);
watcher.on("change", () => {
  console.log("Changes detected! Rebuilding...");
  build();
});
