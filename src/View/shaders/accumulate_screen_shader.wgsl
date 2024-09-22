






@group(0) @binding(0) var screen_sampler : sampler;
@group(0) @binding(1) var front_peeled_color_buffer_buffer : texture_2d<f32>;
@group(0) @binding(2) var back_peeled_color_buffer_buffer : texture_2d<f32>;


struct FragmentOutputs {
    @location(0) frontAccumulatedTextureTarget: vec4<f32>,  
    @location(1) backAccumulatedTextureTarget:  vec4<f32> 

};


struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) TexCoord : vec2<f32>,
}

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {

    var positions = array<vec2<f32>, 6>(
        vec2<f32>( 1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(-1.0,  1.0)
    );

    var texCoords = array<vec2<f32>, 6>(
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 0.0)
    );

    var output : VertexOutput;

    output.Position =  vec4<f32>(positions[VertexIndex], 0.0, 1.0);

    output.TexCoord = texCoords[VertexIndex];
    return output;
}

@fragment
fn frag_main(@location(0) TexCoord : vec2<f32>) -> FragmentOutputs {

    var outputs: FragmentOutputs;
    outputs.frontAccumulatedTextureTarget = textureSample(front_peeled_color_buffer_buffer, screen_sampler, TexCoord);
    outputs.backAccumulatedTextureTarget = textureSample(back_peeled_color_buffer_buffer, screen_sampler, TexCoord);

    return outputs;
}