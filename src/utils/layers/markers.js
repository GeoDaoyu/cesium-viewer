import * as Cesium from "cesium";
import { markDataSourceNonPickable } from "@/utils/pick";

/**
 * 标注点图层：三维图钉 + 名称
 *
 * 点位直接写在配置里（`type: "markers"` 的 `points`，每项
 * `{ name, longitude, latitude }`），不请求任何 GIS 服务。每个点由三部分组成：
 *
 *   - `model`：三维图钉 glb（`public/models/demo-pin.glb`，由
 *     `scripts/generatePinModel.mjs` 生成）。斜视角下有透视和明暗，
 *     地面圆盘是透视正确的椭圆；
 *   - `label`：名称，白字 + 深色描边，压在影像 / 切片图层之上；
 *   - 位置：`HeightReference.CLAMP_TO_GROUND`，挂了三维地形也不会埋进地里。
 *
 * **屏幕大小按距离换算**：glb 总高 100 个模型单位，`model.scale` 用
 * `CallbackProperty` 按相机到点位的距离逐帧换算，让图钉近处约 `pixelHeight`
 * 像素高、远处收到 0.65 倍；不要改成固定 scale / minimumPixelSize。
 *
 * 点位是纯视觉标注：数据源标记为不参与拾取，点击可穿透到下层图层；
 * 也不登记 `legendSource` / `querySource`，不出图例。
 */

/** 默认数据源名称（`type: "markers"` 条目用） */
const LAYER_NAME = "theme-markers";

/** 三维图钉模型（相对页面，构建后随 public/ 进 dist/） */
const DEFAULT_MODEL_URL = "./models/demo-pin.glb";

/** glb 的总高（模型单位）—— 与 generatePinModel.mjs 的形状参数对应 */
const MODEL_HEIGHT = 100;

/** 图钉在屏幕上的默认高度（像素，近处） */
const DEFAULT_PIXEL_HEIGHT = 46;

/**
 * 远距离时图钉缩到近处的这个比例
 *
 * 点位密集时，全图视角下都挤在几十像素里：近处 46px 的图钉会叠成一团、
 * 把区域名称盖住。远处收到 0.65（约 30px），既能看见、又不糊。
 * 3D Tiles / WMTS 都不改，这是标注自己的屏幕尺寸换算。
 */
const FAR_PIXEL_HEIGHT_RATIO = 0.65;
/** 从多远开始缩小 / 缩到最小的距离（米） */
const NEAR_DISTANCE = 120000;
const FAR_DISTANCE = 600000;

/** 标签低端与图钉顶部的间距（像素） */
const LABEL_GAP = 8;

/** 远距离时标签缩小的下限，避免全图视角下名称挤成一团 */
const LABEL_FAR_SCALE = 0.72;
const LABEL_FAR_DISTANCE = 3000000;

/**
 * 相机到点位的距离（米）
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cartesian3} position
 * @returns {number} 距离；viewer 异常时返回 0
 */
function cameraDistance(viewer, position) {
  const scene = viewer.scene;
  if (!scene?.camera) return 0;
  return Cesium.Cartesian3.distance(scene.camera.positionWC, position);
}

/**
 * 图钉在当前距离下应该占多少屏幕像素
 *
 * 近处保持 `pixelHeight`，到 FAR_DISTANCE 线性收到 0.65 倍；标签的像素偏移也用它，
 * 这样远处标签不会飘在钉尖上方很远的地方。
 *
 * @param {number} distance - 相机到点位的距离（米）
 * @param {number} pixelHeight - 近处高度（像素）
 * @returns {number}
 */
function computePinPixelHeight(distance, pixelHeight) {
  const t = Cesium.Math.clamp(
    (distance - NEAR_DISTANCE) / (FAR_DISTANCE - NEAR_DISTANCE),
    0,
    1,
  );
  return pixelHeight * (1 - (1 - FAR_PIXEL_HEIGHT_RATIO) * t);
}

/**
 * 计算让图钉在屏幕上保持 `pixelHeight` 像素高所需的 model.scale
 *
 * 相机到点位的距离 d 处，一个屏幕像素对应的地面长度约为
 * `2 * d * tan(fovy / 2) / canvasHeight` 米；图钉要占 pixelHeight 像素，
 * 就得有 `pixelHeight * metersPerPixel` 米高，再除以模型自身高度（MODEL_HEIGHT）。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer
 * @param {Cesium.Cartesian3} position - 点位（世界坐标）
 * @param {number} pixelHeight - 期望的屏幕高度（像素）
 * @returns {number} model.scale；相机 / 画布不可用时返回 0（不渲染）
 */
function computeModelScale(viewer, position, pixelHeight) {
  const { scene } = viewer;
  const canvasHeight = scene.canvas?.clientHeight;
  const fovy = scene.camera?.frustum?.fovy;

  if (!canvasHeight || !Number.isFinite(fovy) || fovy <= 0) return 0;

  const distance = cameraDistance(viewer, position);
  const metersPerPixel = (2 * distance * Math.tan(fovy / 2)) / canvasHeight;
  const pixels = computePinPixelHeight(distance, pixelHeight);

  return (pixels * metersPerPixel) / MODEL_HEIGHT;
}

/**
 * 添加标注点
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} option - themeOptions 里的条目
 * @param {Array<{name: string, longitude: number, latitude: number}>} option.points
 *   点位清单（必填）；坐标无效的项跳过并告警
 * @param {number} [option.pixelHeight=46] - 图钉在屏幕上的高度（像素）
 * @param {string} [option.modelUrl] - 图钉模型地址，默认 public/models/demo-pin.glb
 * @param {string} [option.name="theme-markers"] - 数据源 name（一次性高亮用固定名，
 *   清除按钮按 name 扫得到）
 * @param {string} [option.labelFont] - 名称字体
 * @param {string} [option.labelColor] - 名称颜色（CSS 颜色串）
 * @param {string} [option.labelOutlineColor] - 名称描边颜色
 * @param {number} [option.labelOutlineWidth] - 名称描边宽度
 * @returns {Cesium.CustomDataSource|null} 数据源；viewer 不可用 / 没有有效点位时 null
 */
export function addMarkerLayer(viewer, option = {}) {
  if (!viewer || viewer.isDestroyed()) return null;

  const points = Array.isArray(option.points) ? option.points : [];
  if (points.length === 0) return null;

  const {
    pixelHeight = DEFAULT_PIXEL_HEIGHT,
    modelUrl = DEFAULT_MODEL_URL,
    labelFont = '600 14px "PingFang SC", "Microsoft YaHei", sans-serif',
    labelColor = "#ffffff",
    labelOutlineColor = "#7a0b06",
    labelOutlineWidth = 3,
    name = LAYER_NAME,
  } = option;

  const pinHeight =
    Number(pixelHeight) > 0 ? Number(pixelHeight) : DEFAULT_PIXEL_HEIGHT;
  const dataSource = new Cesium.CustomDataSource(name);

  points.forEach((point, index) => {
    const { name, longitude, latitude } = point || {};
    const lon = Number(longitude);
    const lat = Number(latitude);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      console.warn("[markers] 跳过坐标无效的点位：", point);
      return;
    }

    const position = Cesium.Cartesian3.fromDegrees(lon, lat);

    dataSource.entities.add({
      id: `marker-${index}`,
      name,
      position,
      model: {
        uri: modelUrl,
        // 逐帧按相机距离换算，保持屏幕像素大小恒定（见 computeModelScale）。
        // 不能用固定 scale（远看只有一个点）或 minimumPixelSize（近看会很大）。
        scale: new Cesium.CallbackProperty(
          () =>
            viewer.isDestroyed()
              ? 0
              : computeModelScale(viewer, position, pinHeight),
          false,
        ),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: name,
        font: labelFont,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.fromCssColorString(labelColor),
        outlineColor: Cesium.Color.fromCssColorString(labelOutlineColor),
        outlineWidth: labelOutlineWidth,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        // 锚点在地面（钉尖）：标签整体上移一个图钉的高度，压在钉尖上方。
        // 图钉远处会缩小，偏移量也跟着算，否则标签会离钉尖越来越远。
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.CallbackProperty(
          () =>
            new Cesium.Cartesian2(
              0,
              -(
                computePinPixelHeight(
                  cameraDistance(viewer, position),
                  pinHeight,
                ) + LABEL_GAP
              ),
            ),
          false,
        ),
        // 钉尖贴地；标签同样贴地后再按像素偏移上移，地形起伏时不会悬空
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        // 标签始终画在最上面，不被地形 / 3D Tiles 挡住
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // 远距离稍微缩小，避免全图视角下名称互相压住
        scaleByDistance: new Cesium.NearFarScalar(
          LABEL_FAR_DISTANCE / 10,
          1,
          LABEL_FAR_DISTANCE,
          LABEL_FAR_SCALE,
        ),
      },
    });
  });

  if (dataSource.entities.values.length === 0) return null;

  // 纯视觉标注：点击穿透到下面的业务图层，不弹空属性框
  markDataSourceNonPickable(dataSource);

  viewer.dataSources.add(dataSource);
  return dataSource;
}

/**
 * 移除标注点
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.CustomDataSource} dataSource - `addMarkerLayer()` 的返回值
 */
export function removeMarkerLayer(viewer, dataSource) {
  if (!viewer || viewer.isDestroyed() || !dataSource) return;
  if (viewer.dataSources.contains(dataSource)) {
    // destroy = true：连同实体一起销毁，重新勾选时是全新的一份
    viewer.dataSources.remove(dataSource, true);
  }
}
