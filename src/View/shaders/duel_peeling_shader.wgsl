struct TransformData {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct ObjectData {
    model: array<mat4x4<f32>>,
};

@group(0) @binding(0)  var<uniform> transformUBO: TransformData;
@group(0) @binding(1)  var<storage, read> objects: ObjectData;


@group(1) @binding(0)  var myTexture: texture_2d<f32>;
@group(1) @binding(1)  var mySampler: sampler;
@group(1) @binding(2)   var<uniform> applyAlpha: u32;


@group(2) @binding(0) var depthBufferTexturePrev: texture_2d<f32>;


const MAX_DEPTH: f32 = 1.0;



struct VertexOutputs {
    @builtin(position) Position : vec4<f32>,
    @location(0) TexCoord : vec2<f32>
};

struct FragmentOutputs {
    @location(0) depthBufferTextureTarget: vec4<f32>,  
    @location(1) backTextureTarget: vec4<f32>,  

};

@vertex
fn vs_main(
    @builtin(instance_index) ID: u32,
    @location(0) vertexPostion: vec3<f32>, 
    @location(1) vertexTexCoord: vec2<f32>) -> VertexOutputs {

    var output : VertexOutputs;
    output.Position = transformUBO.projection * transformUBO.view * objects.model[ID] * vec4<f32>(vertexPostion, 1.0);
    output.TexCoord = vertexTexCoord;

    return output;
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>,@location(0) TexCoord : vec2<f32>) -> FragmentOutputs {
   

    var outputs: FragmentOutputs;

    let fragmentTextureCords = vec2<i32>(fragCoord.xy);  // Convert the fragment coordinates to integer texel coordinates
    let prevDepthBuffer = textureLoad(depthBufferTexturePrev, fragmentTextureCords, 0);  // Mip level 0


    let nearestDepth = -prevDepthBuffer.x;
	let farthestDepth = prevDepthBuffer.y;



    if (fragCoord.z < nearestDepth || fragCoord.z > farthestDepth) {
		// Skip this depth in the peeling algorithm, it was already peeled.
		outputs.depthBufferTextureTarget =  vec4(-MAX_DEPTH,-MAX_DEPTH,0,0);
	}

	if (fragCoord.z > nearestDepth && fragCoord.z < farthestDepth) {
		// This fragment needs to be peeled, GL_MAX will change the new range and on next pass we will color this layer
		outputs.depthBufferTextureTarget =  vec4(-fragCoord.z,fragCoord.z,0,0);
	}



    // If we made it here, this fragment is on the peeled layer from last pass, shade it (get its color);    
    var color = textureSample(myTexture, mySampler, TexCoord);
    
    if(applyAlpha == 1u)
    {
        color.a = 0.5; 
    }

    color = vec4(color.rgb * color.a,color.a); 

   // Make sure it is not peeled any farther
	outputs.depthBufferTextureTarget =  vec4(-MAX_DEPTH,-MAX_DEPTH,0,0);


    if (fragDepth == farthestDepth) {
		outputs.backTextureTarget = color;
	} 

        
    return outputs;
}