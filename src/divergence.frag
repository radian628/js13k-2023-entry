#version 300 es

precision highp float;

in vec2 pos;

// .x and .y = velocity
// .z = divergence
// .w = pressure 
uniform sampler2D fields;

const float delta_t = 0.01;

const float epsilon = 1.0 / 512.0;
const float rho = 1.0;

out vec4 diverged_fields;

vec4 vel_at(vec2 offset) {
    float delta_pos = 1.0 / float(textureSize(fields, 0).x);
    return texture(fields, pos + offset * delta_pos);
}

void main() {
    vec4 params = texture(fields, pos);
    vec2 vel = params.xy;
    diverged_fields = vec4(
        vel,
        -2.0 * epsilon * rho / delta_t
        * (vel_at(vec2(1.0, 0.0)).x - vel_at(vec2(-1.0, 0.0)).x
            + vel_at(vec2(0.0, 1.0)).y - vel_at(vec2(0.0, -1.0)).y
        ), 0.0);
}