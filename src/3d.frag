#version 300 es
precision highp float;

in vec3 f_vpos;

out vec4 col;

uniform highp int mode;

void main() {

    // normal mode
    if (mode == 0) {

        // underwater
        if (f_vpos.y < 0.0) {
            col = vec4(vec3(0.1, 0.2, 0.4) - f_vpos.y * 1.2, f_vpos.y);
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
        if (f_vpos.x < 0.0) {
            col = vec4(0.4, 0.2, 0.0, f_vpos.y);
        } else {
            col = vec4(0.8, 0.2, 0.1, f_vpos.y);
            if (distance(f_vpos.xy, vec2(0.2, 0.75)) < 0.1) {
                col = vec4(0.9, 0.8, 0.1, f_vpos.y);
            }
        }

    // mn flag mode
    // TODO: fix the flag
    } else if (mode == 4) {
        if (f_vpos.x < 0.0) {
            col = vec4(0.4, 0.2, 0.0, f_vpos.y);
        } else {
            col = vec4(0.9, 0.2, 0.1, f_vpos.y);
            float triangle_x = 0.25 * f_vpos.x + abs(f_vpos.y - 0.75);
            if (triangle_x < 0.22) {
                col = vec4(0.1, 0.2, 0.8, f_vpos.y);
                
            if (distance(f_vpos.xy, vec2(0.2, 0.75)) < 0.08) {
                col = vec4(0.9, 0.9, 0.9, f_vpos.y);
            }
            } else if (triangle_x > 0.25) {
                discard;
            }
        }
    }
}