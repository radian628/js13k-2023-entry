#version 300 es
precision highp float;

in vec2 pos;

// .x and .y = velocity
// .z = divergence
// .w = pressure 
uniform sampler2D fields;

out vec4 pressured_fields;

vec4 vel_at(vec2 offset) {
    float delta_pos = 1.0 / float(textureSize(fields, 0).x);
    return texture(fields, pos + offset * delta_pos);
}

void main() {
    vec4 params = texture(fields, pos);
    vec2 pressure = params.xy;
    pressured_fields = vec4(params.xyz, (params.z
        + vel_at(vec2(2.0,0.0)).w
        + vel_at(vec2(-2.0,0.0)).w
        + vel_at(vec2(0.0,2.0)).w
        + vel_at(vec2(0.0,-2.0)).w) / 4.0);
}