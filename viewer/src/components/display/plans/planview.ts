import { PlanViewConfig } from './plan-manager';
import { IfcPlane } from '../clipping-planes/planes';
import { IfcDimensions } from '../dimensions/dimensions';
import { IfcContext } from '../../context';

export class PlanView implements PlanViewConfig {
  expressID: number;
  modelID: number;
  name: string;
  plane?: IfcPlane;
  ortho: boolean;
  drawings?: IfcDimensions;
  context: IfcContext;

  constructor(
    modelID: number,
    expressID: number,
    name: string,
    ortho: boolean,
    context: IfcContext
  ) {
    this.expressID = expressID;
    this.modelID = modelID;
    this.name = name;
    this.ortho = ortho;
    this.context = context;
  }

  addPlane(plane: IfcPlane) {
    this.plane = plane;
    // generating the dimensions
    this.drawings = new IfcDimensions(this.context);
    this.drawings.plane = this.plane.planeMesh;
  }
}
