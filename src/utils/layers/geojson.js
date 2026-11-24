import * as Cesium from "cesium";
import { markDataSourceNonPickable } from "@/utils/pick";

/**
 * GeoJSON 数据源图层（内存对象）
 *
 * 与 wfs.js 的区别只有一个数据来源：这里是**内存里的 GeoJSON 对象**（例如查询
 * 接口返回 WKT、前端解析后组装出来的 FeatureCollection），不发服务请求；
 * wfs.js 则是拿 WFS GetFeature 的地址去取 GeoJSON。
 *
 * 样式规则由 `applyDataSourceStyle` 统一处理：面 = 半透明填充 + 描边，
 * 点 = 实心圆，线 = 实线。
 */

/**
 * 给数据源里的实体套默认样式
 *
 * @param {Cesium.GeoJsonDataSource} dataSource - 数据源
 * @param {object} [options]
 * @param {Cesium.Color|string} [options.defaultColor=Cesium.Color.YELLOW] - 颜色，支持 hex 字符串
 * @param {number} [options.fillOpacity=0.4] - 多边形填充透明度 (0~1)
 * @param {number} [options.defaultPointSize=8] - 点要素大小
 * @param {number} [options.defaultOutlineWidth=1] - 轮廓线宽度
 * @param {number} [options.lineWidth] - 线要素（polyline）的宽度（px），省略时沿用
 *   `defaultOutlineWidth + 1` 的历史行为。静态 GeoJSON 区域面按 pt 给线宽，
 *   折算成 px 后从这里传入，避免再叠一层 +1
 * @param {Cesium.Color|string} [options.lineColor] - 线要素 / 面描边的颜色，省略时与
 *   `defaultColor` 相同。贴地面图元不支持描边，区域面这类「填充 + 白色边界」的
 *   图层会把每个环拆成 LineString 要素（见 `utils/geojsonBoundary.js`），
 *   用这个字段单独给边界上色
 * @param {number} [options.zIndex] - 图层 zIndex（贴合地面时控制渲染顺序）
 * @param {number} [options.height] - 多边形绝对高度（米），用于分离重叠图层避免 z-fighting
 * @returns {Cesium.GeoJsonDataSource} 传入的数据源
 */
export function applyDataSourceStyle(dataSource, options = {}) {
  const {
    defaultColor = Cesium.Color.YELLOW,
    fillOpacity = 0.4,
    defaultPointSize = 8,
    defaultOutlineWidth = 1,
    lineWidth,
    lineColor,
    zIndex,
    height,
  } = options;

  const color =
    typeof defaultColor === "string"
      ? Cesium.Color.fromCssColorString(defaultColor)
      : defaultColor;
  const strokeColor = lineColor
    ? typeof lineColor === "string"
      ? Cesium.Color.fromCssColorString(lineColor)
      : lineColor
    : color;

  const entities = dataSource.entities;
  for (let i = 0; i < entities.values.length; i++) {
    const entity = entities.values[i];

    if (entity.point) {
      entity.point.color = color;
      entity.point.pixelSize = defaultPointSize;
      entity.point.outlineWidth = defaultOutlineWidth;
    }
    if (entity.polygon) {
      entity.polygon.material = color.withAlpha(fillOpacity);
      entity.polygon.outline = true;
      entity.polygon.outlineColor = strokeColor;
      entity.polygon.outlineWidth = defaultOutlineWidth;
      if (zIndex !== undefined) {
        entity.polygon.zIndex = zIndex;
      }
      if (height !== undefined) {
        entity.polygon.height = height;
      }
    }
    if (entity.polyline) {
      entity.polyline.material = strokeColor;
      entity.polyline.width =
        lineWidth === undefined || lineWidth === null
          ? defaultOutlineWidth + 1
          : lineWidth;
    }
  }

  return dataSource;
}

/**
 * 用内存中的 GeoJSON 加一个数据源图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} options
 * @param {object} options.data - GeoJSON（FeatureCollection / Feature / Geometry）
 * @param {string} [options.name] - 图层名，设置后可用 getLayerByName() 找回
 * @param {boolean} [options.clampToGround=false] - 是否贴合地面
 * @param {boolean} [options.pickable=true] - 是否参与点击 / 悬停拾取。高亮覆盖层传
 *   false：它没有可展示的属性，又盖在业务图层上方，必须让点击穿透到下层
 *   （见 `utils/pick.js` 的 `pickEntity()`）
 * @param {Cesium.Color|string} [options.defaultColor] - 样式，见 applyDataSourceStyle
 * @param {number} [options.fillOpacity]
 * @param {number} [options.defaultPointSize]
 * @param {number} [options.defaultOutlineWidth]
 * @param {number} [options.lineWidth] - 线要素宽度（px），见 applyDataSourceStyle
 * @param {Cesium.Color|string} [options.lineColor] - 线要素 / 面描边的颜色，见 applyDataSourceStyle
 * @param {number} [options.zIndex]
 * @param {number} [options.height]
 * @param {Cesium.Color|string} [options.markerColor] - 点要素（Cesium 默认渲染成
 *   PinBuilder 图钉，而不是 point）的颜色；不传时用 Cesium 默认的宝蓝色
 * @param {number} [options.markerSize=48] - 图钉边长（px）
 * @param {string} [options.markerImage] - 自定义点标记图片（URL 或 data URI）。
 *   传了就替换掉 PinBuilder 生成的图钉，`markerColor` / `markerSymbol` 退化为兜底
 * @param {number} [options.markerImageWidth] - 自定义标记宽度（px），不传按原图尺寸
 * @param {number} [options.markerImageHeight] - 自定义标记高度（px），不传按原图尺寸
 * @returns {Promise<Cesium.GeoJsonDataSource|null>} viewer 不可用/已销毁、data 为空时 null
 */
export async function addGeoJsonLayer(viewer, options = {}) {
  // 快速失败：路由切换时旧 viewer 会被销毁、新 viewer 尚未就绪
  if (!viewer || viewer.isDestroyed()) return null;

  const {
    data,
    name,
    clampToGround = false,
    pickable = true,
    markerColor,
    markerSize,
    markerSymbol,
    markerImage,
    markerImageWidth,
    markerImageHeight,
    ...style
  } = options;
  if (!data) return null;

  const dataSource = await Cesium.GeoJsonDataSource.load(data, {
    clampToGround,
    // GeoJsonDataSource 对 Point 生成的是图钉（billboard），颜色必须在加载时
    // 通过 markerColor 指定；加载完再改 billboard.color 只会给蓝色图钉叠色。
    markerColor:
      typeof markerColor === "string"
        ? Cesium.Color.fromCssColorString(markerColor)
        : markerColor,
    markerSize,
    markerSymbol,
  });

  // 异步加载期间 viewer 可能已被销毁（如路由切换、旧页面卸载），
  // 此时不能再访问 viewer.dataSources，否则会抛 TypeError
  if (viewer.isDestroyed()) return dataSource;

  applyDataSourceStyle(dataSource, style);

  // 贴地面图元不支持描边，Cesium 会告警并忽略 outline；统一关掉，避免刷屏
  if (clampToGround) {
    for (const entity of dataSource.entities.values) {
      if (entity.polygon) {
        entity.polygon.outline = false;
        entity.polygon.outlineWidth = 0;
      }
    }
  }

  // 自定义点标记：PinBuilder 只会画纯色气球，需要水滴之类的外观时在这里整体替换。
  // billboard.image 的 setter 会自动包成 ConstantProperty，直接赋字符串即可；
  // verticalOrigin=BOTTOM 让水滴尖端落在坐标点上。
  if (markerImage) {
    for (const entity of dataSource.entities.values) {
      if (!entity.billboard) continue;
      entity.billboard.image = markerImage;
      entity.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
      if (markerImageWidth) entity.billboard.width = markerImageWidth;
      if (markerImageHeight) entity.billboard.height = markerImageHeight;
    }
  }

  if (name) {
    dataSource.name = name;
  }
  // 高亮覆盖层：标注为不参与拾取，点击直接落到下层业务图层
  if (!pickable) markDataSourceNonPickable(dataSource);
  viewer.dataSources.add(dataSource);

  return dataSource;
}

/**
 * 移除 GeoJSON 图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.GeoJsonDataSource} dataSource - 要移除的数据源实例
 */
export function removeGeoJsonLayer(viewer, dataSource) {
  if (!viewer || viewer.isDestroyed() || !dataSource) return;
  viewer.dataSources.remove(dataSource);
}
