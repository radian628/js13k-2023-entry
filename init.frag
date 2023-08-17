#version 300 es
precision highp float;

in vec2 pos;

layout(location=0) out vec4 fields;
layout(location=1) out vec4 color;

void main() {
    fields = vec4(
        sin(pos.y * 10.0) * 0.02, cos(pos.x * 10.0) * 0.02
    , 0.0, 1.0);
    color = vec4(
        sin(pos.x * 20.0) * 0.5 + 0.5,
        cos(pos.y * 20.0) * 0.5 + 0.5,
        pos.x,
        1.0
    );
}