<template>
  <div class="cesium-container">
    <div id="cesium-container" ref="cesiumContainer"></div>
    <div class="control-panel">
      <div>航向: <span>{{ heading.toFixed(1) }}</span>°</div>
      <div>俯仰: <span>{{ pitch.toFixed(1) }}</span>°</div>
      <div>翻滚: <span>{{ roll.toFixed(1) }}</span>°</div>
      <div>速度: <span>{{ speed.toFixed(1) }}</span></div>
      <div>
        <label>
          <input type="checkbox" v-model="fromBehind" />
          追踪模型
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, onUnmounted } from "vue";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// Cesium token
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1YWUxYzYyOS01NTczLTQ5MmMtOGNmNS1mODg5MzJkN2I0OWUiLCJpZCI6MzA3NzAzLCJpYXQiOjE3NDg1NzQ5NzB9.LUkugDrB3RgfenlB85WkX2mJ2wPCh0JT8TBxEeBJIIU";

const cesiumContainer = ref(null);
let viewer = null;
let planePrimitive = null;

// 飞行控制相关变量
let scene = null;
let camera = null;
let controller = null;
let r = 0;
let position = null;
let speedVector = null;
const hpRoll = new Cesium.HeadingPitchRoll();
const hpRange = new Cesium.HeadingPitchRange();
const speed = ref(10);
const heading = ref(0.0);
const pitch = ref(0.0);
const roll = ref(0.0);
const fromBehind = ref(false);
const deltaRadians = Cesium.Math.toRadians(3.0);
const pathPosition = new Cesium.SampledPositionProperty();
let entityPath = null;
const fixedFrameTransform = Cesium.Transforms.localFrameToFixedFrameGenerator(
  "north",
  "west"
);

onMounted(async () => {
  // 初始化Cesium Viewer
  viewer = new Cesium.Viewer("cesium-container", {
    terrainProvider: await Cesium.createWorldTerrainAsync(), // 使用Cesium世界地形
    baseLayerPicker: false, // 禁用基础图层选择器
    animation: false, // 禁用动画控件
    timeline: false, // 禁用时间线
    sceneModePicker: false, // 禁用场景模式选择器
    navigationHelpButton: false, // 禁用导航帮助按钮
    homeButton: false, // 禁用主页按钮
    geocoder: false, // 禁用地理编码器
    infoBox: false, // 禁用信息框
    selectionIndicator: false, // 禁用选择指示器
    shouldAnimate: true,
  });

  // 启用深度检测以实现三维地形效果
  viewer.scene.globe.depthTestAgainstTerrain = true;

  // 添加天地图注记层
  const tdtAnnotation = new Cesium.WebMapTileServiceImageryProvider({
    url: "http://t2.tianditu.gov.cn/cia_w/wmts?tk=934b0924c010faa1467bb73517ba38bd",
    layer: "cia",
    style: "default",
    format: "tiles",
    tileMatrixSetID: "w",
    maximumLevel: 18,
    credit: new Cesium.Credit("天地图全球注记服务"),
  });
  viewer.imageryLayers.addImageryProvider(tdtAnnotation);

  // 初始化飞行控制
  initFlightControl();
});

onUnmounted(() => {
  if (viewer) {
    viewer.destroy();
  }
  // 移除键盘事件监听
  document.removeEventListener("keydown", handleKeyDown);
});

// 初始化飞行控制
const initFlightControl = async () => {
  const canvas = viewer.canvas;
  canvas.setAttribute("tabindex", "0"); // 设置焦点到canvas
  canvas.addEventListener("click", function () {
    canvas.focus();
  });
  canvas.focus();

  scene = viewer.scene;
  camera = viewer.camera;
  controller = scene.screenSpaceCameraController;

  // 初始化飞机位置（使用广州塔附近位置）
  position = Cesium.Cartesian3.fromDegrees(113.3011, 23.0566, 500.0);
  speedVector = new Cesium.Cartesian3();

  // 添加路径
  entityPath = viewer.entities.add({
    position: pathPosition,
    name: "path",
    path: {
      show: true,
      leadTime: 0,
      trailTime: 60,
      width: 10,
      resolution: 1,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.3,
        taperPower: 0.3,
        color: Cesium.Color.PALEGOLDENROD,
      }),
    },
  });

  try {
    // 加载飞机模型
    planePrimitive = scene.primitives.add(
      await Cesium.Model.fromGltfAsync({
        url: "public/dji.glb",
        modelMatrix: Cesium.Transforms.headingPitchRollToFixedFrame(
          position,
          hpRoll,
          Cesium.Ellipsoid.WGS84,
          fixedFrameTransform
        ),
        minimumPixelSize: 128,
        scale: 0.1,
      })
    );

    planePrimitive.readyEvent.addEventListener(() => {
      // 播放所有动画
      planePrimitive.activeAnimations.addAll({
        multiplier: 0.5,
        loop: Cesium.ModelAnimationLoop.REPEAT,
      });

      // 缩放到模型
      r =
        2.0 *
        Math.max(planePrimitive.boundingSphere.radius, camera.frustum.near);
      // 设置最小缩放距离但不要太大
      controller.minimumZoomDistance = r * 0.1;
      const center = planePrimitive.boundingSphere.center;
      const headingValue = Cesium.Math.toRadians(230.0);
      const pitchValue = Cesium.Math.toRadians(-20.0);
      hpRange.heading = headingValue;
      hpRange.pitch = pitchValue;
      hpRange.range = r * 10.0;

      // 使用flyTo而不是lookAt，保留相机控制
      camera.flyTo({
        destination: Cesium.Matrix4.multiplyByPoint(
          planePrimitive.modelMatrix,
          new Cesium.Cartesian3(0, -r * 10.0, r * 3.0),
          new Cesium.Cartesian3()
        ),
        orientation: {
          heading: headingValue,
          pitch: pitchValue,
          roll: 0.0,
        },
        duration: 1.0,
      });

      // 确保相机控制器启用
      controller.enableZoom = true;
      controller.zoomEventTypes = [
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH,
      ];

      // 模型加载完成后，自动勾选追踪模型
      fromBehind.value = true;
    });

    // 添加键盘事件监听
    document.addEventListener("keydown", handleKeyDown);

    // 添加场景预更新事件
    viewer.scene.preUpdate.addEventListener(updatePosition);

    // 添加场景预渲染事件以更新UI
    viewer.scene.preRender.addEventListener(updateUI);
  } catch (error) {
    console.log(`加载模型出错: ${error}`);
  }
};

// 处理键盘事件
const handleKeyDown = (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  switch (e.code) {
    case "ArrowDown":
      if (e.shiftKey) {
        // 减速
        speed.value = Math.max(--speed.value, 1);
      } else {
        // 俯角增加
        hpRoll.pitch -= deltaRadians;
        if (hpRoll.pitch < -Cesium.Math.TWO_PI) {
          hpRoll.pitch += Cesium.Math.TWO_PI;
        }
      }
      break;
    case "ArrowUp":
      if (e.shiftKey) {
        // 加速
        speed.value = Math.min(++speed.value, 100);
      } else {
        // 俯角减少
        hpRoll.pitch += deltaRadians;
        if (hpRoll.pitch > Cesium.Math.TWO_PI) {
          hpRoll.pitch -= Cesium.Math.TWO_PI;
        }
      }
      break;
    case "ArrowRight":
      if (e.shiftKey) {
        // 右翻滚
        hpRoll.roll += deltaRadians;
        if (hpRoll.roll > Cesium.Math.TWO_PI) {
          hpRoll.roll -= Cesium.Math.TWO_PI;
        }
      } else {
        // 右转
        hpRoll.heading += deltaRadians;
        if (hpRoll.heading > Cesium.Math.TWO_PI) {
          hpRoll.heading -= Cesium.Math.TWO_PI;
        }
      }
      break;
    case "ArrowLeft":
      if (e.shiftKey) {
        // 左翻滚
        hpRoll.roll -= deltaRadians;
        if (hpRoll.roll < 0.0) {
          hpRoll.roll += Cesium.Math.TWO_PI;
        }
      } else {
        // 左转
        hpRoll.heading -= deltaRadians;
        if (hpRoll.heading < 0.0) {
          hpRoll.heading += Cesium.Math.TWO_PI;
        }
      }
      break;
    default:
  }
};

// 更新位置
const updatePosition = (scene, time) => {
  if (!planePrimitive || !planePrimitive.ready) return;

  speedVector = Cesium.Cartesian3.multiplyByScalar(
    Cesium.Cartesian3.UNIT_X,
    speed.value / 10,
    speedVector
  );
  position = Cesium.Matrix4.multiplyByPoint(
    planePrimitive.modelMatrix,
    speedVector,
    position
  );
  pathPosition.addSample(Cesium.JulianDate.now(), position);
  Cesium.Transforms.headingPitchRollToFixedFrame(
    position,
    hpRoll,
    Cesium.Ellipsoid.WGS84,
    fixedFrameTransform,
    planePrimitive.modelMatrix
  );

  // 使用Vue的响应式变量而不是DOM元素
  if (fromBehind.value) {
    // 使用追踪模式，保留缩放功能
    const center = Cesium.Matrix4.getTranslation(
      planePrimitive.modelMatrix,
      new Cesium.Cartesian3()
    );

    // 设置追踪目标
    const offset = new Cesium.HeadingPitchRange(
      hpRoll.heading,
      -0.25, // 稍微向下看一点
      r * 10 // 保持一定距离，可以通过滚轮缩放
    );
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    camera.lookAtTransform(transform, offset);
  } else {
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
};

// 更新UI显示
const updateUI = (scene, time) => {
  // 使用Vue的响应式变量而不是更新DOM
  heading.value = Cesium.Math.toDegrees(hpRoll.heading);
  pitch.value = Cesium.Math.toDegrees(hpRoll.pitch);
  roll.value = Cesium.Math.toDegrees(hpRoll.roll);
};
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#cesium-container {
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  display: flex;
  gap: 10px;
  top: 10px;
  left: 10px;
  z-index: 999;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  font-size: 14px;
}
.control-panel input {
  position: relative;
  top: 1px;
}
</style>
