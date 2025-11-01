import * as THREE from 'three';
import { Painter } from './painter';

export class XRView {
  private painter: Painter;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private leftTex: THREE.CanvasTexture | null = null;
  private rightTex: THREE.CanvasTexture | null = null;

  constructor(painter: Painter) { this.painter = painter; }

  async enterXR(): Promise<void> {
    if (this.renderer) return;
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    this.scene = scene; this.camera = camera;

    const group = new THREE.Group();
    scene.add(group);

    // Textures from canvases
    const leftCanvas = (document.getElementById('left') as HTMLCanvasElement);
    const rightCanvas = (document.getElementById('right') as HTMLCanvasElement);
    const leftTex = new THREE.CanvasTexture(leftCanvas);
    const rightTex = new THREE.CanvasTexture(rightCanvas);
    leftTex.generateMipmaps = false; rightTex.generateMipmaps = false;
    leftTex.minFilter = THREE.LinearFilter; leftTex.magFilter = THREE.LinearFilter;
    rightTex.minFilter = THREE.LinearFilter; rightTex.magFilter = THREE.LinearFilter;
    leftTex.colorSpace = THREE.SRGBColorSpace;
    rightTex.colorSpace = THREE.SRGBColorSpace;
    this.leftTex = leftTex; this.rightTex = rightTex;

    // Two planes, one per eye; sized per-eye each XR frame to fill FOV
    const geo = new THREE.PlaneGeometry(1, 1);
    const leftMat = new THREE.MeshBasicMaterial({ map: leftTex, transparent: true, depthTest: false, depthWrite: false });
    const rightMat = new THREE.MeshBasicMaterial({ map: rightTex, transparent: true, depthTest: false, depthWrite: false });
    const leftMesh = new THREE.Mesh(geo, leftMat);
    const rightMesh = new THREE.Mesh(geo, rightMat);
    leftMesh.layers.set(1);
    rightMesh.layers.set(2);
    leftMesh.frustumCulled = false;
    rightMesh.frustumCulled = false;
    leftMesh.renderOrder = 999;
    rightMesh.renderOrder = 999;
    group.add(leftMesh);
    group.add(rightMesh);

    // Ensure textures update every XR frame
    const updateTextures = (): void => {
      if (this.leftTex) this.leftTex.needsUpdate = true;
      if (this.rightTex) this.rightTex.needsUpdate = true;
    };

    const onResize = (): void => {
      if (!this.renderer || !this.camera) return;
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // Helpers for sizing the planes to each eye's FOV
    const tmpPos = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const placeQuadInFrontOfEye = (eyeCam: THREE.PerspectiveCamera, mesh: THREE.Mesh): void => {
      const d = 0.6; // meters in front of eye
      // Compute plane size using projection matrix to fully cover frustum
      const m = eyeCam.projectionMatrix.elements;
      const m00 = m[0]; // = 1 / tan(fovX/2)
      const m11 = m[5]; // = 1 / tan(fovY/2)
      const width = (2 * d) / m00;
      const height = (2 * d) / m11;
      eyeCam.getWorldPosition(tmpPos);
      eyeCam.getWorldDirection(tmpDir);
      eyeCam.getWorldQuaternion(tmpQuat);
      mesh.position.copy(tmpPos).add(tmpDir.multiplyScalar(d));
      mesh.quaternion.copy(tmpQuat);
      mesh.scale.set(width, height, 1);
      mesh.updateMatrixWorld();
    };

    renderer.setAnimationLoop(() => {
      updateTextures();
      const xrCam = renderer.xr.getCamera();
      // During XR, this is an ArrayCamera with two sub-cameras
      // Ensure per-eye layers are enabled appropriately
      // Types don't expose cameras array, so cast to unknown then any with caution
      const anyCam = xrCam as unknown as { isArrayCamera?: boolean; cameras?: THREE.Camera[] };
      if (anyCam.isArrayCamera && anyCam.cameras && anyCam.cameras.length >= 2) {
        const c0 = anyCam.cameras[0] as THREE.PerspectiveCamera;
        const c1 = anyCam.cameras[1] as THREE.PerspectiveCamera;
        c0.layers.set(1);
        c1.layers.set(2);
        placeQuadInFrontOfEye(c0, leftMesh);
        placeQuadInFrontOfEye(c1, rightMesh);
      }
      renderer.render(scene, camera);
    });

    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr) {
      // No WebXR; nothing else to do.
      return;
    }
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    // three will manage the render loop after session is set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (renderer.xr as unknown as { setSession: (s: XRSession) => Promise<void> }).setSession(session);
  }
}

declare global {
  interface XRSystem { requestSession(mode: 'immersive-vr'): Promise<XRSession>; }
  interface XRSession {}
}


