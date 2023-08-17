async function fetchText(href) {
  return (await await fetch(href)).text();
}

function checkShader(gl, shader, filename) {
  const infoLog = gl.getShaderInfoLog(shader);

  if (infoLog) {
    console.error(filename + "\n", infoLog);
  }
}

async function createShaders(gl, vhref, fhref) {
  const vsrc = await fetchText(vhref);
  const fsrc = await fetchText(fhref);

  const vshader = gl.createShader(gl.VERTEX_SHADER);
  const fshader = gl.createShader(gl.FRAGMENT_SHADER);

  gl.shaderSource(vshader, vsrc);
  gl.shaderSource(fshader, fsrc);

  gl.compileShader(vshader);
  gl.compileShader(fshader);
  checkShader(gl, vshader, vhref);
  checkShader(gl, fshader, fhref);

  const prog = gl.createProgram();

  gl.attachShader(prog, vshader);
  gl.attachShader(prog, fshader);

  gl.linkProgram(prog);

  const infoLog = gl.getProgramInfoLog(prog);
  if (infoLog) console.error(vhref, fhref + "\n", infoLog);

  return prog;
}

function setupTexture(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function setupFramebuffer(gl, width, height) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const fields = setupTexture(gl, width, height);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    fields,
    0
  );
  const color = setupTexture(gl, width, height);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT1,
    gl.TEXTURE_2D,
    color,
    0
  );
  return {
    fb,
    fields,
    color,
  };
}

function createSquareBuffer(gl) {
  const squareData = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0,

    1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
  ]);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, squareData, gl.STATIC_DRAW);
  return buf;
}

async function setupFluid() {
  const c = document.getElementById("fluid-canvas");
  const gl = c.getContext("webgl2", { antialias: false });
  console.log(gl.getExtension("EXT_color_buffer_float"));
  console.log(gl.getExtension("OES_texture_float_linear"));

  gl.viewport(0, 0, c.width, c.height);
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const advectShader = await createShaders(gl, "blit.vert", "advect.frag");
  const divergenceShader = await createShaders(
    gl,
    "blit.vert",
    "divergence.frag"
  );
  const pressureShader = await createShaders(gl, "blit.vert", "pressure.frag");
  const finalShader = await createShaders(gl, "blit.vert", "final.frag");
  const blitShader = await createShaders(gl, "blit.vert", "blit.frag");
  const initShader = await createShaders(gl, "blit.vert", "init.frag");

  let srcFb = setupFramebuffer(gl, c.width, c.height);
  let dstFb = setupFramebuffer(gl, c.width, c.height);

  const buf = createSquareBuffer(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, srcFb.fb);

  gl.bindBuffer(gl.ARRAY_BUFFER, buf);

  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.useProgram(initShader);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  function rebindRenderTargets() {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFb.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcFb.fields);
  }

  function swapRenderTargets() {
    [srcFb, dstFb] = [dstFb, srcFb];
    rebindRenderTargets();
  }

  let mousePos = [0, 0];

  c.addEventListener("mousemove", (e) => {
    mousePos = [e.offsetX, e.offsetY];
  });

  let isMouseDown = false;

  c.addEventListener("mousedown", (e) => {
    if (e.button === 0) isMouseDown = true;
  });
  document.addEventListener("mouseup", (e) => {
    isMouseDown = false;
  });

  let lastMousePos = [0, 0];
  loop();

  function loop() {
    rebindRenderTargets();

    // advect
    gl.useProgram(advectShader);
    gl.uniform1i(gl.getUniformLocation(advectShader, "fields"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    swapRenderTargets();

    // divergence
    gl.useProgram(divergenceShader);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    swapRenderTargets();

    gl.useProgram(pressureShader);
    // pressure
    for (let i = 0; i < 40; i++) {
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      swapRenderTargets();
    }

    // final shader
    gl.useProgram(finalShader);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.uniform1i(gl.getUniformLocation(finalShader, "fields"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, srcFb.color);
    gl.uniform1i(gl.getUniformLocation(finalShader, "color"), 1);
    gl.uniform2fv(gl.getUniformLocation(finalShader, "force_pos"), [
      mousePos[0] / c.width,
      1 - mousePos[1] / c.height,
    ]);
    gl.uniform2fv(
      gl.getUniformLocation(finalShader, "force_vec"),
      isMouseDown
        ? [
            ((mousePos[0] - lastMousePos[0]) / c.width) * 200,
            ((mousePos[1] - lastMousePos[1]) / c.height) * -200,
          ]
        : [0, 0]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    swapRenderTargets();

    gl.useProgram(blitShader);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcFb.color);
    gl.uniform1i(gl.getUniformLocation(blitShader, "fields"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    lastMousePos = mousePos;
    requestAnimationFrame(loop);
  }
}

setupFluid();
