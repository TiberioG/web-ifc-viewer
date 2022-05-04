import { LineBasicMaterial, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { IFCBUILDINGSTOREY, IFCBUILDING } from 'web-ifc';
import { Subset } from 'web-ifc-three/IFC/components/subsets/SubsetManager';
import { IfcPlane } from '../clipping-planes/planes';
import { IfcClipper } from '../clipping-planes/clipper';
import { CameraProjections, NavigationModes } from '../../../base-types';
import { IfcManager } from '../../ifc';
import { UnitType } from '../../ifc/units';
import { IfcContext } from '../../context';
import { disposeMeshRecursively } from '../../../utils/ThreeUtils';
import { Edges } from '../edges';
import { IFCModel } from 'web-ifc-three/IFC/components/IFCModel';

export interface PlanViewConfig {
  modelID: number;
  expressID: number;
  name: string;
  normal?: Vector3;
  point?: Vector3;
  ortho?: boolean;
  rotation?: number;
}

export interface PlanView extends PlanViewConfig {
  plane?: IfcPlane;
}

export class PlanManager {
  planLists: { [modelID: number]: { [planId: number]: PlanView } } = {};

  sectionFill: Mesh;
  edges: Edges;

  storeySubsets: { [floorId: number]: Subset };


  active = false;
  currentPlan?: PlanView;

  defaultSectionOffset = 1.5;
  defaultCameraOffset = 30;
  storeys: { [modelID: number]: any[] } = [];

  private floorPlanViewCached = false;
  private previousCamera = new Vector3();
  private previousTarget = new Vector3();
  private previousProjection = CameraProjections.Perspective;

  constructor(private ifc: IfcManager, private context: IfcContext, private clipper: IfcClipper) {
    this.sectionFill = new Mesh();
    this.edges = new Edges(context);
    this.storeySubsets = [];

  }

  dispose() {
    disposeMeshRecursively(this.sectionFill);
    (this.sectionFill as any) = null;
    (this.storeys as any) = null;
    (this.planLists as any) = null;
    this.edges.dispose();
    (this.edges as any) = null;
  }

  getAll(modelID: number) {
    const currentPlans = this.planLists[modelID];
    if (!currentPlans) throw new Error('The requested model doesn\'t have floor plans generated');
    return Object.keys(currentPlans);
  }

  async create(config: PlanViewConfig) {
    const { modelID, name } = config;

    const ortho = config.ortho || true;
    if (this.planLists[modelID] === undefined) this.planLists[modelID] = {};
    const currentPlanlist = this.planLists[modelID];
    const expressID = config.expressID;

    if (currentPlanlist[expressID]) return;
    currentPlanlist[expressID] = { modelID, name, ortho, expressID };
    await this.createClippingPlane(config, currentPlanlist[expressID]);
  }

  async goTo(modelID: number, planId: number, animate = false, hideColors = true) {
    if (this.currentPlan?.modelID === modelID && this.currentPlan.expressID === planId) return;

    const manager = this.ifc.loader.ifcManager;
    console.log(manager);
    Object.entries(this.storeySubsets).forEach(([id, subset]) => {
      const mysubset = manager.getSubset(modelID, undefined, `storey-${planId}`);
      console.log(mysubset);
      if (hideColors) mysubset.removeFromParent();
      // eslint-disable-next-line eqeqeq
      if (id != planId.toString()) {
        subset.visible = false;
      }
    });
    this.edges.toggle(`edges${planId}`, true);
    this.storeCameraPosition();
    this.hidePreviousClippingPlane();
    this.getCurrentPlan(modelID, planId);
    this.activateCurrentPlan();
    if (!this.active) {
      await this.moveCameraTo2DPlanPosition(animate);
      this.active = true;
    }
  }

  async exitPlanView(animate = false) {
    if (!this.active) return;
    this.active = false;

    this.cacheFloorplanView();

    this.context.ifcCamera.setNavigationMode(NavigationModes.Orbit);
    this.context.ifcCamera.projection = this.previousProjection;
    if (this.currentPlan && this.currentPlan.plane) {
      this.currentPlan.plane.active = false;
    }
    this.currentPlan = undefined;
    await this.context.ifcCamera.cameraControls.setLookAt(
      this.previousCamera.x,
      this.previousCamera.y,
      this.previousCamera.z,
      this.previousTarget.x,
      this.previousTarget.y,
      this.previousTarget.z,
      animate
    );
  }


  async computeAllPlanViews(modelID: number) {
    await this.getCurrentStoreys(modelID);

    const unitsScale = await this.ifc.units.getUnits(modelID, UnitType.LENGTHUNIT);
    const siteCoords = await this.getSiteCoords(modelID);
    const transformHeight = await this.getTransformHeight(modelID);
    const storeys = this.storeys[modelID];


    for (let i = 0; i < storeys.length; i++) {
      if (storeys[i]) {
        const baseHeight = storeys[i].Elevation.value;
        const elevation = (baseHeight + siteCoords[2]) * unitsScale + transformHeight;
        const expressID = storeys[i].expressID;
        const manager = this.ifc.loader.ifcManager;
        const floorSubset = manager.createSubset({
          modelID,
          ids: [expressID],
          applyBVH: true,
          scene: this.context.getScene(),
          removePrevious: true,
          customID: `storey-${expressID}`
        });

        this.storeySubsets = Object.assign(this.storeySubsets, { expressID: floorSubset });

        const lineMaterial = new LineBasicMaterial({ color: 0x000000 });
        const meshMaterial = new MeshBasicMaterial();
        await this.edges.createFromSubset(
          `edges${expressID}`,
          floorSubset,
          lineMaterial,
          meshMaterial
        );

        // eslint-disable-next-line no-await-in-loop
        await this.create({
          modelID,
          name: this.getFloorplanName(storeys[i]) + i,
          point: new Vector3(0, elevation + this.defaultSectionOffset, 0),
          normal: new Vector3(0, -1, 0),
          rotation: 0,
          ortho: true,
          expressID
        });
      }
    }

    // const items = this.context.items;
    // items.pickableIfcModels = items.pickableIfcModels.filter((model: any) => model !== model);
    // items.ifcModels = items.ifcModels.filter((model: any) => model !== model);
    // // this.context.removeFromParent();

    // Object.keys(this.ifc.loader.ifcManager.subsets).forEach((key) => {
    //   if (key.includes('storey'))
    //     { // @ts-ignore
    //       this.context.scene.addModel(this.ifc.loader.ifcManager.subsets[key].mesh as IFCModel);
    //     }
    // });
  }

  private storeCameraPosition() {
    if (this.active) {
      this.cacheFloorplanView();
    } else {
      this.store3dCameraPosition();
    }
  }

  private async createClippingPlane(config: PlanViewConfig, plan: PlanView) {
    if (config.normal && config.point) {
      const { normal, point } = config;
      const plane = this.clipper.createFromNormalAndCoplanarPoint(normal, point, true);
      plane.visible = false;
      plane.active = false;
      plan.plane = plane;
      await plane.edges.updateEdges();
      plane.edges.visible = false;
    }
  }

  private async getTransformHeight(modelID: number) {
    const transformMatrix = await this.ifc.loader.ifcManager.ifcAPI.GetCoordinationMatrix(modelID);
    return transformMatrix[13];
  }

  private async getCurrentStoreys(modelID: number) {
    if (!this.storeys[modelID]) {
      this.storeys[modelID] = await this.ifc.getAllItemsOfType(modelID, IFCBUILDINGSTOREY, true);
    }
  }

  private async getSiteCoords(modelID: number) {
    const building = await this.getBuilding(modelID);
    const sitePlace = building.ObjectPlacement.PlacementRelTo.RelativePlacement.Location;
    return sitePlace.Coordinates.map((coord: any) => coord.value);
  }

  private async getBuilding(modelID: number) {
    const allBuildingsIDs = await this.ifc.getAllItemsOfType(modelID, IFCBUILDING, false);
    const buildingID = allBuildingsIDs[0];
    return this.ifc.getProperties(modelID, buildingID, false, true);
  }

  private cacheFloorplanView() {
    this.floorPlanViewCached = true;
    this.context.ifcCamera.cameraControls.saveState();
  }

  private async moveCameraTo2DPlanPosition(animate: boolean) {
    if (this.floorPlanViewCached) await this.context.ifcCamera.cameraControls.reset(animate);
    else await this.context.ifcCamera.cameraControls.setLookAt(0, 100, 0, 0, 0, 0, animate);
  }

  private activateCurrentPlan() {
    if (!this.currentPlan) throw new Error('Current plan is not defined.');
    if (this.currentPlan.plane) this.currentPlan.plane.active = true;
    this.context.ifcCamera.setNavigationMode(NavigationModes.Plan);
    this.context.ifcCamera.projection = this.currentPlan.ortho
      ? CameraProjections.Orthographic
      : CameraProjections.Perspective;
  }

  private store3dCameraPosition() {
    this.context.getCamera().getWorldPosition(this.previousCamera);
    this.context.ifcCamera.cameraControls.getTarget(this.previousTarget);
    this.previousProjection = this.context.ifcCamera.projection;
  }

  private getCurrentPlan(modelID: number, planId: number) {
    if (!this.planLists || !(modelID in this.planLists))
      throw new Error('No planlist for the requested modelID ');
    const currentPlanList = this.planLists[modelID];
    console.log(this.planLists);
    if (!(planId in currentPlanList)) throw new Error('The specified plan is undefined!');
    if (!currentPlanList[planId]) throw new Error('The specified plan name does not exist!');
    this.currentPlan = currentPlanList[planId];
  }

  private hidePreviousClippingPlane() {
    const plane = this.currentPlan?.plane;
    if (plane) plane.active = false;
  }

  private getFloorplanName(floorplan: any) {
    if (floorplan.Name && floorplan.Name.value) {
      return floorplan.Name.value;
    }
    if (floorplan.LongName && floorplan.LongName.value) {
      return floorplan.LongName.value;
    }
    return floorplan.GlobalId.value;
  }
}
