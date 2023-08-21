#version 300 es
precision highp float;

uniform mat4 vp;
uniform mat4 m;

in vec3 i_vpos;

out vec3 f_vpos;
out vec3 original_vpos;

uniform sampler2D fields;

uniform highp int mode;

uniform float time;

void main() {
    vec4 vpos = vec4(i_vpos, 1.0);

    if ((mode == 3 || mode == 4) && i_vpos.x > 0.0) {
    vec4 params = texture(fields, m[3].xy * 0.5 + 0.5);
        vpos.xz = normalize(params.xy) + 0.15 * sin(time * 0.3) * length(params.xy);
    }

    vec4 transformed = vp * m * vpos;
    gl_Position = transformed;
    f_vpos = (m * vpos).xyz;
    original_vpos = i_vpos;
}