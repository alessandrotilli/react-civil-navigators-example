/* MD
### 🛣️ Navigating 3D infrastructures
---

  Infrastructure models — roads, tunnels, bridges — are long and thin, making standard orbit navigation nearly useless. You need a way to travel along the route and inspect any cross-section without losing your bearings.

  Civil navigators use the IFC alignment data reconstructed in 3D to let you scrub along the route, sync multiple views, and cut a live cross-section at any station.

  This tutorial covers loading a road Fragment model and extracting its 3D absolute and horizontal plan alignments; creating an absolute 3D navigator and a horizontal 2D navigator in a secondary world; syncing the marker position between both views as you move along the route; adding a cross-section clipping plane that updates perpendicular to the alignment at the marker; displaying KP station labels with configurable colors and screen-distance culling; highlighting a selected alignment; and navigating by percentage slider or by KP value.

  By the end, you'll have a synchronized 3D and plan-view navigation setup for infrastructure models with live cross-section cutting at any station.
*/

import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import Stats from "stats.js";
import * as BUI from "@thatopen/ui";
import * as OBF from "@thatopen/components-front";

/* MD
  ### 🌎 Setting up a simple scene
  ---

  We will start by creating a simple scene with a camera and a renderer. If you don't know how to set up a scene, you can check the Worlds tutorial.
*/

export class NavigatorsExample {
  components?: OBC.Components;

  constructor() {}

  dispose() {
    console.log("dispose");
    this.components?.dispose();
    this.components = undefined;
  }

  async init(container: HTMLElement) {
    const components = (this.components = new OBC.Components());
    const worlds = components.get(OBC.Worlds);

    const world = worlds.create<
      OBC.SimpleScene,
      OBC.SimpleCamera,
      OBF.RendererWith2D
    >();

    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBF.RendererWith2D(components, container);
    world.camera = new OBC.SimpleCamera(components);

    components.init();

    BUI.Manager.init();
    CUI.Manager.init();

    world.scene.setup();

    world.camera.controls.setLookAt(5, 5, 5, 0, 0, 0);

    container.appendChild(world.renderer.three2D.domElement);

    const grids = components.get(OBC.Grids);
    grids.create(world);

    world.camera.three.far = 10000;
    world.camera.three.updateProjectionMatrix();

    /* MD

  We'll make the background of the scene transparent so that it looks good in our docs page, but you don't have to do that in your app!

*/

    world.scene.three.background = null;

    /* MD
  ### 🧳 Loading a BIM model
  ---

 We'll start by adding a BIM model to our scene. That model is already converted to fragments, so it will load much faster than if we loaded the IFC file.

  :::tip Fragments?

    If you are not familiar with fragments, check out the IfcLoader tutorial!

  :::
*/

    // `FragmentsManager.getWorker()` fetches the matching worker for this library version from unpkg and returns a blob URL.
    // You can also pass your own URL to `fragments.init(...)` if you'd rather host the worker yourself.
    const workerUrl = await OBC.FragmentsManager.getWorker();
    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(workerUrl);

    // Remove z fighting
    fragments.core.models.materials.list.onItemSet.add(
      ({ value: material }) => {
        if (!("isLodMaterial" in material && material.isLodMaterial)) {
          material.polygonOffset = true;
          material.polygonOffsetUnits = 1;
          material.polygonOffsetFactor = Math.random();
        }
      },
    );

    const url =
      "https://thatopen.github.io/engine_components/resources/frags/small_road.frag";
    const file = await fetch(url);
    const data = await file.arrayBuffer();
    const buffer = new Uint8Array(data);
    const model = await fragments.core.load(buffer, {
      modelId: url,
      camera: world.camera.three,
    });
    world.scene.three.add(model.object);

    await fragments.core.update(true);

    world.camera.controls.addEventListener("control", () =>
      fragments.core.update(),
    );

    model.getClippingPlanesEvent = () => {
      return Array.from(world.renderer!.three.clippingPlanes) || [];
    };

    const alignments = await model.getAlignments();
    world.scene.three.add(alignments);

    /* MD
  ### 🚕 Setting up Civil 3D Navigator
  ---

  Now, we need to create an instance of the Civil 3D Navigator component. This will enable us to navigate through our 3D environment and interact with the model.

*/

    const navigators = components.get(OBF.CivilNavigators);
    const navigator = navigators.create("absolute");
    navigator.world = world;

    // For now we don't read the initial station of alignments. You can set it like this:
    for (const alignment of alignments.children) {
      alignment.userData.initialStation = 1925;
    }

    navigator.alignments.push(alignments);
    navigator.updateAlignments();
    console.log(alignments);

    const sphere = new THREE.Sphere(undefined, 20);
    navigator.onMarkerChange.add(({ point }) => {
      sphere.center.copy(point);
      world.camera.controls.fitToSphere(sphere, true);
    });

    const crossSectionNavigator = components.get(
      OBF.CivilCrossSectionNavigator,
    );
    crossSectionNavigator.world = world;

    // Horizontal alignment

    const horizontalMenu = document.getElementById("horizontal-menu")!;

    const horizontalWorld = document.createElement(
      "bim-world-2d",
    ) as CUI.World2D;
    horizontalWorld.components = components;
    if (!horizontalWorld.world) {
      throw new Error("World not found!");
    }

    horizontalMenu.appendChild(horizontalWorld);

    const horizontalNavigator = navigators.create("horizontal");
    horizontalNavigator.world = horizontalWorld.world;
    const horizontalAlignments = await model.getHorizontalAlignments();
    for (const alignment of horizontalAlignments.children) {
      alignment.rotation.x = Math.PI / 2;
      alignment.rotation.y = Math.PI / 2;
    }
    horizontalNavigator.alignments.push(horizontalAlignments);
    horizontalNavigator.updateAlignments();
    const horizontalScene = horizontalWorld.world.scene.three;
    horizontalScene.background = null;
    horizontalScene.add(horizontalAlignments);

    for (const alignment of horizontalAlignments.children) {
      alignment.userData.initialStation = 1925;
    }

    navigator.onMarkerChange.add((civilPoint) => {
      console.log(civilPoint);
      const percentage = OBF.CivilUtils.curvePointToAlignmentPercentage(
        civilPoint.alignment,
        civilPoint.point,
        civilPoint.curve,
      );
      if (percentage === null) {
        return;
      }
      const point = OBF.CivilUtils.alignmentPercentageToPoint(
        horizontalAlignments.children[0] as THREE.Group,
        percentage,
      );
      if (point === null) {
        return;
      }
      horizontalNavigator.setMarkerAtPoint(point, "select");
      horizontalNavigator.setCursorValue(navigator.getCursorValue(), "select");
    });

    const casters = components.get(OBC.Raycasters);
    const horizontalCaster = casters.get(horizontalWorld.world);
    horizontalCaster.three.params.Line.threshold = 10;

    await horizontalWorld.world.camera.controls.setLookAt(
      0,
      0,
      10000,
      0,
      0,
      0,
      false,
    );

    /* MD
  ### ⏱️ Measuring the performance (optional)
  ---

  We'll use the [Stats.js](https://github.com/mrdoob/stats.js) to measure the performance of our app. We will add it to the top left corner of the viewport. This way, we'll make sure that the memory consumption and the FPS of our app are under control.
*/

    const stats = new Stats();
    stats.showPanel(2);
    document.body.append(stats.dom);
    stats.dom.style.left = "0px";
    stats.dom.style.zIndex = "unset";
    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());
  }
}
