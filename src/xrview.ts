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
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
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
    leftTex.colorSpace = THREE.SRGBColorSpace;
    rightTex.colorSpace = THREE.SRGBColorSpace;
    this.leftTex = leftTex; this.rightTex = rightTex;

    // Two planes, one per eye, same position
    const geo = new THREE.PlaneGeometry(1.0, 1.0);
    const leftMat = new THREE.MeshBasicMaterial({ map: leftTex, transparent: true });
    const rightMat = new THREE.MeshBasicMaterial({ map: rightTex, transparent: true });
    const leftMesh = new THREE.Mesh(geo, leftMat);
    const rightMesh = new THREE.Mesh(geo, rightMat);
    leftMesh.layers.set(1);
    rightMesh.layers.set(2);
    leftMesh.position.set(-0.55, 1.4, -2.0);
    rightMesh.position.copy(leftMesh.position);
    group.add(leftMesh);
    group.add(rightMesh);

    // Update textures periodically
    setInterval(() => {
      if (this.leftTex) this.leftTex.needsUpdate = true;
      if (this.rightTex) this.rightTex.needsUpdate = true;
    }, 250);

    const onResize = (): void => {
      if (!this.renderer || !this.camera) return;
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    renderer.setAnimationLoop(() => {
      const xrCam = renderer.xr.getCamera();
      // During XR, this is an ArrayCamera with two sub-cameras
      // Ensure per-eye layers are enabled appropriately
      // Types don't expose cameras array, so cast to unknown then any with caution
      const anyCam = xrCam as unknown as { isArrayCamera?: boolean; cameras?: THREE.Camera[] };
      if (anyCam.isArrayCamera && anyCam.cameras && anyCam.cameras.length >= 2) {
        anyCam.cameras[0].layers.enable(1); anyCam.cameras[0].layers.disable(2);
        anyCam.cameras[1].layers.enable(2); anyCam.cameras[1].layers.disable(1);
      }
      renderer.render(scene, camera);
    });

    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr) {
      // No WebXR; nothing else to do.
      return;
    }
    const session = await xr.requestSession('immersive-vr');
    // three will manage the render loop after session is set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (renderer.xr as unknown as { setSession: (s: XRSession) => Promise<void> }).setSession(session);
  }
}

declare global {
  interface XRSystem { requestSession(mode: 'immersive-vr'): Promise<XRSession>; }
  interface XRSession {}
}


