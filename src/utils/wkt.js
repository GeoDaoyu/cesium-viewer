/**
 * WKT ↔ GeoJSON
 *
 * 地图服务返回的几何常是 WKT（`shape` 字段），前端按 GeoJSON 渲染，
 * 这里提供解析与序列化。支持 POINT / LINESTRING / POLYGON / MULTI* /
 * GEOMETRYCOLLECTION，坐标按 WGS84 经纬度处理。
 */

/** WKT 词法：类型名 / 数字（含科学计数法）/ 括号 / 逗号 */
const TOKEN_RE = /[A-Za-z]+|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[(),]/g;

/** 支持的几何类型（大写） */
const GEOMETRY_TYPES = new Set([
  "POINT",
  "MULTIPOINT",
  "LINESTRING",
  "MULTILINESTRING",
  "POLYGON",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
]);

/**
 * WKT 文本 → GeoJSON Geometry
 *
 * @param {string} wkt - 如 `MULTIPOLYGON (((113.8 22.1, ...)))`
 * @returns {{type: string, coordinates?: any, geometries?: any[]}|null}
 *   GeoJSON 几何；空几何或无法解析时 null
 */
export function wktToGeoJson(wkt) {
  if (typeof wkt !== "string" || !wkt.trim()) return null;

  // 去掉 SRID 前缀：SRID=4490;MULTIPOLYGON(...)
  const text = wkt.replace(/^\s*SRID\s*=\s*\d+\s*;\s*/i, "").trim();
  if (!text) return null;

  const tokens = text.match(TOKEN_RE) || [];
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isNumber = (t) => t !== undefined && /^[-+]?[.\d]/.test(t);

  const expect = (token) => {
    if (tokens[pos] !== token) {
      throw new Error(
        `WKT 语法错误：期望 "${token}"，实际 "${tokens[pos] ?? "EOF"}"`,
      );
    }
    pos += 1;
  };

  /** 类型名后可能跟 Z / M / ZM，返回每个坐标的数字个数 */
  const readDims = () => {
    const t = peek();
    if (t && /^(Z|M|ZM)$/i.test(t)) {
      pos += 1;
      return t.toUpperCase() === "ZM" ? 4 : 3;
    }
    return 2;
  };

  /** 裸坐标对 `x y [z] [m]` → [lon, lat]（只保留前两维） */
  const readPair = (dims) => {
    const values = [];
    for (let i = 0; i < dims; i += 1) {
      const t = next();
      if (!isNumber(t)) throw new Error(`WKT 坐标分量不足：${t ?? "EOF"}`);
      values.push(Number(t));
    }
    return [values[0], values[1]];
  };

  /** `(x y [z])` → [lon, lat] */
  const readParenPair = (dims) => {
    expect("(");
    const pair = readPair(dims);
    expect(")");
    return pair;
  };

  /** `(x y, x y, ...)`：线串坐标 / 面的环，内部是裸坐标对 */
  const readCoordList = (dims) => {
    expect("(");
    const coords = [readPair(dims)];
    while (peek() === ",") {
      next();
      coords.push(readPair(dims));
    }
    expect(")");
    return coords;
  };

  /** `((ring), (ring), ...)` → 面（环数组） */
  const readPolygon = (dims) => {
    expect("(");
    const rings = [readCoordList(dims)];
    while (peek() === ",") {
      next();
      rings.push(readCoordList(dims));
    }
    expect(")");
    return rings;
  };

  /** 多部件几何：`(部件, 部件, ...)`，部件由 readPart 解析 */
  const readParts = (readPart) => {
    expect("(");
    const parts = [readPart()];
    while (peek() === ",") {
      next();
      parts.push(readPart());
    }
    expect(")");
    return parts;
  };

  const readGeometry = () => {
    const type = String(next()).toUpperCase();
    if (!GEOMETRY_TYPES.has(type)) {
      throw new Error(`不支持的 WKT 类型：${type}`);
    }
    const dims = readDims();

    if (peek() === "EMPTY") {
      next();
      return null;
    }

    switch (type) {
      case "POINT":
        return { type: "Point", coordinates: readParenPair(dims) };

      case "MULTIPOINT":
        // 两种写法都合法：MULTIPOINT ((x y), ...) 与 MULTIPOINT (x y, ...)
        return {
          type: "MultiPoint",
          coordinates: readParts(() =>
            peek() === "(" ? readParenPair(dims) : readPair(dims),
          ),
        };

      case "LINESTRING":
        return { type: "LineString", coordinates: readCoordList(dims) };

      case "MULTILINESTRING":
        return {
          type: "MultiLineString",
          coordinates: readParts(() => readCoordList(dims)),
        };

      case "POLYGON":
        return { type: "Polygon", coordinates: readPolygon(dims) };

      case "MULTIPOLYGON":
        return {
          type: "MultiPolygon",
          coordinates: readParts(() => readPolygon(dims)),
        };

      case "GEOMETRYCOLLECTION": {
        const geometries = readParts(() => readGeometry()).filter(Boolean);
        return { type: "GeometryCollection", geometries };
      }

      default:
        throw new Error(`不支持的 WKT 类型：${type}`);
    }
  };

  try {
    const geometry = readGeometry();
    if (pos !== tokens.length) {
      throw new Error("WKT 解析未消费完全部内容");
    }
    return geometry;
  } catch (err) {
    console.warn("[wkt] 几何解析失败，已跳过:", err.message);
    return null;
  }
}
