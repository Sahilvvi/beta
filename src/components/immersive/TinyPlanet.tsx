import { useEffect, useRef } from 'react';
import { useScroll } from 'framer-motion';
import * as THREE from 'three';
import { createRoom } from './room';

/**
 * The portal — the reference site's signature move. A pinned chapter right
 * after the hero: a glowing circle opens on a "tiny planet" of a room, then
 * scrolling dives in and the planet unfolds into an immersive 360° view of
 * that room, which slowly pans before the page moves on.
 *
 * The room is captured once into a cube map; a full-screen shader blends a
 * stereographic projection (the planet) into a normal perspective one.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = {
  out3: (x: number) => 1 - Math.pow(1 - x, 3),
  inOut2: (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inOutSine: (x: number) => -(Math.cos(Math.PI * x) - 1) / 2,
  inOutExpo: (x: number) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
};
/** Eased 0 → 1 progress of `u` across the [a, b] window. */
const seg = (u: number, a: number, b: number, e: (x: number) => number = (x) => x) => e(clamp01((u - a) / (b - a)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FRAG = /* glsl */ `
  uniform samplerCube uCube; uniform float uAspect, uD, uPitch, uYaw, uZoom, uMask, uSoft;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2. - 1.; p.x *= uAspect;
    float r = length(p) * uZoom;
    float phi = atan(p.y, p.x);
    // hybrid stereographic (d=1) <-> rectilinear (d=0) inverse projection
    float a = atan(r / (1. + uD));
    float theta = a + asin(clamp(uD * sin(a), -1., 1.));
    vec3 dir = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), -cos(theta));
    float cp = cos(uPitch), sp = sin(uPitch);
    dir = vec3(dir.x, dir.y * cp - dir.z * sp, dir.y * sp + dir.z * cp);
    float cy = cos(uYaw), sy = sin(uYaw);
    dir = vec3(dir.x * cy + dir.z * sy, dir.y, -dir.x * sy + dir.z * cy);
    vec3 col = textureCube(uCube, dir).rgb;
    float m = 1. - smoothstep(uMask - uSoft, uMask, length(p));
    gl_FragColor = vec4(col * m, m);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function TinyPlanet() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const t1Ref = useRef<HTMLDivElement>(null);
  const t2Ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const section = sectionRef.current!;
    let renderer: THREE.WebGLRenderer | null = null;
    let disposeRoom: (() => void) | null = null;
    let mat: THREE.ShaderMaterial | null = null;
    let quadScene: THREE.Scene | null = null;
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let visible = false, raf = 0, last = 0;
    const st = { p: 0, spin: 0 };

    const build = () => {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const room = createRoom(renderer);
      const cubeRT = new THREE.WebGLCubeRenderTarget(window.innerWidth < 768 ? 768 : 1280, {
        type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
      });
      const cubeCam = new THREE.CubeCamera(0.05, 60, cubeRT);
      cubeCam.position.copy(room.center);
      cubeCam.update(renderer, room.scene);
      disposeRoom = () => { room.dispose(); cubeRT.dispose(); };

      mat = new THREE.ShaderMaterial({
        uniforms: {
          uCube: { value: cubeRT.texture }, uAspect: { value: 1 }, uD: { value: 1 }, uPitch: { value: -Math.PI / 2 },
          uYaw: { value: 0 }, uZoom: { value: 4.2 }, uMask: { value: 0 }, uSoft: { value: 0.012 },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
        fragmentShader: FRAG,
        depthTest: false, depthWrite: false, transparent: true, toneMapped: true,
      });
      quadScene = new THREE.Scene();
      quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || !renderer || !mat || !quadScene) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);

      st.p += (scrollYProgress.get() - st.p) * 0.1;
      const u = st.p * 10.4; // timeline units: open 0–2.5, unfold 3–7, pan 5.5–10

      const aspect = w / h;
      const k = Math.min(1, (aspect * 0.86) / 0.56); // portrait screens: smaller portal so it fits the width
      const open = seg(u, 0, 2.5, ease.out3);
      const unfold = seg(u, 3, 7, ease.inOut2);
      const mask = lerp(0.56 * k * open, 2.6, unfold);
      const d = 1 - unfold;
      st.spin = (st.spin + dt * 0.18) % (Math.PI * 2); // the planet spins; the spin unwinds as it unfolds

      const un = mat.uniforms;
      un.uAspect.value = aspect;
      un.uMask.value = mask;
      un.uD.value = d;
      un.uPitch.value = lerp(-Math.PI / 2, -0.08, unfold);
      un.uZoom.value = lerp(4.2, 0.8, seg(u, 3, 7, ease.inOutExpo)) * (1 + (1 / k - 1) * d);
      un.uYaw.value = lerp(-2.2, 0, seg(u, 5.5, 10, ease.inOutSine)) + st.spin * d;
      renderer.render(quadScene, cam);

      if (ringRef.current) {
        const px = mask * h;
        ringRef.current.style.width = ringRef.current.style.height = `${px}px`;
        ringRef.current.style.opacity = String(seg(u, 0.2, 1.2) * (1 - seg(u, 3.4, 4.6)));
      }
      if (t1Ref.current) {
        t1Ref.current.style.opacity = String(seg(u, 0.6, 1.6) * (1 - seg(u, 3.6, 4.6)));
        t1Ref.current.style.transform = `translateY(${(1 - seg(u, 0.6, 1.6)) * 30 - seg(u, 3.6, 4.6) * 40}px)`;
      }
      if (t2Ref.current) {
        t2Ref.current.style.opacity = String(seg(u, 7.2, 8.2) * (1 - seg(u, 9.7, 10.4)));
        t2Ref.current.style.transform = `translateY(${(1 - seg(u, 7.2, 8.2)) * 30}px)`;
      }
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) {
        if (!renderer) build();
        last = 0;
        if (!raf) raf = requestAnimationFrame(frame);
      }
    }, { rootMargin: '120% 0px' }); // build the room while the hero is still on screen, so the portal never opens empty
    io.observe(section);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      mat?.dispose();
      disposeRoom?.();
      renderer?.dispose();
    };
  }, [scrollYProgress]);

  return (
    <section ref={sectionRef} id="step-inside" className="relative h-[360vh] px-3 sm:px-4" aria-label="Step inside a room">
      <div className="sticky top-3 h-[calc(100svh-24px)] overflow-hidden rounded-[28px] bg-[linear-gradient(170deg,#003B33,#00332C_60%,#002923)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_55%,rgba(143,227,212,0.14),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000,transparent)]" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
        <div
          ref={ringRef}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full opacity-0 [transform:translate(-50%,-50%)] shadow-[0_0_0_1.5px_rgba(143,227,212,0.75),0_0_60px_10px_rgba(0,160,140,0.35),0_0_140px_40px_rgba(143,227,212,0.15)]"
        />

        <div ref={t1Ref} className="pointer-events-none absolute inset-x-0 top-[10%] px-6 text-center text-white opacity-0">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FE3D4]">Step inside</p>
          <h2 className="mx-auto mt-4 max-w-[18ch] font-display text-[clamp(2rem,4.4vw,4rem)] font-medium leading-[1.02] [text-shadow:0_4px_40px_rgba(0,0,0,0.5)]">
            Every room is a <em className="font-normal italic text-[#8FE3D4]">world</em> of possibilities.
          </h2>
        </div>

        <div ref={t2Ref} className="pointer-events-none absolute inset-x-0 bottom-[9%] px-6 text-center text-white opacity-0">
          <h2 className="mx-auto max-w-[18ch] font-display text-[clamp(2rem,4.4vw,4rem)] font-medium leading-[1.02] [text-shadow:0_4px_40px_rgba(0,0,0,0.6)]">
            Walk through it. <em className="font-normal italic text-[#8FE3D4]">Redesign</em> it.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] text-white/85 [text-shadow:0_2px_20px_rgba(0,0,0,0.8)]">
            Every wall, floor and corner of your room — ready for Mantha AI to restyle.
          </p>
        </div>
      </div>
    </section>
  );
}
