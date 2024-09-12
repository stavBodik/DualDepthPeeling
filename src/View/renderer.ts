import sky_shader from "./shaders/sky_shader.wgsl";
import shader from "./shaders/shaders.wgsl";
import { TriangleMesh } from "./triangle_mesh";
import { QuadMesh } from "./quad_mesh";
import { mat4 } from "gl-matrix";
import { Material } from "./material";
import { pipeline_types, object_types, RenderData } from "../model/definitions";
import { ObjMesh } from "./obj_mesh";
import { CubeMapMaterial } from "./cube_material";
import { Camera } from "../model/camera";

export class Renderer {

    canvas: HTMLCanvasElement;

    // Device/Context objects
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;
    format : GPUTextureFormat;

    // Pipeline objects
    uniformBuffer: GPUBuffer;

    pipelines: {[pipeline in pipeline_types]: GPURenderPipeline | null};
    frameGroupLayouts: {[pipeline in pipeline_types]: GPUBindGroupLayout | null};
    frameBindGroups: {[pipeline in pipeline_types]: GPUBindGroup | null};

    // Depth Stencil stuff
    depthBuffer : GPUTexture;
    depthBufferView : GPUTextureView;
    

    depthBufferBindingGroupLayout : GPUBindGroupLayout;
    depthBufferBindingGroup : GPUBindGroup;




    // Assets
    triangleMesh: TriangleMesh;
    quadMesh: QuadMesh;
    statueMesh: ObjMesh;
    triangleMaterial: Material;
    quadMaterial: Material;
    standingQuadMaterial: Material;
    standingQuadMaterialRed: Material;

    objectBuffer: GPUBuffer;
    parameterBuffer: GPUBuffer;
    skyMaterial: CubeMapMaterial;

    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;

        this.pipelines = {
            [pipeline_types.SKY]: null,
            [pipeline_types.STANDARD_LESS]: null,
        }
    }

   async Initialize() {

        await this.setupDevice();

        await this.makeBindGroupLayouts();

        await this.createAssets();

        await this.makeDepthBufferResources();
    
        await this.makePipelines();

        await this.makeBindGroups();
    }

    async setupDevice() {

        //adapter: wrapper around (physical) GPU.
        //Describes features and limits
        this.adapter = <GPUAdapter> await navigator.gpu?.requestAdapter();
        //device: wrapper around GPU functionality
        //Function calls are made through the device
        this.device = <GPUDevice> await this.adapter?.requestDevice();
        //context: similar to vulkan instance (or OpenGL context)
        this.context = <GPUCanvasContext> this.canvas.getContext("webgpu");
        this.format = "bgra8unorm";
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "premultiplied"
        });

    }

    async makeDepthBufferResources() {

        

        const size: GPUExtent3D = {
            width: this.canvas.width,
            height: this.canvas.height,
            depthOrArrayLayers: 1
        };






        const depthBufferDescriptor: GPUTextureDescriptor = {
            size: size,
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }


        this.depthBuffer = this.device.createTexture(depthBufferDescriptor);
        this.depthBufferView = this.depthBuffer.createView();


        


    }

    async makeBindGroupLayouts() {

        this.frameGroupLayouts = {
            [pipeline_types.SKY]: null,
            [pipeline_types.STANDARD_LESS]: null,
            
        }

        this.frameGroupLayouts[pipeline_types.SKY] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "uniform",
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        viewDimension: "cube",
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                    }
                }
            ]

        });

        this.frameGroupLayouts[pipeline_types.STANDARD_LESS] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {type: 'uniform'}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                        hasDynamicOffset: false
                    }
                }
                
            ]

        });

        
        this.depthBufferBindingGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT, // for the depth buffer texture
                    texture: {}
                },
            ]

        });

    }

    async makeBindGroups() {

        this.frameBindGroups = {
            [pipeline_types.SKY]: null,
            [pipeline_types.STANDARD_LESS]: null,
        }
       
        this.frameBindGroups[pipeline_types.STANDARD_LESS] = this.device.createBindGroup({
            layout: this.frameGroupLayouts[pipeline_types.STANDARD_LESS] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.objectBuffer,
                    }
                }
                
            ]
        });

        this.frameBindGroups[pipeline_types.SKY] = this.device.createBindGroup({
            layout: this.frameGroupLayouts[pipeline_types.SKY] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.parameterBuffer,
                    }
                },
                {
                    binding: 1,
                    resource: this.skyMaterial.view
                },
                {
                    binding: 2,
                    resource: this.skyMaterial.sampler
                }
            ]
        });


        this.depthBufferBindingGroup = this.device.createBindGroup({
            layout: this.depthBufferBindingGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.depthBufferView
                },
            ]
        });
    }

    async makePipelines() {
        
        var pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.frameGroupLayouts[pipeline_types.STANDARD_LESS] as GPUBindGroupLayout, 
                this.quadMaterial.bindGroupLayout,
                this.depthBufferBindingGroupLayout
            ]
        });

            
        this.pipelines[pipeline_types.STANDARD_LESS] = this.device.createRenderPipeline({
            vertex : {
                module : this.device.createShaderModule({
                    code : shader
                }),
                entryPoint : "vs_main",
                buffers: [this.triangleMesh.bufferLayout,]
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : shader
                }),
                entryPoint : "fs_main",
                targets : [{
                    format : this.format
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less",
            },
            
        });


        

        




        pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.frameGroupLayouts[pipeline_types.SKY] as GPUBindGroupLayout,
            ]
        });

        this.pipelines[pipeline_types.SKY] = this.device.createRenderPipeline({
            vertex : {
                module : this.device.createShaderModule({
                    code : sky_shader
                }),
                entryPoint : "sky_vert_main"
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : sky_shader
                }),
                entryPoint : "sky_frag_main",
                targets : [{
                    format : this.format
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less",
            },
        });

    }

    async createAssets() {
        this.triangleMesh = new TriangleMesh(this.device);
        this.quadMesh = new QuadMesh(this.device);
        //this.statueMesh = new ObjMesh();
        //await this.statueMesh.initialize(this.device, "dist/models/statue.obj");
        
        
        this.triangleMaterial = new Material();
        this.quadMaterial = new Material();
        this.standingQuadMaterial = new Material();
        this.standingQuadMaterialRed = new Material();

        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 64 * 1024,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };
        this.objectBuffer = this.device.createBuffer(modelBufferDescriptor);

        const parameterBufferDescriptor: GPUBufferDescriptor = {
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        };
        this.parameterBuffer = this.device.createBuffer(
            parameterBufferDescriptor
        );

        await this.triangleMaterial.initialize(this.device, "chat",0,this.canvas.width,this.canvas.height);
        await this.quadMaterial.initialize(this.device, "floor",0,this.canvas.width,this.canvas.height);
        await this.standingQuadMaterial.initialize(this.device, "StandingQuad",1,this.canvas.width,this.canvas.height);
        await this.standingQuadMaterialRed.initialize(this.device, "StandingQuadRed",1,this.canvas.width,this.canvas.height);


        const urls = [
            "dist/img/sky_back.png",  //x+
            "dist/img/sky_front.png",   //x-
            "dist/img/sky_left.png",   //y+
            "dist/img/sky_right.png",  //y-
            "dist/img/sky_top.png", //z+
            "dist/img/sky_bottom.png",    //z-
        ]
        this.skyMaterial = new CubeMapMaterial();
        await this.skyMaterial.initialize(this.device, urls);
    }



    prepareScene(renderables: RenderData, camera: Camera) {

        //make transforms
        const projection = mat4.create();
        mat4.perspective(projection, Math.PI/4, 800/600, 0.1, 10);

        const view = renderables.view_transform;

        this.device.queue.writeBuffer(
            this.objectBuffer, 0, 
            renderables.model_transforms, 0, 
            renderables.model_transforms.length
        );
        this.device.queue.writeBuffer(this.uniformBuffer, 0, <ArrayBuffer>view); 
        this.device.queue.writeBuffer(this.uniformBuffer, 64, <ArrayBuffer>projection); 

        const dy = Math.tan(Math.PI/8);
        const dx = dy * 800 / 600

        this.device.queue.writeBuffer(
            this.parameterBuffer, 0,
            new Float32Array(
                [
                    camera.forwards[0],
                    camera.forwards[1],
                    camera.forwards[2],
                    0.0,
                    dx * camera.right[0],
                    dx * camera.right[1],
                    dx * camera.right[2],
                    0.0,
                    dy * camera.up[0],
                    dy * camera.up[1],
                    dy * camera.up[2],
                    0.0
                ]
            ), 0, 12
        )
    }


    async render(renderables: RenderData, camera: Camera) {
        
         //Early exit tests
         if (!this.device || !this.pipelines[pipeline_types.STANDARD_LESS] ) {
            return;
        }

        this.prepareScene(renderables, camera)


         //command encoder: records draw commands for submission
         const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();
         //texture view: image view to the color buffer in this case
         const textureView : GPUTextureView = this.context.getCurrentTexture().createView();
         //renderpass: holds draw commands, allocated from command encoder



         // Generate Less
         let renderpass1: GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: {r: 0.5, g: 0.0, b: 0.25, a: 1.0},
                loadOp: "clear",
                storeOp: "store",
            }],
             depthStencilAttachment: {
                view: this.depthBufferView,  // Use the depth buffer
                depthLoadOp: "clear",  
                depthStoreOp: "store",
            
                stencilLoadOp: "clear",
                stencilStoreOp: "store",
            
                depthClearValue: 1.0,
                stencilClearValue: 0, 
            },
         });


        await this.render_pass(renderables,camera,renderpass1,this.pipelines[pipeline_types.STANDARD_LESS],true);



        renderpass1 = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: {r: 0.5, g: 0.0, b: 0.25, a: 1.0},
                loadOp: "clear",
                storeOp: "store",
            }],
             depthStencilAttachment: {
                view: this.depthBufferView, 
                depthLoadOp: "clear",  
                depthStoreOp: "discard",
            
                stencilLoadOp: "clear",
                stencilStoreOp: "discard",
            
                depthClearValue: 1.0,
                stencilClearValue: 0, 
            },
         });


        await this.render_pass(renderables,camera,renderpass1,this.pipelines[pipeline_types.STANDARD_LESS],true);


        this.device.queue.submit([commandEncoder.finish()]);

    }


    async render_pass(renderables: RenderData, camera: Camera,renderpass : GPURenderPassEncoder,pipeLine : GPURenderPipeline,isDepthRecording : boolean) {

       
       
       // console.log("render_pass start");



        //SKY
        // renderpass.setPipeline(this.pipelines[pipeline_types.SKY] as GPURenderPipeline);
        // renderpass.setBindGroup(0, this.frameBindGroups[pipeline_types.SKY]);
        // renderpass.setBindGroup(1, this.quadMaterial.bindGroup); 
        // renderpass.draw(6, 1, 0, 0);




       //For Quads And Triangles


        var objects_drawn: number = 0;

        
        
        renderpass.setPipeline(pipeLine);
       

        renderpass.setBindGroup(0, this.frameBindGroups[pipeline_types.STANDARD_LESS]);


        if(isDepthRecording)
        {
            renderpass.setBindGroup(2, this.depthBufferBindingGroup);
        }


        renderpass.setVertexBuffer(0, this.quadMesh.buffer);


        

       
        renderpass.setBindGroup(1, this.quadMaterial.bindGroup); 
      
       
        renderpass.draw(
            6, renderables.object_counts[object_types.FLOOR], 
            0, objects_drawn
        );


        objects_drawn += renderables.object_counts[object_types.FLOOR];


         
        

        renderpass.setBindGroup(1, this.standingQuadMaterial.bindGroup); 
       

        renderpass.draw(
            6, 1, 
            0, objects_drawn
        );
        objects_drawn += 1;






        renderpass.setBindGroup(1, this.standingQuadMaterialRed.bindGroup); 
       

        renderpass.draw(
            6, 1, 
            0, objects_drawn
        );
        objects_drawn += 1;


        renderpass.end();
    
       // console.log("render_pass end");


    }
    
}