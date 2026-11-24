#!/usr/bin/env node
/**
 * 生成标注点用的三维图钉模型：public/models/demo-pin.glb
 *
 * 造型（与参考图一致）：上面一个半球，下面一个圆锥，地面再垫一块半透明圆盘。
 *   - 半球：半径 39，球心在圆锥顶面（y=61），只画上半部分
 *   - 圆锥：尖端 y=0，顶面 y=61、半径 39，与半球的赤道严丝合缝
 *   - 地面圆盘：y=0.3，半径 45，半透明粉红（参考图里的底座椭圆）
 * 模型总高 100。不用图片（billboard）是因为斜视角下图片永远正对相机，
 * 底座会跟着立起来；三维模型才有透视和明暗。
 *
 * 实际屏幕大小由 entity.model.scale 按相机距离逐帧换算（见
 * src/utils/layers/markers.js），所以这里的 100 只是比例，不是米。
 *
 * 用法：
 *   node scripts/generatePinModel.mjs
 *
 * 产出的 .glb 提交在 public/models/ 下，构建时随 public/ 原样进 dist/。
 * 想换颜色 / 比例改本文件的常量后重新跑一遍（不联网、不装依赖）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/models/demo-pin.glb",
);

// ============================================================
// 形状参数（总高 100）
// ============================================================

const SHAPE = {
  // 半球：球心就是圆锥顶面中心，所以半球半径 = 圆锥顶面半径
  headRadius: 39,
  headCenterY: 61,
  headSegments: 40,
  headRings: 12,
  // 圆锥：尖端在原点，向上张开到半球赤道
  coneTopY: 61,
  coneRadius: 39,
  coneSegments: 40,
  // 地面圆盘（参考图里的粉色椭圆底座）
  discRadius: 45,
  discY: 0.3,
  discSegments: 48,
};

/**
 * 图钉材质（PBR，纯红、略带高光）
 *
 * `KHR_materials_specular` 把高光反射压到 0.18：圆锥面在俯视角下几乎是掠射，
 * 不压的话整个锥面会被环境反射洗成白色（实测 roughness 0.32 / 0.62 都发白）。
 * emissive 给一点自发光，让阴影面也是正红，接近参考图的观感。
 */
const PIN_MATERIAL = {
  name: "demo-pin-red",
  pbrMetallicRoughness: {
    baseColorFactor: [0.85, 0.02, 0.01, 1],
    metallicFactor: 0,
    roughnessFactor: 0.55,
  },
  emissiveFactor: [0.16, 0.004, 0.003],
  extensions: {
    KHR_materials_specular: {
      specularFactor: 0.18,
      specularColorFactor: [1, 1, 1],
    },
  },
  doubleSided: true,
};

/** 底座材质：半透明粉红，叠在影像上像一块圆形光晕 */
const DISC_MATERIAL = {
  name: "demo-pin-base",
  pbrMetallicRoughness: {
    baseColorFactor: [0.96, 0.32, 0.36, 0.38],
    metallicFactor: 0,
    roughnessFactor: 0.95,
  },
  extensions: {
    KHR_materials_specular: { specularFactor: 0 },
  },
  alphaMode: "BLEND",
  doubleSided: true,
};

// ============================================================
// 几何：半球 + 圆锥 + 圆锥顶盖 + 地面圆盘
// ============================================================

function createBuilder() {
  return { positions: [], normals: [], indices: [] };
}

/** 上半球：theta 0（顶点）→ PI/2（赤道），phi 绕 Y 轴一圈 */
function buildHemisphere(builder, { radius, centerY, segments, rings }) {
  const base = builder.positions.length / 3;

  for (let i = 0; i <= rings; i++) {
    const theta = (i / rings) * (Math.PI / 2);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      const nx = sinTheta * Math.cos(phi);
      const ny = cosTheta;
      const nz = sinTheta * Math.sin(phi);

      builder.positions.push(radius * nx, centerY + radius * ny, radius * nz);
      builder.normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = base + i * (segments + 1) + j;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;
      // 逆时针（从球外看）→ 外表面
      builder.indices.push(a, b, c, b, d, c);
    }
  }
}

/** 圆锥：尖端在原点、向 +Y 张开到 y=height、半径 radius */
function buildCone(builder, { height, radius, segments }) {
  const base = builder.positions.length / 3;
  const slant = Math.hypot(height, radius);

  builder.positions.push(0, 0, 0);
  builder.normals.push(0, -1, 0);

  for (let j = 0; j <= segments; j++) {
    const phi = (j / segments) * Math.PI * 2;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);

    builder.positions.push(radius * cos, height, radius * sin);
    // 外表面朝外下方（倒立的锥面）
    builder.normals.push(
      (height * cos) / slant,
      -radius / slant,
      (height * sin) / slant,
    );
  }

  for (let j = 0; j < segments; j++) {
    const first = base + 1 + j;
    const next = first + 1;
    // 逆时针（从锥外看）
    builder.indices.push(base, first, next);
  }
}

/** 水平圆盘：法线朝上，用于地面底座和圆锥顶盖 */
function buildDisc(builder, { radius, y, segments }) {
  const base = builder.positions.length / 3;

  builder.positions.push(0, y, 0);
  builder.normals.push(0, 1, 0);

  for (let j = 0; j <= segments; j++) {
    const phi = (j / segments) * Math.PI * 2;
    builder.positions.push(radius * Math.cos(phi), y, radius * Math.sin(phi));
    builder.normals.push(0, 1, 0);
  }

  for (let j = 0; j < segments; j++) {
    builder.indices.push(base, base + 2 + j, base + 1 + j);
  }
}

const pin = createBuilder();
buildHemisphere(pin, {
  radius: SHAPE.headRadius,
  centerY: SHAPE.headCenterY,
  segments: SHAPE.headSegments,
  rings: SHAPE.headRings,
});
buildCone(pin, {
  height: SHAPE.coneTopY,
  radius: SHAPE.coneRadius,
  segments: SHAPE.coneSegments,
});
// 圆锥顶盖（被半球盖住，只为让模型封闭，仰视时不至于看穿）
buildDisc(pin, {
  radius: SHAPE.coneRadius,
  y: SHAPE.coneTopY,
  segments: SHAPE.coneSegments,
});

const disc = createBuilder();
buildDisc(disc, {
  radius: SHAPE.discRadius,
  y: SHAPE.discY,
  segments: SHAPE.discSegments,
});

// ============================================================
// glTF / GLB 打包（单个 buffer，每个 accessor 一个 bufferView）
// ============================================================

const bufferParts = [];
const bufferViews = [];
const accessors = [];
let byteLength = 0;

function addBufferView(typedArray, target) {
  const padding = (4 - (byteLength % 4)) % 4;
  if (padding > 0) {
    bufferParts.push(Buffer.alloc(padding));
    byteLength += padding;
  }

  const bytes = Buffer.from(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength,
  );
  bufferViews.push({
    buffer: 0,
    byteOffset: byteLength,
    byteLength: bytes.byteLength,
    target,
  });
  bufferParts.push(bytes);
  byteLength += bytes.byteLength;

  return bufferViews.length - 1;
}

function addVectorAccessor(typedArray, type, componentType) {
  const bufferView = addBufferView(typedArray, 34962); // ARRAY_BUFFER
  const components = { VEC3: 3, SCALAR: 1 }[type];
  accessors.push({
    bufferView,
    componentType,
    count: typedArray.length / components,
    type,
  });
  return accessors.length - 1;
}

function addPositionAccessor(builder) {
  const positions = new Float32Array(builder.positions);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }

  const accessorIndex = addVectorAccessor(positions, "VEC3", 5126);
  accessors[accessorIndex].min = min;
  accessors[accessorIndex].max = max;
  return accessorIndex;
}

function addIndexAccessor(builder) {
  const vertexCount = builder.positions.length / 3;
  const wide = vertexCount > 65535;
  const indices = wide
    ? new Uint32Array(builder.indices)
    : new Uint16Array(builder.indices);
  const bufferView = addBufferView(indices, 34963); // ELEMENT_ARRAY_BUFFER

  accessors.push({
    bufferView,
    componentType: wide ? 5125 : 5123,
    count: indices.length,
    type: "SCALAR",
  });
  return accessors.length - 1;
}

function buildPrimitive(builder, material) {
  return {
    attributes: {
      POSITION: addPositionAccessor(builder),
      NORMAL: addVectorAccessor(
        new Float32Array(builder.normals),
        "VEC3",
        5126,
      ),
    },
    indices: addIndexAccessor(builder),
    material,
    mode: 4, // TRIANGLES
  };
}

const gltf = {
  asset: { version: "2.0", generator: "generatePinModel.mjs" },
  extensionsUsed: ["KHR_materials_specular"],
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "demo-pin" }],
  meshes: [
    {
      name: "demo-pin",
      primitives: [buildPrimitive(pin, 0), buildPrimitive(disc, 1)],
    },
  ],
  materials: [PIN_MATERIAL, DISC_MATERIAL],
  accessors,
  bufferViews,
  buffers: [{ byteLength: 0 }],
};

// GLB：12 字节头 + JSON chunk（4 字节对齐、空格补齐）+ BIN chunk（补齐 0）
const binPadding = (4 - (byteLength % 4)) % 4;
if (binPadding > 0) {
  bufferParts.push(Buffer.alloc(binPadding));
  byteLength += binPadding;
}
gltf.buffers[0].byteLength = byteLength;

const binary = Buffer.concat(bufferParts);
const jsonBuffer = Buffer.from(JSON.stringify(gltf), "utf8");
const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
const jsonChunk = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4); // 版本
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binary.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

const glb = Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binary]);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, glb);

console.log(
  `已生成 ${OUTPUT}（${(glb.length / 1024).toFixed(1)} KB，` +
    `${accessors.length} 个 accessor，${byteLength} 字节几何数据）`,
);
