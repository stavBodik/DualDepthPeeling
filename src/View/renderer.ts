import sky_shader from "./shaders/sky_shader.wgsl";
import init_duel_peeling_shader from "./shaders/dual_peeling_init.wgsl";
import base_shader from "./shaders/base_shader.wgsl";
import screen_shader from "./shaders/screen_shader.wgsl";

import { TriangleMesh } from "./triangle_mesh";
import { QuadMesh } from "./quad_mesh";
import { mat4 } from "gl-matrix";
import { Material } from "./material";
import { pipeline_types, object_types, RenderData,binding_group_types } from "../model/definitions";
import { SkyCubeMaterial } from "./sky_cube_material";
import { Camera } from "../model/camera";

export class Renderer {

    canvas: HTMLCanvasElement;
    frametime: number

    gpuTextureColorFormat : GPUTextureFormat;

    // Device/Context objects
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;

    // Pipeline objects
    cameraViewProjectionBuffer: GPUBuffer;

    pipelines: {[pipeline in pipeline_types]?: GPURenderPipeline} = {};
    bindingGroupLayouts: {[bindingGrpup in binding_group_types]?: GPUBindGroupLayout} = {};
    bindingGroups: {[bindingGrpup in binding_group_types]?: GPUBindGroup } = {};

    // Depth stuff

    Max_Depth : number = 1.0;

    depthBuffer1 : GPUTexture;
    depthBufferView1 : GPUTextureView;

    depthBuffer2 : GPUTexture;
    depthBufferView2 : GPUTextureView;
    
    screenTextureSampler : GPUSampler;


    back_color_target_texture: GPUTexture;
    back_color_target_texture_view: GPUTextureView;

    gpuDepthTextureColorFormat : GPUTextureFormat;


    // Assets
    quadMesh: QuadMesh;
    triangleMesh: TriangleMesh;

    quadMaterial: Material;
    standingQuadMaterial: Material;
    standingQuadMaterialRed: Material;

    objectBuffer: GPUBuffer;
    cameraBuffer: GPUBuffer;
    skyMaterial: SkyCubeMaterial;

    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
    }

   async Initialize() {

        await this.setupDevice();

        await this.createAssets();

        await this.createDepthBufferResources();

        await this.createBindGroupLayouts();

        await this.createBindGroups();

        await this.createPipelines();

    }

    async setupDevice() {

        this.gpuTextureColorFormat = "rgba8unorm";
        this.gpuDepthTextureColorFormat = "depth24plus";

        //adapter: wrapper around (physical) GPU.
        //Describes features and limits
        this.adapter = <GPUAdapter> await navigator.gpu?.requestAdapter();
        //device: wrapper around GPU functionality
        //Function calls are made through the device
        this.device = <GPUDevice> await this.adapter?.requestDevice();
        //context: similar to vulkan instance (or OpenGL context)
        this.context = <GPUCanvasContext> this.canvas.getContext("webgpu");

        this.context.configure({device: this.device,format: this.gpuTextureColorFormat,alphaMode: "premultiplied"
        });

    }

    async createDepthBufferResources() {

        
        const colorAttachmentTextureDescriptor: GPUTextureDescriptor = {
            size: {width: this.canvas.width,height: this.canvas.height},
            format: this.gpuTextureColorFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        }

         this.depthBuffer1 =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.depthBufferView1 =  this.depthBuffer1.createView();


        this.depthBuffer2 =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.depthBufferView2 =  this.depthBuffer2.createView();



        this.screenTextureSampler =  this.device.createSampler({
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        });


        this.back_color_target_texture =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.back_color_target_texture_view =  this.back_color_target_texture.createView();

    }

    async createBindGroupLayouts() {

        this.bindingGroupLayouts = {}

        this.bindingGroupLayouts[binding_group_types.SKY] = this.device.createBindGroupLayout({
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

        this.bindingGroupLayouts[binding_group_types.BASE_SCENE] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX, //view projection
                    buffer: {type: 'uniform'}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX, // object model transformation's
                    buffer: {
                        type: "read-only-storage",
                        hasDynamicOffset: false
                    }
                }
                
            ]

        });


        this.bindingGroupLayouts[binding_group_types.SCREEN] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
            ]

        });


    }

    async createBindGroups() {


        this.bindingGroups = {}
       
        this.bindingGroups[binding_group_types.BASE_SCENE] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.BASE_SCENE] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.cameraViewProjectionBuffer
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

        this.bindingGroups[binding_group_types.SKY] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.SKY] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.cameraBuffer,
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



        this.bindingGroups[binding_group_types.SCREEN] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.SCREEN] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource:  this.screenTextureSampler
                },
                {
                    binding: 1,
                    resource: this.depthBufferView1
                },
            ]
        });
    }

    async createPipelines() {
        
        var pipelineLayout = this.device.createPipelineLayout({
            label: "base_pipelineLayout",
            bindGroupLayouts: [
                this.bindingGroupLayouts[binding_group_types.BASE_SCENE] as GPUBindGroupLayout, 
                this.quadMaterial.bindGroupLayout,
            ]
        });
        

            
        this.pipelines[pipeline_types.DUEL_PEELING_PIPELINE] = this.device.createRenderPipeline({
            label:"BASE_PIPELINE",
            vertex : {
                module : this.device.createShaderModule({
                    code : base_shader
                }),
                entryPoint : "vs_main",
                buffers: [this.quadMesh.bufferLayout,]
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : base_shader
                }),
                entryPoint : "fs_main",
                targets : [{
                    format : this.gpuTextureColorFormat
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: {
                format: this.gpuDepthTextureColorFormat,
                depthWriteEnabled: false,
                depthCompare: "never",
            },
            
        });


        var pipelineLayoutInit = this.device.createPipelineLayout({
            label: "init_pipelineLayout",
            bindGroupLayouts: [
                this.bindingGroupLayouts[binding_group_types.BASE_SCENE] as GPUBindGroupLayout 
            ]
        });

        this.pipelines[pipeline_types.INIT_DUEL_PEELING_PIPELINE] = this.device.createRenderPipeline({
            label:"INIT_PIPELINE",
            vertex : {
                module : this.device.createShaderModule({
                    code : init_duel_peeling_shader
                }),
                entryPoint : "vs_main",
                buffers: [this.quadMesh.bufferLayout,]
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : init_duel_peeling_shader
                }),
                entryPoint : "fs_main",
                targets : [{
                    format : this.gpuTextureColorFormat,
                    blend: {
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'one',
                            operation: 'max', // Using max blend operation
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one',
                            operation: 'max', // Using max blend operation for alpha as well
                        },
                    },
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayoutInit
            
            
        });


       
        

        




        pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.bindingGroupLayouts[binding_group_types.SKY] as GPUBindGroupLayout,
            ]
        });

        this.pipelines[pipeline_types.SKY_PIPELINE] = this.device.createRenderPipeline({
            label:"Sky",
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
                targets: [
                    {
                        format: this.gpuTextureColorFormat,
                        blend: {
                            color: {
                                srcFactor: 'one-minus-dst-alpha',           
                                dstFactor: 'one', 
                                operation: 'add'                 
                            },
                            alpha: {
                                srcFactor: 'one-minus-dst-alpha',                 
                                dstFactor: 'one',              
                                operation: 'add'                 
                            }
                        }
                    }
                ]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: {
                format: this.gpuDepthTextureColorFormat,
                depthWriteEnabled: true,
                depthCompare: "equal",
            },
        });





        const screen_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindingGroupLayouts[binding_group_types.SCREEN] as GPUBindGroupLayout]
        });

        this.pipelines[pipeline_types.SCREEN_PIPELINE] = this.device.createRenderPipeline({
            layout: screen_pipeline_layout,
            
            vertex: {
                module: this.device.createShaderModule({
                code: screen_shader,
            }),
            entryPoint: 'vert_main',
            },

            fragment: {
                module: this.device.createShaderModule({
                code: screen_shader,
            }),
            entryPoint: 'frag_main',
            targets: [
                {
                    format: this.gpuTextureColorFormat,
                    blend: {
                        color: {
                            srcFactor: 'one-minus-dst-alpha',           
                            dstFactor: 'one', 
                            operation: 'add'                 
                        },
                        alpha: {
                            srcFactor: 'one-minus-dst-alpha',                 
                            dstFactor: 'one',              
                            operation: 'add'                 
                        }
                    }
                }
            ]
            },

            primitive: {
                topology: "triangle-list"
            }
        });

    }

    async createAssets() {
        this.quadMesh = new QuadMesh(this.device);        
        this.triangleMesh = new TriangleMesh(this.device);        

        this.quadMaterial = new Material();
        this.standingQuadMaterial = new Material();
        this.standingQuadMaterialRed = new Material();

        this.cameraViewProjectionBuffer = this.device.createBuffer({
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        

        

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 64 * 1024,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };
        this.objectBuffer = this.device.createBuffer(modelBufferDescriptor);

        const cameraBufferDescriptor: GPUBufferDescriptor = {
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        };
        this.cameraBuffer = this.device.createBuffer(
            cameraBufferDescriptor
        );

        await this.quadMaterial.initialize(this.device, "floor",0,this.canvas.width,this.canvas.height,6);
        await this.standingQuadMaterial.initialize(this.device, "StandingQuad",1,this.canvas.width,this.canvas.height,1);
        await this.standingQuadMaterialRed.initialize(this.device, "StandingQuadRed",1,this.canvas.width,this.canvas.height,1);


        const urls = [
            "dist/img/sky_back.png",  //x+
            "dist/img/sky_front.png",   //x-
            "dist/img/sky_left.png",   //y+
            "dist/img/sky_right.png",  //y-
            "dist/img/sky_top.png", //z+
            "dist/img/sky_bottom.png",    //z-
        ]
        this.skyMaterial = new SkyCubeMaterial();
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


        this.device.queue.writeBuffer(this.cameraViewProjectionBuffer, 0, <ArrayBuffer>view); 
        this.device.queue.writeBuffer(this.cameraViewProjectionBuffer, 64, <ArrayBuffer>projection);



        const dy = Math.tan(Math.PI/8);
        const dx = dy * 800 / 600

        this.device.queue.writeBuffer(
            this.cameraBuffer, 0,
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
         if (!this.device || !this.depthBuffer1 || !this.depthBuffer2) {
            return;
         }
        
         let start: number = performance.now();


        this.prepareScene(renderables, camera);


        const finalTextureView : GPUTextureView =  this.context.getCurrentTexture().createView();
        
        let commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();


        
        await this.initDepthValues(renderables,this.depthBufferView1,commandEncoder);


        // //Depth Peeling Loop
        // const numberOfPeelPassed : number = 3;

        // for(let i=0; i<numberOfPeelPassed; i++)
        // {

        //     let depthBufferResult :GPUTextureView  = (i % 2) === 0 ? this.depthBufferView1 : this.depthBufferView2;
 
            
        //     let renderpass1 : GPURenderPassEncoder = commandEncoder.beginRenderPass({
        //         colorAttachments: [{
        //             view: this.back_color_target_texture_view,
        //             clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
        //             loadOp: "clear",
        //             storeOp: "store",
        //         }],
        //         depthStencilAttachment: {
        //             view: depthBufferResult, 
        //             depthLoadOp: "clear",  
        //             depthStoreOp: "store",
                
        //             depthClearValue: 1.0,
        //         },
        //     });


        //     await this.drawPeeledRenderPass(renderables,renderpass1);



             //accmulate layers with blending between them.
           let  renderpass1  = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: finalTextureView,
                    clearValue:{r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: "clear",
                    storeOp: "store",
                 }]
             });


             renderpass1.setPipeline(this.pipelines[pipeline_types.SCREEN_PIPELINE] as GPURenderPipeline);
             renderpass1.setBindGroup(0, this.bindingGroups[binding_group_types.SCREEN] as GPUBindGroup);
             renderpass1.draw(6, 1, 0, 0);
             renderpass1.end();
        // }
            

        // //Sky cube is the last layer in finalTextureView layers
         //await this.drawSky(finalTextureView,commandEncoder);

        

        // this.device.queue.onSubmittedWorkDone().then(
        //     () => {
        //         let end: number = performance.now();
        //         this.frametime = end - start;
        //         let performanceLabel: HTMLElement =  <HTMLElement> document.getElementById("render-time");
        //         if (performanceLabel) {
        //             performanceLabel.innerText = this.frametime.toString();
        //         }
        //     }
        // );

        this.device.queue.submit([commandEncoder.finish()]);

    }


    async drawSky(textureView :GPUTextureView,commandEncoder : GPUCommandEncoder)
    {
        let renderpass2 : GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                loadOp: "load",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.depthBufferView2, 
                depthLoadOp: "clear",  
                depthStoreOp: "store",
            
                depthClearValue: 1.0,
            },
            
        });

         //SKY Draw
        renderpass2.setPipeline(this.pipelines[pipeline_types.SKY_PIPELINE] as GPURenderPipeline);
        renderpass2.setBindGroup(0, this.bindingGroups[binding_group_types.SKY] as GPUBindGroup);
        renderpass2.setBindGroup(1, this.quadMaterial.bindGroup); 
        renderpass2.draw(6, 1, 0, 0);

        renderpass2.end();
    }
    
    async drawModel(renderables: RenderData,renderpass : GPURenderPassEncoder ) {

              

        renderpass.setBindGroup(0, this.bindingGroups[pipeline_types.DUEL_PEELING_PIPELINE] as GPUBindGroup );

         

        var objects_drawn: number = 0;
        
        //TRINALGE DRAW
        // renderpass.setVertexBuffer(0, this.triangleMesh.buffer);

       
        // renderpass.setBindGroup(1, this.standingQuadMaterial.bindGroup); 
       

        // renderpass.draw(
        //     3, renderables.object_counts[object_types.TRIANGLE]/2, 
        //     0, objects_drawn
        // );
        // objects_drawn += renderables.object_counts[object_types.TRIANGLE]/2;




        // renderpass.setBindGroup(1, this.standingQuadMaterialRed.bindGroup); 
       
        // renderpass.draw(
        //     3, renderables.object_counts[object_types.TRIANGLE]/2, 
        //     0, objects_drawn
        // );
        // objects_drawn += renderables.object_counts[object_types.TRIANGLE]/2;



        //Floor Draw
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
    

    }

    //init the first depth buffer that is used in pass 0 to have -minDepth,MaxDepth between all fragments, for each pixel.
    async initDepthValues(renderables: RenderData,depthTextureView : GPUTextureView, commandEncoder : GPUCommandEncoder)
    {
        //Set all values of textureViewToClear to be -Max_Depth
        let renderpass : GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: depthTextureView,
                clearValue: {r: -this.Max_Depth, g: -this.Max_Depth, b: 0.0, a: 0.0},
                loadOp: "clear",
                storeOp: "store",
            }]
        });

        renderpass.setPipeline(this.pipelines[pipeline_types.INIT_DUEL_PEELING_PIPELINE] as GPURenderPipeline);

        this.drawModel(renderables,renderpass);
    }
    
}