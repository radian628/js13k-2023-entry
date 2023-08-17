#version 300 es
precision highp float;

in vec2 pos;

// .x and .y = velocity
// .z = divergence
// .w = pressure 
uniform sampler2D fields;

uniform sampler2D color;

layout(location=0) out vec4 final_fields;
layout(location=1) out vec4 advected_color;

vec4 vel_at(vec2 offset) {
    float delta_pos = 1.0 / float(textureSize(fields, 0).x);
    return texture(fields, pos + offset * delta_pos);
}

const float delta_t = 0.01;

const float epsilon = 1.0 / 512.0;
const float rho = 1.0;

uniform vec2 force_pos;
uniform vec2 force_vec;

void main() {
    vec4 params = texture(fields, pos);

    float force_factor = 20.0 * max(0.0, 0.05 - dot(force_pos - pos, force_pos - pos));

    vec2 vel = params.xy - delta_t / (2.0 * rho * epsilon)
        * vec2(
            vel_at(vec2(1.0, 0.0)).w - vel_at(vec2(-1.0, 0.0)).w,
            vel_at(vec2(0.0, 1.0)).w - vel_at(vec2(0.0, -1.0)).w
        ) + force_factor * force_vec * delta_t;

    vel *= pow(0.9, delta_t);

    vec4 advected_color_temp = texture(color, pos - vel * delta_t);

    advected_color = advected_color_temp * pow(0.8, delta_t)
         + vec4(vec3(10.0), 0.0) * pow(force_factor, 5.0) * delta_t * abs(sign(force_vec)).x;

    final_fields = 
        vec4(
            vel.xy,
            params.zw
        );
}