#version 300 es
precision highp float;

in vec3 f_vpos;
in vec3 original_vpos;

out vec4 col;

uniform highp int mode;

void main() {

    // normal mode
    if (mode == 0) {

        // underwater
        if (f_vpos.y < 0.0) {
            col = vec4(vec3(0.1, 0.2, 0.4) - clamp(f_vpos.y * 7.5, -1.0, 0.0), f_vpos.y);
            return;
        }

        // above ground
        col = vec4(0.6, 0.3 + f_vpos.y * 0.1, 0.0, f_vpos.y);
    
    // shadow mode
    } else if (mode == 1) {
        col = vec4(0.1, 0.2, 0.4, 0.0);
    
    // arrow mode
    } else if (mode == 2) {
        col = vec4(1.0, 1.0, 1.0, f_vpos.y);
    
    // jp flag mode
    } else if (mode == 3) {
        if (original_vpos.x < 0.0) {
            col = vec4(0.4, 0.2, 0.0, original_vpos.y);
        } else {
            col = vec4(0.8, 0.2, 0.1, original_vpos.y);
            if (distance(original_vpos.xy, vec2(0.2, 0.75)) < 0.1) {
                col = vec4(0.9, 0.8, 0.1, original_vpos.y);
            }
        }

    // mn flag mode
    // TODO: fix the flag
    } else if (mode == 4) {
        if (original_vpos.x < 0.0) {
            col = vec4(0.4, 0.2, 0.0, original_vpos.y);
        } else {
            col = vec4(0.9, 0.2, 0.1, original_vpos.y);
            float triangle_x = 0.25 * original_vpos.x + abs(original_vpos.y - 0.75);
            if (triangle_x < 0.22) {
                col = vec4(0.1, 0.2, 0.8, original_vpos.y);
                
            if (distance(original_vpos.xy, vec2(0.2, 0.75)) < 0.08) {
                col = vec4(0.9, 0.9, 0.9, original_vpos.y);
            }
            } else if (triangle_x > 0.25) {
                discard;
            }
        }

    // health bar
    } else if (mode == 5) {
        col = vec4(0.3, 0.8, 0.2, f_vpos.y);
    }
}