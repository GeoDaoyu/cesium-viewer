import * as Cesium from "cesium";

/**
 * 面几何 → 纯色填充影像图层（客户端栅格化，不依赖服务端配色）
 *
 * 为什么要做成影像图层？
 * Cesium 每帧的绘制顺序是「地球（地形 + 影像）→ 地面图元 → 不透明 / 半透明图元」，
 * 矢量面（哪怕 `clampToGround`）永远压在所有影像图层之上。区域面要垫在
 * 业务图层的 WMTS **下面**，就只能把填充画进瓦片 canvas、当成一层影像，
 * 插到 `imageryLayers` 里比专题图更靠前的位置（插入下标见 `queryLayer.js` 的
 * `addFillImagery()`：固定插到索引 2，即底图 / 叠加影像之上、专题图之下；
 * 名称标注是实体 label，永远压在这层填充之上）。
 *
 * 边界线不放这里：影像瓦片有纹理分辨率，边界会糊；边界仍由矢量数据源画
 * （贴地线），清晰、能随地形起伏，也不会被这层填充盖住。
 *
 * 每块瓦片按自己的经纬度范围把多边形路径画进 256×256 canvas，所以任意缩放级别
 * 下填充边缘都清晰（不像单张大图那样放大后糊成一片）。瓦片按
 * `GeographicTilingScheme`（WGS84 经纬度）切分。
 *
 * 只支持 Polygon / MultiPolygon。
 */

/** 瓦片边长（px），与平台其余影像服务一致 */
const TILE_SIZE = 256;

/**
 * 最低请求级别
 *
 * 级别太低时一块瓦片覆盖半个地球，填充边缘在屏幕上是「台阶」；从 6 级起
 * （一块瓦片 2.8° 见方）边缘误差已小于 1–2 个像素，再低就让 Cesium 放大 6 级瓦片。
 */
const MINIMUM_LEVEL = 6;

/** 最高请求级别（街道级足够；再往下没有意义，避免无谓请求） */
const MAXIMUM_LEVEL = 18;

/**
 * 面几何的填充影像 Provider
 *
 * 与标准 Cesium `ImageryProvider` 同接口：`rectangle` / `tileWidth` / `tileHeight` /
 * `tilingScheme` / `minimumLevel` / `maximumLevel` / `hasAlphaChannel` / `errorEvent` /
 * `requestImage()`。`requestImage` 必须返回 Promise（Cesium 内部直接 `.then()`）。
 */
export class FillImageryProvider {
  /**
   * @param {object} options
   * @param {Array<{rings: number[][][], bounds: {west: number, south: number, east: number, north: number}}>} options.polygons
   *   多边形列表：每个多边形一组环（外环 + 内环，经纬度 [lon, lat]）与包围盒（度）
   * @param {Cesium.Rectangle} [options.rectangle] - 图层范围（弧度），不传取全球
   * @param {Cesium.Color} [options.color] - 填充色（含透明度）
   * @param {number} [options.tileWidth=256]
   * @param {number} [options.tileHeight=256]
   * @param {number} [options.minimumLevel=6]
   * @param {number} [options.maximumLevel=18]
   */
  constructor(options = {}) {
    const {
      polygons = [],
      rectangle,
      color = Cesium.Color.YELLOW.withAlpha(0.39),
      tileWidth = TILE_SIZE,
      tileHeight = TILE_SIZE,
      minimumLevel = MINIMUM_LEVEL,
      maximumLevel = MAXIMUM_LEVEL,
    } = options;

    this._polygons = polygons;
    this._rectangle = rectangle ?? Cesium.Rectangle.MAX_VALUE;
    this._color = color;
    this._tileWidth = tileWidth;
    this._tileHeight = tileHeight;
    this._minimumLevel = minimumLevel;
    this._maximumLevel = maximumLevel;
    this._tilingScheme = new Cesium.GeographicTilingScheme();
    this._errorEvent = new Cesium.Event();
    this._fillStyle = color.toCssColorString();
  }

  get rectangle() {
    return this._rectangle;
  }

  get tileWidth() {
    return this._tileWidth;
  }

  get tileHeight() {
    return this._tileHeight;
  }

  get maximumLevel() {
    return this._maximumLevel;
  }

  get minimumLevel() {
    return this._minimumLevel;
  }

  get tilingScheme() {
    return this._tilingScheme;
  }

  get errorEvent() {
    return this._errorEvent;
  }

  get hasAlphaChannel() {
    return true;
  }

  get credit() {
    return undefined;
  }

  get proxy() {
    return undefined;
  }

  get tileDiscardPolicy() {
    return undefined;
  }

  /**
   * 画一块瓦片
   *
   * @param {number} x - 瓦片列号
   * @param {number} y - 瓦片行号
   * @param {number} level - 级别
   * @returns {Promise<HTMLCanvasElement>} 画好填充的 canvas（其余区域透明）
   */
  requestImage(x, y, level) {
    const canvas = document.createElement("canvas");
    canvas.width = this._tileWidth;
    canvas.height = this._tileHeight;

    try {
      const context = canvas.getContext("2d");
      this._drawTile(context, x, y, level);
    } catch (error) {
      // 单块瓦片画失败不该拖垮整张地图：告警后给一块透明瓦片
      console.warn("[fillImagery] 瓦片绘制失败:", error);
    }

    return Promise.resolve(canvas);
  }

  /**
   * 把落在该瓦片范围内的多边形画进 canvas
   *
   * @param {CanvasRenderingContext2D} context
   * @param {number} x
   * @param {number} y
   * @param {number} level
   */
  _drawTile(context, x, y, level) {
    const rect = this._tilingScheme.tileXYToRectangle(x, y, level);
    const west = Cesium.Math.toDegrees(rect.west);
    const east = Cesium.Math.toDegrees(rect.east);
    const south = Cesium.Math.toDegrees(rect.south);
    const north = Cesium.Math.toDegrees(rect.north);

    const spanX = east - west;
    const spanY = north - south;
    if (!(spanX > 0) || !(spanY > 0)) return;

    const scaleX = this._tileWidth / spanX;
    const scaleY = this._tileHeight / spanY;

    context.beginPath();

    let hasPath = false;
    for (let i = 0; i < this._polygons.length; i++) {
      const polygon = this._polygons[i];
      const bounds = polygon?.bounds;
      if (!bounds) continue;

      // 包围盒不相交：整块跳过（高缩放级别下能省掉绝大部分路径点）
      if (
        bounds.east < west ||
        bounds.west > east ||
        bounds.north < south ||
        bounds.south > north
      ) {
        continue;
      }

      for (const ring of polygon.rings) {
        for (let j = 0; j < ring.length; j++) {
          const px = (ring[j][0] - west) * scaleX;
          // canvas 的 y 轴向下，纬度越大越靠上
          const py = (north - ring[j][1]) * scaleY;
          if (j === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        hasPath = true;
      }
    }

    if (!hasPath) return;

    // evenodd：内环（洞）自然镂空
    context.fillStyle = this._fillStyle;
    context.fill("evenodd");
  }
}

/**
 * 面几何（GeoJSON）→ 填充用的多边形列表
 *
 * @param {Array<object>} geometries - GeoJSON 几何数组（Polygon / MultiPolygon）
 * @returns {Array<{rings: number[][][], bounds: {west: number, south: number, east: number, north: number}}>}
 */
export function toFillPolygons(geometries = []) {
  const polygons = [];

  const pushPolygon = (rings) => {
    if (!Array.isArray(rings) || rings.length === 0) return;

    const outer = rings[0];
    if (!Array.isArray(outer) || outer.length === 0) return;

    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const [lon, lat] of outer) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    if (!Number.isFinite(west) || !Number.isFinite(north)) return;

    polygons.push({ rings, bounds: { west, south, east, north } });
  };

  for (const geometry of geometries) {
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      pushPolygon(geometry.coordinates);
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates || []) pushPolygon(polygon);
    }
  }

  return polygons;
}

/**
 * 取多边形列表的并集范围（度数 → Cesium.Rectangle）
 *
 * @param {Array<{bounds: {west: number, south: number, east: number, north: number}}>} polygons
 * @returns {Cesium.Rectangle|undefined} 没有有效多边形时 undefined
 */
export function getPolygonsRectangle(polygons = []) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  for (const polygon of polygons) {
    const bounds = polygon?.bounds;
    if (!bounds) continue;
    if (bounds.west < west) west = bounds.west;
    if (bounds.east > east) east = bounds.east;
    if (bounds.south < south) south = bounds.south;
    if (bounds.north > north) north = bounds.north;
  }

  if (!Number.isFinite(west) || !Number.isFinite(north)) return undefined;

  // 四周留一点余量，避免瓦片刚好压在边界上被裁掉
  const padding = 0.01;
  return Cesium.Rectangle.fromDegrees(
    west - padding,
    south - padding,
    east + padding,
    north + padding,
  );
}
