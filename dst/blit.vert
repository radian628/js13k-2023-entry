#version 300 es
precision highp float;in vec2 a_pos;out vec2 d;void main() {d=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0.5,1.);}