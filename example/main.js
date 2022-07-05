import { IfcViewerAPI } from 'web-ifc-viewer';
import { createSideMenuButton } from './utils/gui-creator';
import {
  IFCSPACE,
  IFCOPENINGELEMENT,
  IFCWALLSTANDARDCASE,
  IFCWALL,
  IFCWINDOW,
  IFCCURTAINWALL,
  IFCMEMBER,
  IFCPLATE
} from 'web-ifc';
import { MeshBasicMaterial, LineBasicMaterial, Color, Vector2 } from 'three';
import { ClippingEdges } from 'web-ifc-viewer/dist/components/display/clipping-planes/clipping-edges';
import Stats from 'stats.js/src/Stats';
import jsPDF from 'jspdf';

const container = document.getElementById('viewer-container');
const viewer = new IfcViewerAPI({ container, backgroundColor: new Color(255, 255, 255) });
viewer.axes.setAxes();
viewer.grid.setGrid();
// viewer.shadowDropper.darkness = 1.5;

// Set up stats
const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.right = '0px';
stats.dom.style.left = 'auto';
viewer.context.stats = stats;

let currentPlan = 'a';

// viewer.IFC.loader.ifcManager.useWebWorkers(true, 'files/IFCWorker.js');
viewer.IFC.setWasmPath('files/');

viewer.IFC.loader.ifcManager.applyWebIfcConfig({
  USE_FAST_BOOLS: true,
  COORDINATE_TO_ORIGIN: true
});

viewer.context.renderer.postProduction.active = true;

// Setup loader

const lineMaterial = new LineBasicMaterial({ color: 0x555555 });
const baseMaterial = new MeshBasicMaterial({ color: 0xffffff, side: 2 });

let first = true;
let model;

let drawingstate = false;

const loadIfc = async (event) => {
  // tests with glTF
  // const file = event.target.files[0];
  // const url = URL.createObjectURL(file);
  // const result = await viewer.GLTF.exportIfcFileAsGltf({ ifcFileUrl: url });
  //
  // const link = document.createElement('a');
  // link.download = `${file.name}.gltf`;
  // document.body.appendChild(link);
  //
  // for(const levelName in result.gltf) {
  //   const level = result.gltf[levelName];
  //   for(const categoryName in level) {
  //     const category = level[categoryName];
  //     link.href = URL.createObjectURL(category.file);
  //     link.click();
  //   }
  // }
  //
  // link.remove();

  const overlay = document.getElementById('loading-overlay');
  const progressText = document.getElementById('loading-progress');

  progressText.style.color = 'black';
  overlay.classList.remove('hidden');
  progressText.innerText = `Loading`;

  viewer.IFC.loader.ifcManager.setOnProgress(async (event) => {
    const percentage = Math.floor((event.loaded * 100) / event.total);
    progressText.innerText = `Loaded ${percentage}%`;

    if (percentage === 100) {

      const loadcomplete = document.createElement('div');
      loadcomplete.setAttribute("id", "loadedcomplete");
      document.body.appendChild(loadcomplete);
      await viewer.context.getIfcCamera().currentNavMode.fitModelToFrame()

    }
  });

  viewer.IFC.loader.ifcManager.parser.setupOptionalCategories({
    [IFCSPACE]: false,
    [IFCOPENINGELEMENT]: false
  });

  model = await viewer.IFC.loadIfc(event.target.files[0], false);
  model?.material.forEach((mat) => (mat.side = 2));

  if (first) first = false;
  else {
    ClippingEdges.forceStyleUpdate = true;
  }

  // await createFill(model.modelID);
  viewer.edges.create(`${model.modelID}`, model.modelID, lineMaterial, baseMaterial);

  await viewer.shadowDropper.renderShadow(model.modelID);

  overlay.classList.add('hidden');
  await viewer.context.getIfcCamera().currentNavMode.fitModelToFrame()
};

const inputElement = document.createElement('input');
inputElement.setAttribute('type', 'file');
inputElement.classList.add('hidden');
inputElement.addEventListener('change', loadIfc, false);
document.body.appendChild(inputElement);

const handleKeyDown = async (event) => {
  if (event.code === 'Delete') {
    viewer.clipper.deletePlane();
    viewer.dimensions.delete();
  }
  if (event.code === 'Escape') {
    viewer.IFC.selector.unHighlightIfcItems();
  }
};

window.onmousemove = () => viewer.IFC.selector.prePickIfcItem();
window.onkeydown = handleKeyDown;
window.onclick = () => {
  if (drawingstate) {
    const currentPlanObj = viewer.plans.planLists[0]?.[currentPlan];
    const planemesh = currentPlanObj.plane.planeMesh;
    viewer.dimensions.createInPlane(planemesh);
  }
};
window.ondblclick = async () => {
  if (viewer.clipper.active) {
    viewer.clipper.createPlane();
  } else {
    const result = await viewer.IFC.selector.highlightIfcItem(true);
    if (!result) return;
    const { modelID, id } = result;
    const props = await viewer.IFC.getProperties(modelID, id, true, false);
    console.log(props);
    const flatmesh = await viewer.IFC.loader.ifcManager.ifcAPI.GetFlatMesh(modelID, id);
    console.log('flatmesh', flatmesh.geometries.get(0));
    const geo = await viewer.IFC.loader.ifcManager.ifcAPI.GetGeometry(modelID, id);
    console.log('geo', geo.GetVertexData());
  }
};

//Setup UI
const loadButton = createSideMenuButton('./resources/folder-icon.svg');
loadButton.addEventListener('click', () => {
  loadButton.blur();
  inputElement.click();
});

const sectionButton = createSideMenuButton('./resources/section-plane-down.svg');
sectionButton.addEventListener('click', () => {
  sectionButton.blur();
  viewer.clipper.toggle();
});

const dropBoxButton = createSideMenuButton('./resources/dropbox-icon.svg');
dropBoxButton.addEventListener('click', () => {
  dropBoxButton.blur();
  viewer.dropbox.loadDropboxIfc();
});

let planNames = [];

function createList(array) {
  const container = document.createElement('div');
  container.setAttribute('class', 'floating-top');

  array.forEach(function (rowData) {
    const row = document.createElement('input');
    const label = document.createElement('label');
    row.setAttribute('type', 'radio');
    row.setAttribute('value', rowData);
    row.setAttribute('id', rowData);
    row.setAttribute('name', 'floorselector');
    row.onclick = async () => {
      viewer.plans.goTo(0, rowData, true).then(() => console.log(rowData));
      currentPlan = rowData;
    };

    label.setAttribute('for', rowData);
    label.innerText = rowData;

    container.appendChild(row);
    container.appendChild(label);
  });

  document.body.appendChild(container);
}

const mode2dButton = createSideMenuButton('./resources/2d-icon.png');
mode2dButton.addEventListener('click', async () => {
  dropBoxButton.blur();
  viewer.context.renderer.postProduction.active = false;

  await viewer.plans.computeAllPlanViews(0);

  const edgesName = 'exampleEdges';
  const lineMaterial = new LineBasicMaterial({ color: 0x000000 });
  const meshMaterial = new MeshBasicMaterial();
  await viewer.edges.create(edgesName, 0, lineMaterial, meshMaterial);
  viewer.edges.toggle(edgesName, true);

  viewer.shadowDropper.shadows[0].root.visible = false;

  const currentPlans = viewer.plans.planLists[0];
  planNames = Object.keys(currentPlans);
  createList(planNames);
  await viewer.plans.goTo(0, planNames[0], true);
});

const screenshotButton = createSideMenuButton('./resources/png-icon.png');
screenshotButton.addEventListener('click', async () => {
  await viewer.context.getIfcCamera().currentNavMode.fitModelToFrame()

  const imgData = await viewer.context.renderer.newScreenshot(undefined, new Vector2(500, 500));
  const link = document.createElement('a');
  document.body.appendChild(link);

  link.setAttribute('download', 'screenshot.png');
  link.setAttribute('href', imgData.replace('image/png', 'image/octet-stream'));
  link.click();

});

const pdfExportButton = createSideMenuButton('./resources/pdf-icon.png');
pdfExportButton.addEventListener('click', async () => {
  const doc = new jsPDF('l', 'mm', 'a4');

  const planObj = viewer.plans.planLists[0];

  viewer.pdf.newDocument('a', doc, 10);

  viewer.pdf.drawNamedLayer('a', planObj[currentPlan], 'thick', viewer.dimensions);
  viewer.pdf.drawNamedLayer('a', planObj[currentPlan], 'thin');

  viewer.pdf.exportPDF('a', 'test');
});

const dimensions = createSideMenuButton('./resources/dimensions.png');
dimensions.addEventListener('click', async () => {
  viewer.dimensions.previewActive = true;
  viewer.dimensions.active = true;
  drawingstate = true;
});
