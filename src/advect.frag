#version 300 es

precision highp float;

in vec2 pos;

// .x and .y = velocity
// .z = divergence
// .w = pressure 
uniform sampler2D fields;

const float delta_t = 0.01;

out vec4 advected_fields;

void main() {
    vec4 params = texture(fields, pos);
    vec2 vel = params.xy;
    
    // advect through itself
    vec2 advected_vel = texture(fields, pos - vel * delta_t).xy;

    // advected_fields = params;

    advected_fields = vec4(advected_vel, params.zw);
}