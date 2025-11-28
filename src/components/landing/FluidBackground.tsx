import React, { useEffect, useRef } from 'react';

const FluidBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Grainy Fog Shader
    const fragmentShaderSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;

      // Random / Noise functions
      float random (in vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);
      }

      // Value Noise 
      float noise (in vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);

          // Cubic Hermite Curve
          f = f*f*(3.0-2.0*f);

          float a = random(i);
          float b = random(i + vec2(1.0, 0.0));
          float c = random(i + vec2(0.0, 1.0));
          float d = random(i + vec2(1.0, 1.0));

          return mix(a, b, f.x) +
                  (c - a)* f.y * (1.0 - f.x) +
                  (d - b) * f.x * f.y;
      }

      // Fractal Brownian Motion (Fog)
      #define OCTAVES 5
      float fbm (in vec2 st) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 0.0;
          
          // Loop of octaves
          for (int i = 0; i < OCTAVES; i++) {
              value += amplitude * noise(st);
              st *= 2.0;
              amplitude *= 0.5;
          }
          return value;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv.x *= u_resolution.x / u_resolution.y;
        
        float time = u_time * 0.05; // Slow drift
        
        // 1. Create Fog Pattern
        vec2 q = vec2(0.);
        q.x = fbm( uv + 0.00 * time);
        q.y = fbm( uv + vec2(1.0));

        vec2 r = vec2(0.);
        r.x = fbm( uv + 1.0 * q + vec2(1.7,9.2)+ 0.15*time );
        r.y = fbm( uv + 1.0 * q + vec2(8.3,2.8)+ 0.126*time);

        float f = fbm(uv + r);

        // 2. Color Grading (Dark + Brand Orange Tint)
        // Base dark color
        vec3 color = vec3(0.03, 0.03, 0.03);
        
        // Fog colors
        vec3 fogColor1 = vec3(0.15, 0.15, 0.15); // Grey mist
        vec3 fogColor2 = vec3(0.2, 0.1, 0.05);   // Subtle orange dust
        
        // Mix based on noise
        color = mix(color, fogColor1, clamp(f*f*2.0, 0.0, 1.0));
        color = mix(color, fogColor2, clamp(length(q), 0.0, 1.0));

        // 3. Add Heavy Film Grain
        float grain = random(uv * time) * 0.12; // Dynamic grain
        // Static grain texture
        float staticGrain = random(gl_FragCoord.xy) * 0.06; 
        
        color += grain + staticGrain;

        // 4. Vignette
        float dist = distance(gl_FragCoord.xy / u_resolution.xy, vec2(0.5));
        color *= (1.1 - dist * 0.6);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1, -1,
      1, -1,
      -1,  1,
      -1,  1,
      1, -1,
      1,  1,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, "u_time");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");

    let startTime = Date.now();
    let animationFrameId: number;

    const render = () => {
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      }

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, (Date.now() - startTime) * 0.001);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-60"
    />
  );
};

export default FluidBackground;
