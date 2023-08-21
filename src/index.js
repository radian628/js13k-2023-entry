let fluidDomainWidth = 480;
let fluidDomainHeight = 270;
let fluidTransferBufferSize = 128;

async function fetchText(href) {
  return (await (await fetch(href)).text()).replace(
    /\/\*PERLIN\*\//g,
    await (await fetch("perlin.frag")).text()
  );
}

function checkShader(gl, shader, filename) {
  const infoLog = gl.getShaderInfoLog(shader);

  if (infoLog) {
    console.error(filename + "\n", infoLog);
  }
}

async function getShader(gl, shaderRef, shaderType, prog) {
  const src = await fetchText(shaderRef);
  const shader = gl.createShader(shaderType);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  checkShader(gl, shader, shaderRef);
  gl.attachShader(prog, shader);
  return shader;
}

async function createShaders(gl, vhref, fhref) {
  const prog = gl.createProgram();

  await getShader(gl, vhref, gl.VERTEX_SHADER, prog);
  await getShader(gl, fhref, gl.FRAGMENT_SHADER, prog);

  gl.linkProgram(prog);

  const infoLog = gl.getProgramInfoLog(prog);
  if (infoLog) console.error(vhref, fhref + "\n", infoLog);

  return prog;
}

function setupTexture(gl, width, height, internalformat, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalformat,
    width,
    height,
    0,
    format,
    type,
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
  const fields = setupTexture(gl, width, height, gl.RGBA32F, gl.RGBA, gl.FLOAT);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    fields,
    0
  );
  const color = setupTexture(gl, width, height, gl.RGBA32F, gl.RGBA, gl.FLOAT);
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

async function loadAssets(gl) {
  const assets = new Int8Array(await (await fetch("assets")).arrayBuffer());
  console.log("assets", assets);
  const len = assets[0];
  let idx = 1;
  const buffers = [];
  for (let i = 0; i < len; i++) {
    let vertexCount = assets[idx++];
    if (vertexCount < 0) vertexCount = 256 + vertexCount;
    const vbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      assets.slice(idx, idx + vertexCount * 3),
      gl.STATIC_DRAW
    );
    console.log(
      "vertices",
      Array.from(assets.slice(idx, idx + vertexCount * 3)).map((e) => e / 128)
    );
    idx += vertexCount * 3;
    let indexCount = assets[idx++];
    if (indexCount < 0) indexCount = 256 + indexCount;
    indexCount *= 3;
    const ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      assets.slice(idx, idx + indexCount),
      gl.STATIC_DRAW
    );
    console.log("indices", assets.slice(idx, idx + indexCount));
    idx += indexCount;
    buffers.push([vbuf, ibuf, indexCount]);
  }
  return buffers;
}

async function setupFluid() {
  const canvas = document.createElement("canvas");
  canvas.id = "fluid-canvas";
  canvas.width = 1920;
  canvas.height = 1080;
  const gl = canvas.getContext("webgl2", { antialias: false });
  console.log(gl.getExtension("EXT_color_buffer_float"));
  console.log(gl.getExtension("OES_texture_float_linear"));

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const assets = await loadAssets(gl);

  const shader3D = await createShaders(gl, "3d.vert", "3d.frag");
  const [
    advectShader,
    divergenceShader,
    pressureShader,
    finalShader,
    blitShader,
    initShader,
    displayShader,
    circleShader,
  ] = await Promise.all(
    [
      "advect.frag",
      "divergence.frag",
      "pressure.frag",
      "final.frag",
      "blit.frag",
      "init.frag",
      "display.frag",
      "circle.frag",
    ].map((fshader) => createShaders(gl, "blit.vert", fshader))
  );

  let srcFb = setupFramebuffer(gl, fluidDomainWidth, fluidDomainHeight);
  let dstFb = setupFramebuffer(gl, fluidDomainWidth, fluidDomainHeight);
  let pixelDataFb = setupFramebuffer(
    gl,
    fluidTransferBufferSize,
    fluidTransferBufferSize
  );

  let renderLayerFramebuffer;
  let renderLayerDepth;
  let renderLayerTexture;

  const resize = () => {
    canvas.width = Math.min(window.innerWidth, (window.innerHeight * 16) / 9);
    canvas.height = (canvas.width * 9) / 16;
    renderLayerFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderLayerFramebuffer);
    renderLayerTexture = setupTexture(
      gl,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      renderLayerTexture,
      0
    );
    renderLayerDepth = setupTexture(
      gl,
      canvas.width,
      canvas.height,
      gl.DEPTH_COMPONENT16,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_SHORT
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      renderLayerDepth,
      0
    );
  };

  window.addEventListener("resize", resize);
  resize();

  const buf = createSquareBuffer(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, srcFb.fb);
  gl.viewport(0, 0, fluidDomainWidth, fluidDomainHeight);

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
  let mousePosOnLastClick = [0, 0];

  canvas.addEventListener("mousemove", (e) => {
    mousePos = [e.offsetX / canvas.width, e.offsetY / canvas.height];
  });

  let isMouseDown = false;
  let lastButton = 0;

  canvas.addEventListener("mousedown", (e) => {
    //if (e.button === 0) {
    lastButton = e.button;
    isMouseDown = true;
    mousePosOnLastClick = [e.offsetX / canvas.width, e.offsetY / canvas.height];
    //}
    e.preventDefault();
  });
  let gustDir = [0, 0];
  document.addEventListener("mouseup", (e) => {
    isMouseDown = false;
    pendingGust = true;
    let offsetX = e.offsetX / canvas.width - mousePosOnLastClick[0];
    let offsetY = e.offsetY / canvas.height - mousePosOnLastClick[1];
    gustDir = [offsetX, offsetY];
    console.log(gustDir);
    e.preventDefault();
  });

  document.oncontextmenu = () => false;

  let lastMousePos = [0, 0];
  let time = 0;

  function drawMesh(index, x, y, scale, angle, drawMode = 0) {
    if (typeof scale === "number") scale = [scale, scale, scale];
    gl.uniformMatrix4fv(gl.getUniformLocation(shader3D, "vp"), false, [
      (2 * 9) / 16,
      0,
      0,
      0,
      0,
      Math.cos(1.3) * 1,
      -Math.sin(1.3) * 1,
      0,
      0,
      Math.sin(1.3) * 2,
      Math.cos(1.3) * 2,
      0,
      -1, // x translation
      -1, // y translation
      0, // z translation
      1,
    ]);
    for (let i = 0; i < 2; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, assets[index][0]);
      gl.vertexAttribPointer(0, 3, gl.BYTE, true, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, assets[index][1]);
      gl.uniformMatrix4fv(gl.getUniformLocation(shader3D, "m"), false, [
        Math.cos(angle) * scale[0],
        0,
        Math.sin(angle) * scale[0],
        0,
        0,
        1 * scale[1] * (i === 1 ? 0 : 1),
        0,
        0,
        -Math.sin(angle) * scale[2],
        0,
        Math.cos(angle) * scale[2],
        0,
        x,
        0,
        y,
        1,
      ]);
      gl.uniform1i(
        gl.getUniformLocation(shader3D, "mode"),
        i === 0 ? drawMode : 1
      );
      gl.drawElements(gl.TRIANGLES, assets[index][2], gl.UNSIGNED_BYTE, 0);
    }
  }

  function drawWrapMesh(index, x, y, ...params) {
    for (let dx = -16 / 9; dx < 2; dx += 16 / 9) {
      for (let dy = -1; dy < 2; dy++) {
        const factor = (n) => -Math.abs(n - 0.5) + 0.7;
        if (Math.min(factor(((x + dx) * 9) / 16), factor(y + dy)) < 0) continue;
        drawMesh(index, x + dx, y + dy, ...params);
      }
    }
  }

  const pixelPackBuffer = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelPackBuffer);
  gl.bufferData(
    gl.PIXEL_PACK_BUFFER,
    fluidTransferBufferSize * fluidTransferBufferSize * 4 * 4,
    gl.DYNAMIC_READ
  );
  const colorPixelPackBuffer = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, colorPixelPackBuffer);
  gl.bufferData(
    gl.PIXEL_PACK_BUFFER,
    fluidTransferBufferSize * fluidTransferBufferSize * 4 * 4,
    gl.DYNAMIC_READ
  );

  const pixels = new Float32Array(
    fluidTransferBufferSize * fluidTransferBufferSize * 4
  );
  const colorPixels = new Float32Array(
    fluidTransferBufferSize * fluidTransferBufferSize * 4
  );

  function loop() {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFb.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pixelDataFb.fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.blitFramebuffer(
      0,
      0,
      fluidDomainWidth,
      fluidDomainHeight,
      0,
      0,
      fluidTransferBufferSize,
      fluidTransferBufferSize,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR
    );
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
    gl.blitFramebuffer(
      0,
      0,
      fluidDomainWidth,
      fluidDomainHeight,
      0,
      0,
      fluidTransferBufferSize,
      fluidTransferBufferSize,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pixelDataFb.fb);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelPackBuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(
      0,
      0,
      fluidTransferBufferSize,
      fluidTransferBufferSize,
      gl.RGBA,
      gl.FLOAT,
      0
    );

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, colorPixelPackBuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(
      0,
      0,
      fluidTransferBufferSize,
      fluidTransferBufferSize,
      gl.RGBA,
      gl.FLOAT,
      0
    );
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    rebindRenderTargets();

    gl.viewport(0, 0, fluidDomainWidth, fluidDomainHeight);

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
    for (let i = 0; i < 20; i++) {
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
    gl.uniform1i(
      gl.getUniformLocation(finalShader, "gust_type"),
      lastButton === 2 ? 1 : 0
    );
    gl.uniform2fv(gl.getUniformLocation(finalShader, "force_pos"), [
      mousePosOnLastClick[0],
      1 - mousePosOnLastClick[1],
    ]);
    let gustDirMag = Math.hypot(...gustDir);
    if (gustDirMag == 0) gustDirMag = 1;
    gl.uniform2fv(gl.getUniformLocation(finalShader, "force_vec"), [
      (gustDir[0] / gustDirMag) * 2000 * Math.min(gustDirMag, 0.25),
      (-gustDir[1] / gustDirMag) * 2000 * Math.min(gustDirMag, 0.25),
    ]);
    gustDir = [0, 0];
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    swapRenderTargets();

    // bomb smoke
    gl.useProgram(circleShader);
    for (const unit of gameState.units) {
      if (unit.t === UNIT_MN_BOMB) {
        const exploding = unit.hp === 1;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcFb.fields);
        gl.uniform1i(gl.getUniformLocation(circleShader, "fields"), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, srcFb.color);
        gl.uniform1i(gl.getUniformLocation(circleShader, "colors"), 1);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

        gl.uniform1f(
          gl.getUniformLocation(circleShader, "force_factor"),
          exploding ? 2.0 : 0
        );
        gl.uniform2f(
          gl.getUniformLocation(circleShader, "circle"),
          (unit.x * 9) / 16,
          unit.y
        );
        gl.uniform4f(
          gl.getUniformLocation(circleShader, "radii"),
          0,
          exploding ? 0.03 : 0.003,
          0,
          exploding ? 0.08 : 0
        );
        gl.uniform4f(
          gl.getUniformLocation(circleShader, "colors_change"),
          0,
          exploding ? 4 : 0.3,
          0,
          exploding ? 2 : 0
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        swapRenderTargets();
      }
    }

    // test 3D
    gl.useProgram(shader3D);
    gl.uniform1i(gl.getUniformLocation(shader3D, "fields"), 0);
    gl.uniform1f(gl.getUniformLocation(shader3D, "time"), time);
    gl.enable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, renderLayerFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.7, 0.75, 0.85, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const unit of gameState.units) {
      if (meshTable[unit.t] === undefined) continue;

      const x = unit.x;
      const y = unit.y;
      drawWrapMesh(meshTable[unit.t], x, y, scaleTable[unit.t], unit.r);
      switch (unit.t) {
        case UNIT_JP_SHIP:
        case UNIT_JP_BOARDING_SHIP:
          drawWrapMesh(3, x, y, 0.1, 0, 3);
          break;
        case UNIT_MN_SHIP:
        case UNIT_MN_CANNON_SHIP:
          drawWrapMesh(3, x, y, 0.1, 0, 4);
      }
      if (unit.mhp) {
        drawWrapMesh(
          4,
          x,
          y - 0.08,
          [(unit.hp / unit.mhp) * 0.06, 0.1, 0.04],
          0,
          5
        );
      }
    }
    if (isMouseDown) {
      drawMesh(
        2,
        (mousePosOnLastClick[0] * 16) / 9,
        1 - mousePosOnLastClick[1],
        2.0 *
          Math.min(
            Math.hypot(
              -(mousePos[1] - mousePosOnLastClick[1]),
              mousePos[0] - mousePosOnLastClick[0]
            ),
            0.25
          ),
        Math.atan2(
          -(mousePos[1] - mousePosOnLastClick[1]),
          mousePos[0] - mousePosOnLastClick[0]
        ),
        2
      );
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);

    // render to canvas
    gl.useProgram(displayShader);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcFb.color);
    gl.uniform1i(gl.getUniformLocation(displayShader, "atmosphere"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, renderLayerTexture);
    gl.uniform1i(gl.getUniformLocation(displayShader, "render_layer"), 1);
    gl.uniform2fv(gl.getUniformLocation(displayShader, "rand_noise"), [
      Math.random(),
      Math.random(),
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    time++;

    //if (time < 0.01) {
    // gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pixelDataFb.fb);
    // gl.readBuffer(gl.COLOR_ATTACHMENT1);
    // gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.FLOAT, pixels);

    const max = gl.getParameter(gl.MAX_CLIENT_WAIT_TIMEOUT_WEBGL);
    gl.clientWaitSync(fence, gl.SYNC_FLUSH_COMMANDS_BIT, max);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelPackBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, colorPixelPackBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, colorPixels);

    ///}

    gl.viewport(0, 0, fluidDomainWidth, fluidDomainHeight);
    gl.lastMousePos = mousePos;
  }

  return {
    canvas,
    loop,
    pixels,
    colorPixels,
  };
}

let gameState = {
  // 0 = menu, 1 = level_select, 2 = game, 3 = complete
  screen: 0,
  playingLevel: 0,
  /*
    {
      t: number (type)
      x: number 
      y: number
      hp: number (hitpoints)
      mhp: number (max hitpoints)
      r: rotation
    }
  */
  units: [],
};

const UNIT_JP_SHIP = 0;
const UNIT_JP_BOARDING_SHIP = 1;
const UNIT_MN_SHIP = 2;
const UNIT_MN_CANNON_SHIP = 3;
const UNIT_JP_ARROW = 4;
const UNIT_MN_ARROW = 5;
const UNIT_MN_BOMB = 6;

const hitpointsTable = {
  [UNIT_JP_SHIP]: 1000,
  [UNIT_JP_BOARDING_SHIP]: 500,
  [UNIT_MN_SHIP]: 1000,
  [UNIT_MN_CANNON_SHIP]: 1500,
};

const meshTable = {
  [UNIT_JP_SHIP]: 0,
  [UNIT_JP_BOARDING_SHIP]: 0,
  [UNIT_MN_SHIP]: 0,
  [UNIT_MN_CANNON_SHIP]: 1,
  [UNIT_JP_ARROW]: 2,
  [UNIT_MN_ARROW]: 2,
};

const scaleTable = {
  [UNIT_JP_SHIP]: 0.035,
  [UNIT_JP_BOARDING_SHIP]: 0.02,
  [UNIT_MN_SHIP]: 0.035,
  [UNIT_MN_CANNON_SHIP]: 0.05,
  [UNIT_JP_ARROW]: 0.025,
  [UNIT_MN_ARROW]: 0.025,
  [UNIT_MN_BOMB]: 0.04,
};

function isJapaneseShip(id) {
  return id === UNIT_JP_SHIP || id === UNIT_JP_BOARDING_SHIP;
}

function isShip(id) {
  return (
    isJapaneseShip(id) || id === UNIT_MN_SHIP || id === UNIT_MN_CANNON_SHIP
  );
}

const $ = (...args) => document.querySelector(...args);

let lvldata = [];

let screens = [
  {
    html: `<h1>Game Name Here</h1>
    <p>Your goal is to help the Japanese defeat the Mongols in their 
    invasion something something something about the divine wind etc etc etc.
    i havent finished the placeholder text lol</p>
    <button id="s">Start</button>`,
    init: () => {
      const startButton = $("#s");
      startButton.onclick = () => {
        gameState.screen = 1;
        updateGame();
      };
    },
  },
  {
    html: `<h1>Level Select</h1>
    <p>Select a level below:</p>
    <div id="l"></div>`,
    init: async () => {
      const levelSelect = $("#l");
      const levels = new Uint8Array(
        await (await fetch("levels")).arrayBuffer()
      );
      let len = levels[0];
      let idx = 1;
      for (let i = 0; i < len; i++) {
        let namelen = levels[idx++];
        let name = new TextDecoder().decode(
          levels.slice(idx, (idx += namelen))
        );
        let datalen = levels[idx++];
        let data = [];
        for (let i = 0; i < datalen; i++) {
          data.push({
            pos: levels[idx++],
            type: levels[idx++],
          });
        }
        lvldata.push({ name, data });
      }

      let levelIndex = 0;
      for (const lvl of lvldata) {
        let myLevelIndex = levelIndex;
        const levelBtn = document.createElement("button");
        levelBtn.innerHTML = `<div class="lvl"><h2>${lvl.name}</h2></div>`;
        levelSelect.appendChild(levelBtn);
        levelBtn.onclick = () => {
          gameState.screen = 2;
          gameState.playingLevel = myLevelIndex;
          updateGame();
        };
        levelIndex++;
      }
    },
  },
  {
    html: `<div id="c"></div>`,
    init: async () => {
      gameState.units = lvldata[gameState.playingLevel].data.map((e) => ({
        t: e.type,
        x: ((e.pos % 16) / 16) * (16 / 9),
        y: (e.pos >> 4) / 16,
        dx: 0,
        dy: 0,
        hp: hitpointsTable[e.type],
        mhp: hitpointsTable[e.type],
        r: 0,
        timer: 0,
      }));

      const c = $("#c");

      const { canvas, loop, pixels, colorPixels } = await setupFluid(c);

      c.appendChild(canvas);

      let time = 0;

      function gameLoop() {
        time++;

        const getDirAndDist = (u1, u2) => {
          const dir = Math.atan2(u2.y - u1.y, u2.x - u1.x);
          const dist = Math.hypot(u2.y - u1.y, u2.x - u1.x);
          return { dir, dist };
        };

        // do game update
        for (const thisUnit of gameState.units) {
          function getPixelRef(x, y) {
            return (
              (Math.floor((x * fluidTransferBufferSize * 9) / 16) +
                Math.floor(y * fluidTransferBufferSize) *
                  fluidTransferBufferSize) *
              4
            );
          }

          const distToThisUnit = (u) =>
            Math.hypot(u.x - thisUnit.x, u.y - thisUnit.y);

          // get the closest unit to this unit of a given type
          // used for enemy targeting
          const closestUnit = (validTypes) =>
            gameState.units
              .filter((u) => validTypes.indexOf(u.t) != -1)
              .filter((u) => {
                // boarding ships aren't affected by smoke
                if (thisUnit.type === UNIT_JP_BOARDING_SHIP) return true;

                let x = thisUnit.x;
                let y = thisUnit.y;

                const STEPS = 1000;

                let dx = (u.x - thisUnit.x) / STEPS;
                let dy = (u.y - thisUnit.y) / STEPS;
                let step = Math.hypot(dx, dy);

                // do a raycast through the smoke
                let smokeCover = 0;

                let denseSmokePatches = 0;

                for (let i = 0; i < STEPS; i++) {
                  const ref = getPixelRef(
                    x + Math.random() * 0.0,
                    y + Math.random() * 0.0
                  );
                  const smoke = colorPixels[ref + 1];

                  // dense smoke = auto fail
                  if (smoke > 0.5) denseSmokePatches++;

                  smokeCover += smoke * step;

                  x += dx;
                  y += dy;
                }

                console.log(smokeCover);

                return smokeCover < 0.2 && denseSmokePatches < STEPS * 0.1;
              })
              .sort((a, b) => distToThisUnit(a) - distToThisUnit(b))[0];

          // rotate ships toward their targets
          const setdir = (dir) => {
            let targetDir = dir;
            if (targetDir + Math.PI * 2 - thisUnit.r < Math.PI) {
              targetDir += Math.PI * 2;
            }
            thisUnit.r = targetDir * 0.01 + thisUnit.r * 0.99;
            if (thisUnit.r > Math.PI * 2) thisUnit.r -= Math.PI * 2;
            if (thisUnit.r < 0) thisUnit.r += Math.PI * 2;
          };

          // the target/enemy unit of a ship
          let otherUnit = closestUnit(
            isJapaneseShip(thisUnit.t)
              ? [UNIT_MN_SHIP, UNIT_MN_CANNON_SHIP]
              : [UNIT_JP_SHIP, UNIT_JP_BOARDING_SHIP]
          );
          const { dir, dist } = otherUnit
            ? getDirAndDist(thisUnit, otherUnit)
            : { dir: 0, dist: 0 };

          if (isShip(thisUnit.t)) {
            setdir(dir);
            thisUnit.timer--;
          }

          const pixelRef = getPixelRef(thisUnit.x, thisUnit.y);

          // targeting and attacking
          switch (thisUnit.t) {
            case UNIT_MN_SHIP:
            case UNIT_JP_SHIP:
              // no target --> don't do anything
              if (!otherUnit) break;

              if (thisUnit.timer < 0 && dist < 0.7) {
                gameState.units.push({
                  t:
                    thisUnit.t === UNIT_JP_SHIP ? UNIT_JP_ARROW : UNIT_MN_ARROW,
                  x: thisUnit.x,
                  y: thisUnit.y,
                  dx: Math.cos(dir) * 0.8,
                  dy: Math.sin(dir) * 0.8,
                  r: dir,
                  hp: 650,
                });
                thisUnit.timer = 120;
              }

              if (dist < 0.1) break;

              thisUnit.dx += Math.cos(dir) * 0.0005;
              thisUnit.dy += Math.sin(dir) * 0.0005;
              thisUnit.r = dir;
              break;

            case UNIT_JP_BOARDING_SHIP:
              // no target --> don't do anything
              if (!otherUnit) break;

              if (dist < 0.08) {
                otherUnit.hp -= 1.5;
              }

              if (dist < 0.05) {
                break;
              }

              thisUnit.dx += Math.cos(dir) * 0.0005;
              thisUnit.dy += Math.sin(dir) * 0.0005;
              thisUnit.r = dir;
              break;
            // mn units
            case UNIT_MN_CANNON_SHIP: {
              // no target --> don't do anything
              if (!otherUnit) break;

              const { dir, dist } = getDirAndDist(thisUnit, otherUnit);

              if (thisUnit.timer < 0 && dist < 0.55) {
                gameState.units.push({
                  t: UNIT_MN_BOMB,
                  x: thisUnit.x,
                  y: thisUnit.y,
                  dx: Math.cos(dir) * 0.4,
                  dy: Math.sin(dir) * 0.4,
                  r: dir,
                  hp: 250,
                });
                thisUnit.timer = 360;
              }

              if (dist < 0.1) break;

              thisUnit.dx += Math.cos(dir) * 0.0005;
              thisUnit.dy += Math.sin(dir) * 0.0005;
              break;
            }
          }

          // handle collisions and projectiles
          for (const otherUnit of gameState.units) {
            const { dir, dist } = getDirAndDist(thisUnit, otherUnit);
            if (thisUnit === otherUnit) continue;
            switch (thisUnit.t) {
              case UNIT_JP_ARROW:
                if (
                  [UNIT_MN_SHIP, UNIT_MN_CANNON_SHIP].indexOf(otherUnit.t) ===
                  -1
                )
                  break;

                if (dist < 0.03 && thisUnit.hp > 1) {
                  thisUnit.hp = 1;
                  otherUnit.hp -= 10;
                }
                break;
              case UNIT_MN_ARROW:
              case UNIT_MN_BOMB:
                if (
                  [UNIT_JP_SHIP, UNIT_JP_BOARDING_SHIP].indexOf(otherUnit.t) ===
                  -1
                )
                  break;

                if (dist < 0.03 && thisUnit.hp > 2) {
                  thisUnit.hp = 2;
                  otherUnit.hp -= thisUnit.t === UNIT_MN_ARROW ? 10 : 0;
                }

                break;
            }
          }

          // kill projectiles
          switch (thisUnit.t) {
            case UNIT_MN_BOMB:
            case UNIT_JP_ARROW:
            case UNIT_MN_ARROW:
              thisUnit.hp--;
          }

          const mod = (x, n) => x - Math.floor(x / n) * n;

          const explosion = colorPixels[pixelRef + 3];

          const windX = pixels[pixelRef] * 1.0;
          const windY = pixels[pixelRef + 1] * 1.0;

          const drag =
            [UNIT_JP_ARROW, UNIT_MN_ARROW, UNIT_MN_BOMB].indexOf(thisUnit.t) ===
            -1
              ? 0.007
              : 0.003;

          if (
            [
              UNIT_JP_SHIP,
              UNIT_JP_BOARDING_SHIP,
              UNIT_MN_SHIP,
              UNIT_MN_CANNON_SHIP,
            ].indexOf(thisUnit.t) != -1
          ) {
            thisUnit.hp -= 1 * Math.max(explosion - 0.1, 0);
          }

          thisUnit.dx = thisUnit.dx * (1 - drag) + windX * drag;
          thisUnit.dy = thisUnit.dy * (1 - drag) + windY * drag;
          thisUnit.x += thisUnit.dx * 0.01;
          thisUnit.y += thisUnit.dy * 0.01;
          thisUnit.dx *= 0.997;
          thisUnit.dy *= 0.997;

          thisUnit.x = mod(thisUnit.x, 16 / 9);
          thisUnit.y = mod(thisUnit.y, 1);
        }
        // do graphics update
        loop();

        gameState.units = gameState.units.filter((u) => u.hp > 0);

        requestAnimationFrame(gameLoop);
      }
      gameLoop();
    },
  },
];

async function updateGame() {
  const game = $("#game");

  const screen = screens[gameState.screen];

  game.innerHTML = screen.html;
  screen.init();
}

updateGame();

window.gameState = gameState;
