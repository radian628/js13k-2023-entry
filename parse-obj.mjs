import { typeMap } from "./build.mjs";

const modelOrder = ["jp-boarding-ship", "mn-ship", "arrow", "flag", "bar"];

function parseSingleObj(src) {
  const name = src.match(/o [\w-]+/)[0].slice(2);
  const type = typeMap.indexOf(name);

  const lines = src.split("\n");

  const vertices = lines
    .filter((l) => l.slice(0, 2) == "v ")
    .map((e) =>
      e
        .split(" ")
        .slice(1)
        .map((s) => Number(s))
    )
    .flat(2);

  let vertexIndices = lines
    .filter((l) => l[0] === "f")
    .map((e) =>
      e
        .split(" ")
        .slice(1)
        .map((e) => Number(e.split("/")[0]))
    )
    .flat(2);

  const lowestVertexIndex = Math.min(...vertexIndices);

  vertexIndices = vertexIndices.map((vi) => vi - lowestVertexIndex);

  // const materials = [];

  // let mat = undefined;

  // for (const l of lines) {
  //   if (l.startsWith("usemtl")) {
  //     mat = ["ship", "person"].indexOf(l.slice(7));
  //   }
  //   if (mat) materials.push(mat);
  // }

  const bytes = [];
  bytes.push(vertices.length / 3);
  bytes.push(...vertices.map((v) => Math.floor(v * 128)));
  bytes.push(vertexIndices.length / 3);
  bytes.push(...vertexIndices);
  // let byteOffset = 0;
  // for (let i = 0; i < materials.length; i++) {
  //   if (byteOffset === 0) {
  //     bytes.push(0);
  //   }

  //   bytes[bytes.length - 1] += materials[i] * 2 ** byteOffset;

  //   byteOffset = (byteOffset + 1) % 8;
  // }

  return { bytes, type };
}

export function parseAssets(src) {
  const objectSplit = src
    .replace(/\r/g, "")
    .split(/\n(?=o.+\n)/g)
    .slice(1);
  return [
    objectSplit.length,
    ...objectSplit
      .map((a) => parseSingleObj(a))
      .sort((a, b) => modelOrder.indexOf(a.type) - modelOrder.indexOf(b.type))
      .map((a) => a.bytes)
      .flat(),
  ];
}
