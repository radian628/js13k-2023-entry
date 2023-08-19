#version 300 es
precision highp float;

in vec2 pos;

layout(location=0) out vec4 fields;
layout(location=1) out vec4 color;

void main() {
    fields = vec4(
        0.0, 0.0
    , 0.0, 1.0);
    color = vec4(
        sin(pos.y * 20.0) * 0.45 + cos(pos.x * 14.0) * 0.45,
        0.0, 0.0,
        0.0
    );
}