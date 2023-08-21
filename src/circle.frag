#version 300 es
precision highp float;

in vec2 pos;

uniform sampler2D fields;
uniform sampler2D colors;

layout(location=0) out vec4 out_fields;
layout(location=1) out vec4 out_colors;

uniform vec2 circle;

uniform vec4 radii;

uniform vec4 colors_change;

uniform float force_factor;

/*PERLIN*/

void main() {
    vec4 circle_factors
        = max(radii - vec4(distance(circle.xy, pos)), vec4(0.0)) * radii;
    bvec4 in_circle = greaterThan(circle_factors, vec4(0.0));

    vec2 explosion = normalize(pos - circle.xy)
        * 1.0 * force_factor * (perlin(pos * 50.0) * 0.7 + 0.3);

    out_fields = texture(fields, pos)
      + vec4(any(in_circle) 
      ? vec2(explosion) 
      : vec2(0.0)
    , 0.0, 0.0);

    //out_fields.xy += in_circle ? vec2(force_factor) : vec2(0.0);

    out_colors = texture(colors, pos)
         + vec4(in_circle) * colors_change * (0.5 + perlin(pos * 175.0) * 0.5);
}