import sky_shader from "./shaders/sky_shader.wgsl";
import base_shader from "./shaders/base_shader.wgsl";
import screen_shader from "./shaders/screen_shader.wgsl";

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

    // Pipeline objects
    uniformBuffer: GPUBuffer;
    uniformBufferViewProjectionInverse: GPUBuffer;

    pipelines: {[pipeline in pipeline_types]: GPURenderPipeline | null};
    frameGroupLayouts: {[pipeline in pipeline_types]: GPUBindGroupLayout | null};
    frameBindGroups: {[pipeline in pipeline_types]: GPUBindGroup | null};

    // Depth Stencil stuff
    depthBuffer1 : GPUTexture;
    depthBufferView1 : GPUTextureView;

    depthBuffer2 : GPUTexture;
    depthBufferView2 : GPUTextureView;
    

     depthBufferBindingGroupLayout : GPUBindGroupLayout;
     depthBufferBindingGroup_1 : GPUBindGroup;

     depthBufferBindingGroup_2 : GPUBindGroup;


     depthSampler : GPUSampler;
     screenTextureSampler : GPUSampler;

     screen_bind_group_layout: GPUBindGroupLayout;
     screen_bind_group: GPUBindGroup;
     screen_pipeline: GPURenderPipeline;

     screen_texture: GPUTexture;
     screen_texture_view: GPUTextureView;


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
            [pipeline_types.BASE_PIPELINE]: null,
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
        this.context.configure({
            device: this.device,
            format: "rgba8unorm",
            alphaMode: "premultiplied"
        });

    }

    async makeDepthBufferResources() {

        
        const depthBufferDescriptor: GPUTextureDescriptor = {
            size: {width: this.canvas.width,height: this.canvas.height,depthOrArrayLayers: 1},
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
        }

        this.depthBuffer1 = this.device.createTexture(depthBufferDescriptor);
        this.depthBufferView1 = this.depthBuffer1.createView();


        this.depthBuffer2 = this.device.createTexture(depthBufferDescriptor);
        this.depthBufferView2 = this.depthBuffer2.createView();


       

        
        this.depthSampler = this.device.createSampler( {
            minFilter: 'nearest', // Use nearest filtering for depth textures
            magFilter: 'nearest',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });


        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        };
        this.screenTextureSampler = this.device.createSampler(samplerDescriptor);


        this.screen_texture = this.device.createTexture(
            {
                size: {
                    width: this.canvas.width,
                    height: this.canvas.height,
                },
                format: "rgba8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            }
        );
        this.screen_texture_view = this.screen_texture.createView();

    }

    async makeBindGroupLayouts() {

        this.frameGroupLayouts = {
            [pipeline_types.SKY]: null,
            [pipeline_types.BASE_PIPELINE]: null,          
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

        this.frameGroupLayouts[pipeline_types.BASE_PIPELINE] = this.device.createBindGroupLayout({
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
                    texture: {
                        sampleType: 'depth',  // Use depth type for depth textures
                        viewDimension: '2d',
                        multisampled: false,
                    },
                }
            ]

        });





        this.screen_bind_group_layout = this.device.createBindGroupLayout({
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

    async makeBindGroups() {

        this.frameBindGroups = {
            [pipeline_types.SKY]: null,
            [pipeline_types.BASE_PIPELINE]: null,
        }
       
        this.frameBindGroups[pipeline_types.BASE_PIPELINE] = this.device.createBindGroup({
            layout: this.frameGroupLayouts[pipeline_types.BASE_PIPELINE] as GPUBindGroupLayout,
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


        this.depthBufferBindingGroup_1 = this.device.createBindGroup({
            layout: this.depthBufferBindingGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.depthBufferView1
                }
            ]
        });


        this.depthBufferBindingGroup_2 = this.device.createBindGroup({
            layout: this.depthBufferBindingGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.depthBufferView2
                }
            ]
        });


        this.screen_bind_group = this.device.createBindGroup({
            layout: this.screen_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource:  this.screenTextureSampler
                },
                {
                    binding: 1,
                    resource: this.screen_texture_view
                },
            ]
        });
    }

    async makePipelines() {
        
        var pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.frameGroupLayouts[pipeline_types.BASE_PIPELINE] as GPUBindGroupLayout, 
                this.quadMaterial.bindGroupLayout,
                this.depthBufferBindingGroupLayout
            ]
        });
        

     

            
        this.pipelines[pipeline_types.BASE_PIPELINE] = this.device.createRenderPipeline({
            label:"STANDARD_LESS",
            vertex : {
                module : this.device.createShaderModule({
                    code : base_shader
                }),
                entryPoint : "vs_main",
                buffers: [this.triangleMesh.bufferLayout,]
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : base_shader
                }),
                entryPoint : "fs_main",
                targets : [{
                    format : "rgba8unorm"
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: {
                format: "depth24plus",
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
                        format: "rgba8unorm",
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
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "equal",
            },
        });





        const screen_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.screen_bind_group_layout]
        });

        this.screen_pipeline = this.device.createRenderPipeline({
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
                    format: "rgba8unorm",
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

        this.uniformBufferViewProjectionInverse = this.device.createBuffer({
            size: 64,
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

        const viewProjectionMatrix = mat4.create();
        mat4.multiply(viewProjectionMatrix,projection, view);

        const inverseMatrix = mat4.create();
        mat4.invert(inverseMatrix,viewProjectionMatrix); 


        this.device.queue.writeBuffer(this.uniformBuffer, 0, <ArrayBuffer>view); 
        this.device.queue.writeBuffer(this.uniformBuffer, 64, <ArrayBuffer>projection);

        this.device.queue.writeBuffer(this.uniformBufferViewProjectionInverse, 0, <ArrayBuffer>inverseMatrix); 


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
         if (!this.device || !this.pipelines[pipeline_types.BASE_PIPELINE] ) {
            return;
         }

        this.prepareScene(renderables, camera);


        const finalTextureView : GPUTextureView =  this.context.getCurrentTexture().createView();
        
        let commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();


        // Clear this.depthBufferView2, we want that the compare function in the first peel loop will pass using LESS 
        // all closest fragments to camera.
        await this.clearViewDepthValues(this.depthBufferView2,commandEncoder);


        //Depth Peeling Loop
        const numberOfPeelPassed : number = 3;

        for(let i=0; i<numberOfPeelPassed; i++)
        {

            let depthBufferResult :GPUTextureView  = (i % 2) === 0 ? this.depthBufferView1 : this.depthBufferView2;
 
            let depthBufferBindingGroup = (i % 2) === 0 ? this.depthBufferBindingGroup_2 : this.depthBufferBindingGroup_1;

            
            let renderpass1 : GPURenderPassEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.screen_texture_view,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: "clear",
                    storeOp: "store",
                }],
                depthStencilAttachment: {
                    view: depthBufferResult, 
                    depthLoadOp: "clear",  
                    depthStoreOp: "store",
                
                    depthClearValue: 1.0,
                },
            });


            await this.drawPeeledRenderPass(renderables,renderpass1,depthBufferBindingGroup);



             //accmulate layers with blending between them.
             renderpass1  = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: finalTextureView,
                    clearValue:{r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: i === 0 ? "clear" : "load",
                    storeOp: "store",
                }]
            });


            renderpass1.setPipeline(this.screen_pipeline);
            renderpass1.setBindGroup(0, this.screen_bind_group);
            renderpass1.draw(6, 1, 0, 0);
            renderpass1.end();
        }
            

        //Sky cube is the last layer in finalTextureView layers
        await this.drawSky(finalTextureView,commandEncoder);

        

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
        renderpass2.setPipeline(this.pipelines[pipeline_types.SKY] as GPURenderPipeline);
        renderpass2.setBindGroup(0, this.frameBindGroups[pipeline_types.SKY]);
        renderpass2.setBindGroup(1, this.quadMaterial.bindGroup); 
        renderpass2.draw(6, 1, 0, 0);

        renderpass2.end();
    }
    
    async drawPeeledRenderPass(renderables: RenderData,renderpass : GPURenderPassEncoder,depthBufferBindingGroup: GPUBindGroup ) {

       



        



       //For Quads And Triangles
        var objects_drawn: number = 0;

        
        
        renderpass.setPipeline(this.pipelines[pipeline_types.BASE_PIPELINE] as GPURenderPipeline);
       

        renderpass.setBindGroup(0, this.frameBindGroups[pipeline_types.BASE_PIPELINE]);


         
        renderpass.setBindGroup(2, depthBufferBindingGroup);
         



        
        renderpass.setVertexBuffer(0, this.quadMesh.buffer);

       


        //Floor Draw
        renderpass.setBindGroup(1, this.quadMaterial.bindGroup); 
      
       
        renderpass.draw(
            6, renderables.object_counts[object_types.FLOOR], 
            0, objects_drawn
        );


        objects_drawn += renderables.object_counts[object_types.FLOOR];


         
        
        //QUAD DRAW
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


    async clearViewDepthValues(textureViewToClear : GPUTextureView, commandEncoder : GPUCommandEncoder)
    {

        let renderpass : GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                loadOp: "clear",
                storeOp: "discard",
            }],
            depthStencilAttachment: {
                view: textureViewToClear, 
                depthLoadOp: "clear",  
                depthStoreOp: "store",
            
                depthClearValue: 0.0,
            },
        });

    
        renderpass.end();
    }
    
}