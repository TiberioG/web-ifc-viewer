import { Color, Box3 } from 'three';
import { PlanView } from '../display';

export class PDFWriter {
  documents: { [id: string]: { scale: number; drawing: any } } = {};
  private errorText = 'The specified document does not exist.';

  dispose() {
    (this.documents as any) = null;
  }

  setLineWidth(id: string, lineWidth: number) {
    const document = this.getDocument(id);
    document.drawing.setLineWidth(lineWidth);
  }

  setColor(id: string, color: Color) {
    const document = this.getDocument(id);
    document.drawing.setTextColor(color.r, color.g, color.b);
  }

  setScale(id: string, scale: number) {
    const document = this.getDocument(id);
    document.scale = scale;
  }

  newDocument(id: string, jsPDFDocument: any, scale = 1) {
    this.documents[id] = { drawing: jsPDFDocument, scale };
  }

  getScale(bbox: Box3, pageHeight: number, pageWidth: number) {

    const height = bbox.max.x - bbox.min.x;
    const width = bbox.max.z - bbox.min.z;

    const minPagesize = Math.min(pageHeight, pageWidth);
    const maxBoxDim = Math.max(height, width);

    if (maxBoxDim === 0 || minPagesize === 0) return 1;

    return minPagesize / maxBoxDim;
  }

  drawNamedLayer(id: string, plan: PlanView, layerName: string, offsetX = 0, offsetY = 0) {
    if (!plan.plane) return;
    const layer = plan.plane.edges.edges[layerName];
    if (!layer) return;
    layer.mesh.geometry.computeBoundingBox();
    console.log(layer);
    const bbox = new Box3().setFromObject(layer.mesh);
    console.log('bbox', bbox);
    const coordinates = layer.generatorGeometry.attributes.position.array;


    // console.log(coordinates);
    // const min = Math.min.apply(null, Array.from(coordinates));
    // console.log(min);
    this.draw(id, coordinates, bbox);
  }

  draw(id: string, coordinates: ArrayLike<number>, box: Box3) {
    const document = this.getDocument(id);
    const scale = this.getScale(box, 210, 297);
    const offsetX = Math.abs(box.min.x) + 1;
    const offsetY = Math.abs(box.min.z) + 1;

    const height = box.max.x - box.min.x;
    const width = box.max.z - box.min.z;

    for (let i = 0; i < coordinates.length - 5; i += 6) {
      const start = [(coordinates[i] + offsetX) * scale, (coordinates[i + 2] + offsetY) * scale];
      const end = [(coordinates[i + 3] + offsetX) * scale, (coordinates[i + 5] + offsetY) * scale];
      // eslint-disable-next-line no-continue
      if (start[0] === 0 && start[1] === 0 && end[0] === 0 && end[1] === 0) continue;
      document.drawing.line(start[0], start[1], end[0], end[1], 'S');
    }

    // document.drawing.rect(1, 1, width * scale, height * scale); for debug purposes
    console.log(document);
  }

  exportPDF(id: string, exportName: string) {
    const document = this.getDocument(id);
    document.drawing.save(exportName);
  }

  private getDocument(id: string) {
    if (!this.documents[id]) throw new Error(this.errorText);
    return this.documents[id];
  }
}
