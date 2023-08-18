async function fetchText(href) {
  return (await await fetch(href)).text();
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
  canvas.width = 1024;
  canvas.height = 1024;
  const gl = canvas.getContext("webgl2", { antialias: false });
  console.log(gl.getExtension("EXT_color_buffer_float"));
  console.log(gl.getExtension("OES_texture_float_linear"));

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const assets = await loadAssets(gl);

  console.log(assets);

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

  let srcFb = setupFramebuffer(gl, canvas.width, canvas.height);
  let dstFb = setupFramebuffer(gl, canvas.width, canvas.height);
  let pixelDataFb = setupFramebuffer(gl, 128, 128);

  const renderLayerFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderLayerFramebuffer);
  const renderLayerTexture = setupTexture(
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
  const renderLayerDepth = setupTexture(
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
  let mousePosOnLastClick = [0, 0];

  canvas.addEventListener("mousemove", (e) => {
    mousePos = [e.offsetX, e.offsetY];
  });

  let isMouseDown = false;
  let lastButton = 0;

  canvas.addEventListener("mousedown", (e) => {
    //if (e.button === 0) {
    lastButton = e.button;
    isMouseDown = true;
    mousePosOnLastClick = [e.offsetX, e.offsetY];
    //}
    e.preventDefault();
  });
  let gustDir = [0, 0];
  document.addEventListener("mouseup", (e) => {
    isMouseDown = false;
    pendingGust = true;
    let offsetX = e.offsetX - mousePosOnLastClick[0];
    let offsetY = e.offsetY - mousePosOnLastClick[1];
    gustDir = [offsetX, offsetY];
    console.log(gustDir);
    e.preventDefault();
  });

  document.oncontextmenu = () => false;

  let lastMousePos = [0, 0];
  let time = 0;

  function drawMesh(index, x, y, scale, angle, drawMode = 0) {
    gl.uniformMatrix4fv(gl.getUniformLocation(shader3D, "vp"), false, [
      1,
      0,
      0,
      0,
      0,
      Math.cos(1.3),
      -Math.sin(1.3),
      0,
      0,
      Math.sin(1.3),
      Math.cos(1.3),
      0,
      0,
      0,
      0,
      1,
    ]);
    for (let i = 0; i < 2; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, assets[index][0]);
      gl.vertexAttribPointer(0, 3, gl.BYTE, true, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, assets[index][1]);
      gl.uniformMatrix4fv(gl.getUniformLocation(shader3D, "m"), false, [
        Math.cos(angle) * scale,
        0,
        Math.sin(angle) * scale,
        0,
        0,
        1 * scale * (i === 1 ? 0 : 1),
        0,
        0,
        -Math.sin(angle) * scale,
        0,
        Math.cos(angle) * scale,
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

  const pixelPackBuffer = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelPackBuffer);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, 128 * 128 * 4 * 4, gl.DYNAMIC_READ);

  const pixels = new Float32Array(128 * 128 * 4);

  function loop() {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFb.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pixelDataFb.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.blitFramebuffer(
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      128,
      128,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pixelDataFb.fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.FLOAT, 0);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

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
      mousePosOnLastClick[0] / window.innerWidth,
      1 - mousePosOnLastClick[1] / window.innerHeight,
    ]);
    gl.uniform2fv(gl.getUniformLocation(finalShader, "force_vec"), [
      gustDir[0] * 0.1,
      -gustDir[1] * 0.1,
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
          exploding ? 1.0 : 0
        );
        gl.uniform3f(
          gl.getUniformLocation(circleShader, "circle"),
          unit.x,
          unit.y,
          exploding ? 0.04 : 0.004
        );
        gl.uniform4f(
          gl.getUniformLocation(circleShader, "colors_change"),
          0,
          exploding ? 1 : 0.3,
          0,
          0
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
    gl.clearColor(0.7, 0.75, 0.85, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // drawMesh(1, 0.2, 0.4, 0.3, time * 0.5);
    // drawMesh(1, -0.2, -0.3, 0.2, time * 0.3);
    for (const unit of gameState.units) {
      // console.log(unit.t);
      if (meshTable[unit.t] === undefined) continue;

      const x = unit.x * 2 - 1;
      const y = unit.y * 2 - 1;
      drawMesh(meshTable[unit.t], x, y, scaleTable[unit.t], unit.r);
      switch (unit.t) {
        case UNIT_JP_SHIP:
        case UNIT_JP_BOARDING_SHIP:
          drawMesh(3, x, y, 0.2, 0, 3);
          break;
        case UNIT_MN_SHIP:
        case UNIT_MN_CANNON_SHIP:
          drawMesh(3, x, y, 0.2, 0, 4);
      }
    }
    if (isMouseDown) {
      drawMesh(
        2,
        (mousePosOnLastClick[0] / window.innerWidth) * 2 - 1,
        0 - ((mousePosOnLastClick[1] / window.innerHeight) * 2 - 1),
        (1.0 *
          Math.hypot(
            mousePos[1] - mousePosOnLastClick[1],
            mousePos[0] - mousePosOnLastClick[0]
          )) /
          window.innerWidth,
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
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);

    ///}

    gl.lastMousePos = mousePos;
  }

  return {
    canvas,
    loop,
    pixels,
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
  [UNIT_JP_SHIP]: 100,
  [UNIT_JP_BOARDING_SHIP]: 50,
  [UNIT_MN_SHIP]: 100,
  [UNIT_MN_CANNON_SHIP]: 150,
};

const meshTable = {
  [UNIT_JP_SHIP]: 0,
  [UNIT_MN_CANNON_SHIP]: 1,
  [UNIT_JP_ARROW]: 2,
  [UNIT_MN_ARROW]: 2,
  [UNIT_MN_BOMB]: 2,
};

const scaleTable = {
  [UNIT_JP_SHIP]: 0.1,
  [UNIT_MN_CANNON_SHIP]: 0.2,
  [UNIT_JP_ARROW]: 0.05,
  [UNIT_MN_ARROW]: 0.05,
  [UNIT_MN_BOMB]: 0.08,
};

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

      console.log(lvldata);
    },
  },
  {
    html: `<div id="c"></div>`,
    init: async () => {
      console.log(lvldata);
      gameState.units = lvldata[gameState.playingLevel].data.map((e) => ({
        t: e.type,
        x: (e.pos % 16) / 16,
        y: (e.pos >> 4) / 16,
        dx: 0,
        dy: 0,
        hp: hitpointsTable[e.type],
        mhp: hitpointsTable[e.type],
        r: 0,
      }));

      console.log("units", gameState.units);

      const c = $("#c");

      const { canvas, loop, pixels } = await setupFluid(c);

      game.appendChild(canvas);

      let time = 0;

      function gameLoop() {
        time++;
        // do game update
        for (const thisUnit of gameState.units) {
          for (const otherUnit of gameState.units) {
            const dir = Math.atan2(
              otherUnit.y - thisUnit.y,
              otherUnit.x - thisUnit.x
            );
            const dist = Math.hypot(
              otherUnit.y - thisUnit.y,
              otherUnit.x - thisUnit.x
            );
            const setdir = () => {
              let targetDir = dir;
              if (targetDir + Math.PI * 2 - thisUnit.r < Math.PI) {
                targetDir += Math.PI * 2;
              }
              thisUnit.r = targetDir * 0.01 + thisUnit.r * 0.99;
              if (thisUnit.r > Math.PI * 2) thisUnit.r -= Math.PI * 2;
              if (thisUnit.r < 0) thisUnit.r += Math.PI * 2;
            };
            if (thisUnit === otherUnit) continue;
            switch (thisUnit.t) {
              case UNIT_JP_SHIP:
              case UNIT_JP_BOARDING_SHIP:
                // only target enemies
                if (
                  [UNIT_MN_SHIP, UNIT_MN_CANNON_SHIP].indexOf(otherUnit.t) ===
                  -1
                )
                  break;

                setdir();

                if (time % 60 === 1) {
                  gameState.units.push({
                    t: UNIT_JP_ARROW,
                    x: thisUnit.x,
                    y: thisUnit.y,
                    dx: Math.cos(dir) * 0.8,
                    dy: Math.sin(dir) * 0.8,
                    r: dir,
                    hp: 650,
                  });
                }

                if (dist < 0.1) break;

                thisUnit.dx += Math.cos(dir) * 0.0005;
                thisUnit.dy += Math.sin(dir) * 0.0005;
                thisUnit.r = dir;
                break;
              case UNIT_MN_SHIP:
              case UNIT_MN_CANNON_SHIP:
                // only target enemies
                if (
                  [UNIT_JP_SHIP, UNIT_JP_BOARDING_SHIP].indexOf(otherUnit.t) ===
                  -1
                )
                  break;

                setdir();

                if (time % 240 === 1) {
                  gameState.units.push({
                    t: UNIT_MN_BOMB,
                    x: thisUnit.x,
                    y: thisUnit.y,
                    dx: Math.cos(dir) * 0.6,
                    dy: Math.sin(dir) * 0.6,
                    r: dir,
                    hp: 250,
                  });
                }

                if (dist < 0.1) break;

                thisUnit.dx += Math.cos(dir) * 0.0005;
                thisUnit.dy += Math.sin(dir) * 0.0005;
                break;
            }
          }

          switch (thisUnit.t) {
            case UNIT_MN_BOMB:
            case UNIT_JP_ARROW:
            case UNIT_MN_ARROW:
              thisUnit.hp--;
          }

          const pixelRef =
            (Math.floor(thisUnit.x * 128) +
              Math.floor(thisUnit.y * 128) * 128) *
            4;

          const windX = pixels[pixelRef] * 0.5;
          const windY = pixels[pixelRef + 1] * 0.5;

          const drag =
            [UNIT_JP_ARROW, UNIT_MN_ARROW, UNIT_MN_BOMB].indexOf(thisUnit.t) ===
            -1
              ? 0.015
              : 0.003;

          thisUnit.dx = thisUnit.dx * (1 - drag) + windX * drag;
          thisUnit.dy = thisUnit.dy * (1 - drag) + windY * drag;
          thisUnit.x += thisUnit.dx * 0.01;
          thisUnit.y += thisUnit.dy * 0.01;
          thisUnit.dx *= 0.997;
          thisUnit.dy *= 0.997;
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
