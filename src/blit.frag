#version 300 es
precision highp float;

in vec2 pos;

uniform sampler2D tex;

out vec4 data;

void main() {
    data = vec4(texture(tex, pos).xyz, 1.0);
}