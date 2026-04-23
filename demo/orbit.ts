// Orbit controller — mouse drag rotation, scroll zoom, right-click pan
// Lives in demo/ (not a renderer responsibility)

import { type Vec3, vec3_add, vec3_sub, vec3_scale, vec3_normalize, vec3_cross } from "../src/core/math";

export class OrbitController {
  target: Vec3 = [0, 0, 0];
  distance: number = 4;
  theta: number = 0.5;    // horizontal angle (radians)
  phi: number = 0.5;      // vertical angle (radians), clamped to avoid gimbal lock
  rotateSpeed: number = 0.005;
  zoomSpeed: number = 0.1;
  panSpeed: number = 0.005;

  private isDragging = false;
  private isPanning = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  getEyePosition(): Vec3 {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    return [
      this.target[0] + this.distance * cosPhi * sinTheta,
      this.target[1] + this.distance * sinPhi,
      this.target[2] + this.distance * cosPhi * cosTheta,
    ];
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isDragging = true;
    } else if (e.button === 2) {
      this.isPanning = true;
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.isDragging) {
      this.theta -= dx * this.rotateSpeed;
      this.phi += dy * this.rotateSpeed;
      // Clamp phi to avoid flipping
      this.phi = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.phi));
    }

    if (this.isPanning) {
      const eye = this.getEyePosition();
      const forward = vec3_normalize(vec3_sub(this.target, eye));
      const right = vec3_normalize(vec3_cross(forward, [0, 1, 0]));
      const up = vec3_cross(right, forward);

      const panX = vec3_scale(right, -dx * this.panSpeed * this.distance);
      const panY = vec3_scale(up, dy * this.panSpeed * this.distance);

      this.target = vec3_add(this.target, vec3_add(panX, panY));
    }
  };

  private onMouseUp = (_e: MouseEvent) => {
    this.isDragging = false;
    this.isPanning = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance *= 1 + Math.sign(e.deltaY) * this.zoomSpeed;
    this.distance = Math.max(0.5, Math.min(50, this.distance));
  };

  destroy() {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
