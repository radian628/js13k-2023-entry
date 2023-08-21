#version 300 es
precision highp float;

in vec2 pos;

layout(location=0) out vec4 fields;
layout(location=1) out vec4 color;

/*PERLIN*/

void main() {
    fields = vec4(
        0.0, 0.0
    , 0.0, 1.0);
    color = vec4(
        pow(perlin(8.0 * pos) * 0.5 + 0.7, 3.0),
        0.0, 0.0,
        0.0
    );
}