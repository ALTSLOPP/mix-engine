import * as THREE from 'three';

export interface SlicedGeometries {
  positive: THREE.BufferGeometry;
  negative: THREE.BufferGeometry;
  cutArea: number;
}

export interface SliceOptions {
  capFaces?: boolean;
  tolerance?: number;
}

interface VertexData {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  uv: THREE.Vector2;
}

interface CutEdge {
  v1: VertexData;
  v2: VertexData;
}

export class MeshSlicer {
  private static readonly EPSILON = 1e-5;

  /**
   * Slices a BufferGeometry along a plane defined by a point and normal.
   */
  static sliceGeometry(
    geometry: THREE.BufferGeometry,
    planePoint: THREE.Vector3,
    planeNormal: THREE.Vector3,
    options: SliceOptions = {}
  ): SlicedGeometries {
    const norm = planeNormal.clone().normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(norm, planePoint);
    const capFaces = options.capFaces ?? true;
    const tolerance = options.tolerance ?? MeshSlicer.EPSILON;

    // Ensure geometry is non-indexed for direct triangle processing
    const workingGeo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

    const posAttr = workingGeo.getAttribute('position');
    const normAttr = workingGeo.getAttribute('normal');
    const uvAttr = workingGeo.getAttribute('uv');

    const posPos: number[] = [];
    const posNorm: number[] = [];
    const posUv: number[] = [];

    const negPos: number[] = [];
    const negNorm: number[] = [];
    const negUv: number[] = [];

    const cutEdges: CutEdge[] = [];

    const vA: VertexData = { position: new THREE.Vector3(), normal: new THREE.Vector3(), uv: new THREE.Vector2() };
    const vB: VertexData = { position: new THREE.Vector3(), normal: new THREE.Vector3(), uv: new THREE.Vector2() };
    const vC: VertexData = { position: new THREE.Vector3(), normal: new THREE.Vector3(), uv: new THREE.Vector2() };

    const triangleCount = posAttr.count / 3;

    for (let i = 0; i < triangleCount; i++) {
      const idx = i * 3;
      MeshSlicer.readVertex(posAttr, normAttr, uvAttr, idx, vA);
      MeshSlicer.readVertex(posAttr, normAttr, uvAttr, idx + 1, vB);
      MeshSlicer.readVertex(posAttr, normAttr, uvAttr, idx + 2, vC);

      const dA = plane.distanceToPoint(vA.position);
      const dB = plane.distanceToPoint(vB.position);
      const dC = plane.distanceToPoint(vC.position);

      const sideA = Math.abs(dA) < tolerance ? 0 : dA > 0 ? 1 : -1;
      const sideB = Math.abs(dB) < tolerance ? 0 : dB > 0 ? 1 : -1;
      const sideC = Math.abs(dC) < tolerance ? 0 : dC > 0 ? 1 : -1;

      // Case 1: Entire triangle is on the positive side
      if (sideA >= 0 && sideB >= 0 && sideC >= 0) {
        MeshSlicer.appendTriangle(posPos, posNorm, posUv, vA, vB, vC);
      }
      // Case 2: Entire triangle is on the negative side
      else if (sideA <= 0 && sideB <= 0 && sideC <= 0) {
        MeshSlicer.appendTriangle(negPos, negNorm, negUv, vA, vB, vC);
      }
      // Case 3: Triangle intersects the plane
      else {
        MeshSlicer.splitTriangle(
          vA, vB, vC,
          dA, dB, dC,
          posPos, posNorm, posUv,
          negPos, negNorm, negUv,
          cutEdges
        );
      }
    }

    let cutArea = 0;

    // Cap the exposed cut face if requested
    if (capFaces && cutEdges.length >= 3) {
      cutArea = MeshSlicer.capCrossSection(
        cutEdges,
        norm,
        posPos, posNorm, posUv,
        negPos, negNorm, negUv
      );
    }

    const posGeo = MeshSlicer.createGeometry(posPos, posNorm, posUv);
    const negGeo = MeshSlicer.createGeometry(negPos, negNorm, negUv);

    return {
      positive: posGeo,
      negative: negGeo,
      cutArea,
    };
  }

  /**
   * Slices a Three.js Mesh in world space and creates two new meshes.
   */
  static sliceMesh(
    mesh: THREE.Mesh,
    planePointWorld: THREE.Vector3,
    planeNormalWorld: THREE.Vector3,
    options: SliceOptions = {}
  ): { positiveMesh: THREE.Mesh; negativeMesh: THREE.Mesh; cutArea: number } {
    mesh.updateMatrixWorld(true);

    // Transform plane to mesh local coordinates
    const invMat = mesh.matrixWorld.clone().invert();
    const localPoint = planePointWorld.clone().applyMatrix4(invMat);
    const localNormal = planeNormalWorld.clone().transformDirection(invMat).normalize();

    const { positive, negative, cutArea } = MeshSlicer.sliceGeometry(
      mesh.geometry,
      localPoint,
      localNormal,
      options
    );

    const posMesh = new THREE.Mesh(positive, mesh.material);
    const negMesh = new THREE.Mesh(negative, mesh.material);

    posMesh.position.copy(mesh.position);
    posMesh.quaternion.copy(mesh.quaternion);
    posMesh.scale.copy(mesh.scale);

    negMesh.position.copy(mesh.position);
    negMesh.quaternion.copy(mesh.quaternion);
    negMesh.scale.copy(mesh.scale);

    return { positiveMesh: posMesh, negativeMesh: negMesh, cutArea };
  }

  private static readVertex(
    posAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    normAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    uvAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    index: number,
    out: VertexData
  ): void {
    out.position.set(posAttr.getX(index), posAttr.getY(index), posAttr.getZ(index));
    if (normAttr) out.normal.set(normAttr.getX(index), normAttr.getY(index), normAttr.getZ(index));
    else out.normal.set(0, 1, 0);
    if (uvAttr) out.uv.set(uvAttr.getX(index), uvAttr.getY(index));
    else out.uv.set(0, 0);
  }

  private static appendTriangle(
    positions: number[],
    normals: number[],
    uvs: number[],
    v1: VertexData,
    v2: VertexData,
    v3: VertexData
  ): void {
    positions.push(
      v1.position.x, v1.position.y, v1.position.z,
      v2.position.x, v2.position.y, v2.position.z,
      v3.position.x, v3.position.y, v3.position.z
    );
    normals.push(
      v1.normal.x, v1.normal.y, v1.normal.z,
      v2.normal.x, v2.normal.y, v2.normal.z,
      v3.normal.x, v3.normal.y, v3.normal.z
    );
    uvs.push(
      v1.uv.x, v1.uv.y,
      v2.uv.x, v2.uv.y,
      v3.uv.x, v3.uv.y
    );
  }

  private static interpolateVertex(vA: VertexData, vB: VertexData, t: number): VertexData {
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      position: new THREE.Vector3().lerpVectors(vA.position, vB.position, clampedT),
      normal: new THREE.Vector3().lerpVectors(vA.normal, vB.normal, clampedT).normalize(),
      uv: new THREE.Vector2().lerpVectors(vA.uv, vB.uv, clampedT),
    };
  }

  private static splitTriangle(
    vA: VertexData, vB: VertexData, vC: VertexData,
    dA: number, dB: number, dC: number,
    posPos: number[], posNorm: number[], posUv: number[],
    negPos: number[], negNorm: number[], negUv: number[],
    cutEdges: CutEdge[]
  ): void {
    const vertices = [vA, vB, vC];
    const distances = [dA, dB, dC];

    // Find the single vertex on one side vs two vertices on the other
    let loneIdx = 0;
    if ((dA > 0 && dB <= 0 && dC <= 0) || (dA < 0 && dB >= 0 && dC >= 0)) {
      loneIdx = 0;
    } else if ((dB > 0 && dA <= 0 && dC <= 0) || (dB < 0 && dA >= 0 && dC >= 0)) {
      loneIdx = 1;
    } else {
      loneIdx = 2;
    }

    const i0 = loneIdx;
    const i1 = (loneIdx + 1) % 3;
    const i2 = (loneIdx + 2) % 3;

    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];

    const d0 = distances[i0];
    const d1 = distances[i1];
    const d2 = distances[i2];

    const t01 = d0 / (d0 - d1);
    const t02 = d0 / (d0 - d2);

    const cut1 = MeshSlicer.interpolateVertex(v0, v1, t01);
    const cut2 = MeshSlicer.interpolateVertex(v0, v2, t02);

    if (d0 > 0) {
      // Lone vertex is on positive side
      MeshSlicer.appendTriangle(posPos, posNorm, posUv, v0, cut1, cut2);
      MeshSlicer.appendTriangle(negPos, negNorm, negUv, cut1, v1, v2);
      MeshSlicer.appendTriangle(negPos, negNorm, negUv, cut1, v2, cut2);
      cutEdges.push({ v1: cut1, v2: cut2 });
    } else {
      // Lone vertex is on negative side
      MeshSlicer.appendTriangle(negPos, negNorm, negUv, v0, cut1, cut2);
      MeshSlicer.appendTriangle(posPos, posNorm, posUv, cut1, v1, v2);
      MeshSlicer.appendTriangle(posPos, posNorm, posUv, cut1, v2, cut2);
      cutEdges.push({ v1: cut2, v2: cut1 });
    }
  }

  private static capCrossSection(
    edges: CutEdge[],
    planeNormal: THREE.Vector3,
    posPos: number[], posNorm: number[], posUv: number[],
    negPos: number[], negNorm: number[], negUv: number[]
  ): number {
    if (edges.length < 3) return 0;

    // Calculate centroid of cut section
    const centroid = new THREE.Vector3();
    for (const e of edges) {
      centroid.add(e.v1.position);
      centroid.add(e.v2.position);
    }
    centroid.divideScalar(edges.length * 2);

    // Construct orthonormal UV tangent basis on the cutting plane
    const norm = planeNormal.clone().normalize();
    const invNorm = norm.clone().negate();
    const up = Math.abs(norm.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const uDir = new THREE.Vector3().crossVectors(up, norm).normalize();
    const vDir = new THREE.Vector3().crossVectors(norm, uDir).normalize();

    const centerUv = new THREE.Vector2(centroid.dot(uDir), centroid.dot(vDir));

    const centerVertex: VertexData = {
      position: centroid,
      normal: norm.clone(),
      uv: centerUv,
    };

    const invCenterVertex: VertexData = {
      position: centroid,
      normal: invNorm.clone(),
      uv: centerUv,
    };

    let totalArea = 0;

    for (const edge of edges) {
      const uv1 = new THREE.Vector2(edge.v1.position.dot(uDir), edge.v1.position.dot(vDir));
      const uv2 = new THREE.Vector2(edge.v2.position.dot(uDir), edge.v2.position.dot(vDir));

      const v1Pos: VertexData = {
        position: edge.v1.position,
        normal: norm,
        uv: uv1,
      };
      const v2Pos: VertexData = {
        position: edge.v2.position,
        normal: norm,
        uv: uv2,
      };

      const v1Neg: VertexData = {
        position: edge.v1.position,
        normal: invNorm,
        uv: uv1,
      };
      const v2Neg: VertexData = {
        position: edge.v2.position,
        normal: invNorm,
        uv: uv2,
      };

      // Positive side cap face
      MeshSlicer.appendTriangle(posPos, posNorm, posUv, centerVertex, v1Pos, v2Pos);

      // Negative side cap face (reversed winding)
      MeshSlicer.appendTriangle(negPos, negNorm, negUv, invCenterVertex, v2Neg, v1Neg);

      // Accumulate cross-section area
      const ab = new THREE.Vector3().subVectors(edge.v1.position, centroid);
      const ac = new THREE.Vector3().subVectors(edge.v2.position, centroid);
      totalArea += new THREE.Vector3().crossVectors(ab, ac).length() * 0.5;
    }

    return totalArea;
  }

  private static createGeometry(positions: number[], normals: number[], uvs: number[]): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    if (positions.length > 0) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    }
    return geo;
  }
}
