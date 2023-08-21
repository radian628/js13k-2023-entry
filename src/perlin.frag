
float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float smooth_step(float x) {
    return x * x * (3.0 * 2.0 * x);
}

float perlin(vec2 pos) {
    vec2 base = floor(pos);
    vec2 v1 = normalize(vec2(rand(base), rand(base - vec2(99.0, 99.0))) - vec2(0.5));
    base += vec2(1.0, 0.0);
    vec2 v2 = normalize(vec2(rand(base), rand(base - vec2(99.0, 99.0))) - vec2(0.5));
    base += vec2(-1.0, 1.0);
    vec2 v3 = normalize(vec2(rand(base), rand(base - vec2(99.0, 99.0))) - vec2(0.5));
    base += vec2(1.0, 0.0);
    vec2 v4 = normalize(vec2(rand(base), rand(base - vec2(99.0, 99.0))) - vec2(0.5));
    
    vec2 o1 = fract(pos);
    vec2 o2 = o1 - vec2(1.0, 0.0);
    vec2 o3 = o1 - vec2(0.0, 1.0);
    vec2 o4 = o1 - vec2(1.0, 1.0);

    // todo: figure out how to make this function not terrible
    return mix(
        mix(dot(o1, v1), dot(o2, v2), smoothstep(0.0, 1.0, fract(pos.x))),
        mix(dot(o3, v3), dot(o4, v4), smoothstep(0.0, 1.0, fract(pos.x))),
        smoothstep(0.0, 1.0, fract(pos.y))
    );
}