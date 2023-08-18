#version 300 es
precision highp float;in vec2 d;uniform sampler2D tex;out vec4 data;void main() {data=vec4(texture(tex,d).xyz,1.);}