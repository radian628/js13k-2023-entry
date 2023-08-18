#version 300 es
precision highp float;in vec2 d;uniform sampler2D atmosphere;uniform sampler2D render_layer;out vec4 data;uniform vec2 rand_noise;float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233))) *43758.5453);}float smooth_step(float x) {return x*x* (3.*2.*x);}float perlin(vec2 d) {vec2 base=floor(d);vec2 v1=normalize(vec2(rand(base),rand(base-vec2(99.,99.))) -vec2(0.5));base+=vec2(1.,0.);vec2 v2=normalize(vec2(rand(base),rand(base-vec2(99.,99.))) -vec2(0.5));base+=vec2(-1.,1.);vec2 v3=normalize(vec2(rand(base),rand(base-vec2(99.,99.))) -vec2(0.5));base+=vec2(1.,0.);vec2 v4=normalize(vec2(rand(base),rand(base-vec2(99.,99.))) -vec2(0.5));vec2 o1=fract(d);vec2 o2=o1-vec2(1.,0.);vec2 o3=o1-vec2(0.,1.);vec2 o4=o1-vec2(1.,1.);return mix(mix(dot(o1,v1),dot(o2,v2),smoothstep(0.,1.,fract(d.x))),mix(dot(o3,v3),dot(o4,v4),smoothstep(0.,1.,fract(d.x))),smoothstep(0.,1.,fract(d.y)));}vec4 watercolor(vec4 v) {return floor(v) +pow(mod(1.-v,vec4(1.)) *0.85,vec4(2.));}vec4 quantized_atmos_data(vec2 d,float noise) {vec4 smooth_atmos_data=max(vec4(0.),texture(atmosphere,d) +perlin(d*40.) *noise-noise);vec4 atmos_data=watercolor(smooth_atmos_data*3.) /3.-0.3333333;return max(vec4(0.),atmos_data);}void main() {vec4 smooth_atmos_data=texture(atmosphere,d);vec4 render_layer_data=texture(render_layer,d);vec4 atmos_data=quantized_atmos_data(d-vec2(0.01,0.03) *render_layer_data.w*5.,0.05);vec4 cloud_layer=quantized_atmos_data(d-vec2(0.03,0.09),0.05);vec3 base_color=render_layer_data.rgb;base_color=mix(base_color,vec3(0.,0.,0.2),clamp((atmos_data.x+0.5) *0.3+atmos_data.y,0.,1.));base_color=mix(base_color,vec3(0.25,0.21,0.2),clamp(quantized_atmos_data(d-vec2(0.01,0.03),0.05).y*1.5,0.,1.));base_color=mix(base_color,vec3(1.,1.,1.),clamp(1.*cloud_layer.x,0.,1.));base_color=mix(base_color,vec3(1.,1.,0.),rand(rand_noise+d) < (cloud_layer.z-0.5) ?1.:0.);data=vec4(base_color,1.);}