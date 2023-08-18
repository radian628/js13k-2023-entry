#version 300 es
precision highp float;

in vec2 pos;

uniform sampler2D fields;
uniform sampler2D colors;

layout(location=0) out vec4 out_fields;
layout(location=1) out vec4 out_colors;

uniform vec3 circle;

uniform vec4 colors_change;

uniform float force_factor;

void main() {
    float circle_factor 
        = max(circle.z - distance(circle.xy, pos), 0.0) * circle.z;
    bool in_circle = circle_factor > 0.0;

    vec2 explosion = normalize(pos - circle.xy)
        * 100.0 * force_factor;

    out_fields = texture(fields, pos)
      + vec4(in_circle ? vec2(explosion) : vec2(0.0), 0.0, 0.0);

    //out_fields.xy += in_circle ? vec2(force_factor) : vec2(0.0);

    out_colors = texture(colors, pos)
         + (in_circle ? colors_change : vec4(0.0));
}