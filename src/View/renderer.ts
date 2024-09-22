import sky_shader from "./shaders/sky_shader.wgsl";
import init_duel_peeling_shader from "./shaders/dual_peeling_init.wgsl";
import duel_peeling_shader from "./shaders/duel_peeling_shader.wgsl";
import accumulatte_screen_shader from "./shaders/accumulate_screen_shader.wgsl";
import final_screen_shader from "./shaders/final_screen_shader.wgsl";

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
    gpuTextureColorFormat_rg32f : GPUTextureFormat;


    // Device/Context objects
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;


    occlusionQuerySet : GPUQuerySet;

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


    back_peeled_color_target_texture: GPUTexture;
    back_peeled_color_target_texture_view: GPUTextureView;

    front_peeled_color_target_texture: GPUTexture;
    front_peeled_color_target_texture_view: GPUTextureView;



    back_accumulated_color_target_texture: GPUTexture;
    back_accumulated_color_target_texture_view: GPUTextureView;

    front_accumulated_color_target_texture: GPUTexture;
    front_accumulated_color_target_texture_view: GPUTextureView;


    gpuDepthTextureColorFormat : GPUTextureFormat;

    depthBuffercolorAttachmentTextureDescriptor : GPUTextureDescriptor;

    // Assets
    quadMesh: QuadMesh;
    triangleMesh: TriangleMesh;

    quadMaterial: Material;
    purpleQuadMaterial: Material;
    blueQuadMaterialRed: Material;
    orangeQuadMaterial: Material;

    objectBuffer: GPUBuffer;
    cameraBuffer: GPUBuffer;
    skyMaterial: SkyCubeMaterial;

    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
    }

   async Initialize() {

        await this.initialSetup();

        await this.createAssets();

        await this.createDepthBufferResources();

        await this.createBindGroupLayouts();

        await this.createBindGroups();

        await this.createPipelines();

    }

    async initialSetup() {

        this.gpuTextureColorFormat = "rgba8unorm";
        this.gpuDepthTextureColorFormat = "depth24plus";
        this.gpuTextureColorFormat_rg32f = "rg32float";

        //adapter: wrapper around (physical) GPU.
        //Describes features and limits
        this.adapter = <GPUAdapter> await navigator.gpu?.requestAdapter();

        if (!this.adapter.features.has("float32-filterable")) {
            throw new Error("Filterable 32-bit float textures support is not available");
        }

        //device: wrapper around GPU functionality
        //Function calls are made through the device
        this.device = <GPUDevice> await this.adapter?.requestDevice({requiredFeatures: ["float32-filterable"]});

        //context: similar to vulkan instance (or OpenGL context)
        this.context = <GPUCanvasContext> this.canvas.getContext("webgpu");

        this.context.configure({device: this.device,format: this.gpuTextureColorFormat,alphaMode: "premultiplied"
        });



        this.occlusionQuerySet = this.device.createQuerySet({
            type: "occlusion",
            count: 1,
          });

          

    }

    async createDepthBufferResources() {

        
        this.depthBuffercolorAttachmentTextureDescriptor = {
            size: {width: this.canvas.width,height: this.canvas.height},
            format: this.gpuTextureColorFormat_rg32f,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC 
        }

        this.depthBuffer1 =  this.device.createTexture(this.depthBuffercolorAttachmentTextureDescriptor);
        this.depthBufferView1 =  this.depthBuffer1.createView();


        this.depthBuffer2 =  this.device.createTexture(this.depthBuffercolorAttachmentTextureDescriptor);
        this.depthBufferView2 =  this.depthBuffer2.createView();


        this.screenTextureSampler =  this.device.createSampler({
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        });


        const colorAttachmentTextureDescriptor: GPUTextureDescriptor = {
            size: {width: this.canvas.width,height: this.canvas.height},
            format: this.gpuTextureColorFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC 
        }

        this.back_peeled_color_target_texture =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.back_peeled_color_target_texture_view =  this.back_peeled_color_target_texture.createView();

        this.front_peeled_color_target_texture =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.front_peeled_color_target_texture_view =  this.front_peeled_color_target_texture.createView();


        this.back_accumulated_color_target_texture =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.back_accumulated_color_target_texture_view =  this.back_accumulated_color_target_texture.createView();


        this.front_accumulated_color_target_texture =  this.device.createTexture(colorAttachmentTextureDescriptor);
        this.front_accumulated_color_target_texture_view =  this.front_accumulated_color_target_texture.createView();
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


        this.bindingGroupLayouts[binding_group_types.ACCUMULATE_SCREEN] = this.device.createBindGroupLayout({
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
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
            ]

        });


        this.bindingGroupLayouts[binding_group_types.FINAL_SCREEN_FRONT] = this.device.createBindGroupLayout({
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
                }
            ]

        });

        this.bindingGroupLayouts[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_1] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                        viewDimension: '2d',
                        multisampled:false
                      }
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

        this.bindingGroups[binding_group_types.ACCUMULATE_SCREEN] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.ACCUMULATE_SCREEN] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource:  this.screenTextureSampler
                },
                {
                    binding: 1,
                    resource: this.front_peeled_color_target_texture_view
                },
                {
                    binding: 2,
                    resource: this.back_peeled_color_target_texture_view
                }
            ]
        });


        this.bindingGroups[binding_group_types.FINAL_SCREEN_FRONT] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.FINAL_SCREEN_FRONT] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource:  this.screenTextureSampler
                },
                {
                    binding: 1,
                    resource: this.front_accumulated_color_target_texture_view
                }
            ]
        });


        this.bindingGroups[binding_group_types.FINAL_SCREEN_BACK] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.FINAL_SCREEN_FRONT] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource:  this.screenTextureSampler
                },
                {
                    binding: 1,
                    resource: this.back_accumulated_color_target_texture_view
                }
            ]
        });



        this.bindingGroups[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_1] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_1] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.depthBufferView1
                },
            ]
        });


        this.bindingGroups[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_2] = this.device.createBindGroup({
            layout: this.bindingGroupLayouts[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_1] as GPUBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.depthBufferView2
                },
            ]
        });
    }

    async createPipelines() {
        
        var duelPeelingPipelineLayout = this.device.createPipelineLayout({
            label: "duelPeelingPipelineLayout",
            bindGroupLayouts: [
                this.bindingGroupLayouts[binding_group_types.BASE_SCENE] as GPUBindGroupLayout, 
                this.quadMaterial.bindGroupLayout,
                this.bindingGroupLayouts[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_1] as GPUBindGroupLayout,
            ]
        });
        

            
        this.pipelines[pipeline_types.DUEL_PEELING_PIPELINE] = this.device.createRenderPipeline({
            label:"DUEL_PEELING_PIPELINE",
            vertex : {
                module : this.device.createShaderModule({
                    code : duel_peeling_shader
                }),
                entryPoint : "vs_main",
                buffers: [this.quadMesh.bufferLayout,]
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : duel_peeling_shader
                }),
                entryPoint : "fs_main",
                targets : [{
                    format : this.gpuTextureColorFormat_rg32f,
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
                },
                {
                    format:this.gpuTextureColorFormat,
                    blend: {
                        color: {
                          srcFactor: 'one',   
                          dstFactor: 'one',     
                          operation: 'add'      
                        },
                        alpha: {
                          srcFactor: 'one',    // Ignore B's alpha
                          dstFactor: 'one',     // Keep A's alpha
                          operation: 'add'
                        }
                      },
                },
                {
                    format:this.gpuTextureColorFormat,
                    blend: {
                        color: {
                          srcFactor: 'one',   
                          dstFactor: 'one',     
                          operation: 'add'      
                        },
                        alpha: {
                          srcFactor: 'one',    // Ignore B's alpha
                          dstFactor: 'one',     // Keep A's alpha
                          operation: 'add'
                        }
                      },
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: duelPeelingPipelineLayout
            
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
                    format : this.gpuTextureColorFormat_rg32f,
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


       
        

        




        var skyPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.bindingGroupLayouts[binding_group_types.SKY] as GPUBindGroupLayout               
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
    
            layout: skyPipelineLayout,
        });





        const screen_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindingGroupLayouts[binding_group_types.ACCUMULATE_SCREEN] as GPUBindGroupLayout]
        });

        this.pipelines[pipeline_types.ACCUMULATE_SCREEN_PIPELINE] = this.device.createRenderPipeline({
            label:"SCREEN_PIPELINE",
            layout: screen_pipeline_layout,
            vertex: {
                module: this.device.createShaderModule({
                code: accumulatte_screen_shader,
            }),
            entryPoint: 'vert_main',
            },

            fragment: {
                module: this.device.createShaderModule({
                code: accumulatte_screen_shader,
            }),
            entryPoint: 'frag_main',
            targets: [
                {
                    format: this.gpuTextureColorFormat,
                    blend: { //front to back blending
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
                },
                {
                    format: this.gpuTextureColorFormat,
                    blend: {//back to front blending
                        color: {
                            srcFactor: 'one',           
                            dstFactor: 'one-minus-src-alpha', 
                            operation: 'add'                 
                        },
                        alpha: {
                            srcFactor: 'one',                 
                            dstFactor: 'one-minus-src-alpha',              
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





        const final_screen_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindingGroupLayouts[binding_group_types.FINAL_SCREEN_FRONT] as GPUBindGroupLayout]
        });

        this.pipelines[pipeline_types.FINAL_SCREEN_PIPELINE] = this.device.createRenderPipeline({
            label:"FINAL_SCREEN_PIPELINE",
            layout: final_screen_pipeline_layout,
            vertex: {
                module: this.device.createShaderModule({
                code: final_screen_shader,
            }),
            entryPoint: 'vert_main',
            },

            fragment: {
                module: this.device.createShaderModule({
                code: final_screen_shader,
            }),
            entryPoint: 'frag_main',
            targets: [
                {
                    format: this.gpuTextureColorFormat,
                    blend: { //front to back blending
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
        this.purpleQuadMaterial = new Material();
        this.blueQuadMaterialRed = new Material();
        this.orangeQuadMaterial = new Material();

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
        await this.purpleQuadMaterial.initialize(this.device, "purple",1,this.canvas.width,this.canvas.height,1);
        await this.blueQuadMaterialRed.initialize(this.device, "blue",1,this.canvas.width,this.canvas.height,1);
        await this.orangeQuadMaterial.initialize(this.device, "orange",1,this.canvas.width,this.canvas.height,1);


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

        const occlusionResultBuffer = this.device.createBuffer({size: 1 * 8,usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,});
        const occlusionResolveBuffer = this.device.createBuffer({size: 1 * 8,usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,});
        
        let commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();

        //init the first depth buffer that is used in pass 0 to have -minDepth,MaxDepth between all fragments, for each pixel.
        await this.initDepthValues(renderables,this.depthBufferView1,commandEncoder);

        let isPeelFinished :boolean = false;

        const numberOfDuelPeelingPasses : number = 50;

        for(let i=0; i<numberOfDuelPeelingPasses && !isPeelFinished; i++){

            let depthBufferResult :GPUTextureView  = (i % 2) === 0 ? this.depthBufferView2 : this.depthBufferView1;
        
            let depthBufferBindingGroup  = (i % 2) === 0 ? this.bindingGroups[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_1] : this.bindingGroups[binding_group_types.DUEL_PEELING_DEPTH_BUFFER_2];

            let renderpass : GPURenderPassEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [
                {
                    view: depthBufferResult,
                    clearValue: {r: -this.Max_Depth, g: -this.Max_Depth, b: 0.0, a: 0.0},
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.front_peeled_color_target_texture_view,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.back_peeled_color_target_texture_view,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            occlusionQuerySet: this.occlusionQuerySet,
            });

            renderpass.setPipeline(this.pipelines[pipeline_types.DUEL_PEELING_PIPELINE] as GPURenderPipeline);
            renderpass.setBindGroup(2,depthBufferBindingGroup as GPUBindGroup);

            
            renderpass.beginOcclusionQuery(0);
            
            await this.drawModel(renderables,renderpass);

            renderpass.endOcclusionQuery();

            renderpass.end();

            commandEncoder.resolveQuerySet(this.occlusionQuerySet, 0, 1, occlusionResolveBuffer, 0);
            if (occlusionResultBuffer.mapState === 'unmapped') {
                commandEncoder.copyBufferToBuffer(occlusionResolveBuffer, 0, occlusionResultBuffer, 0, occlusionResultBuffer.size);
            }


            //Accmulate back and front layers using front and back blending.
            let  renderpass1  = commandEncoder.beginRenderPass({
                colorAttachments: [
                {
                    view:this.front_accumulated_color_target_texture_view,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: i === 0 ? "clear" : "load",
                    storeOp: "store",
                },
                {
                    view:this.back_accumulated_color_target_texture_view,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: i === 0 ? "clear" : "load",
                    storeOp: "store",
                }]
            });


            renderpass1.setPipeline(this.pipelines[pipeline_types.ACCUMULATE_SCREEN_PIPELINE] as GPURenderPipeline);
            renderpass1.setBindGroup(0, this.bindingGroups[binding_group_types.ACCUMULATE_SCREEN] as GPUBindGroup);
            renderpass1.draw(6, 1, 0, 0);
            renderpass1.end();

    
        
            
            this.device.queue.submit([commandEncoder.finish()]);
            

            
            if (occlusionResultBuffer.mapState === 'unmapped') {
                await occlusionResultBuffer.mapAsync(GPUMapMode.READ);
                const results: BigUint64Array = new BigUint64Array(occlusionResultBuffer.getMappedRange());    
                
                if (results[0] === 0n) {
                    isPeelFinished = true; //we are done, peeled the middle layer , last layer.
                }
            
                occlusionResultBuffer.unmap();
            }
            

            commandEncoder = this.device.createCommandEncoder();


        }//loop end


        const finalTextureView : GPUTextureView =  this.context.getCurrentTexture().createView();


        //front blending between accumulated front and back textures 
        for(let i=0; i< 2 ; i++)
        {

            let accumulatedBindingGroup  = (i % 2) === 0 ? this.bindingGroups[binding_group_types.FINAL_SCREEN_FRONT] : this.bindingGroups[binding_group_types.FINAL_SCREEN_BACK];


            let  renderpass1  = commandEncoder.beginRenderPass({
                colorAttachments: [
                {
                    view: finalTextureView,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 0.0},
                    loadOp: i === 0  ? "clear": "load",
                    storeOp: "store",
                 },]
             });
    
    
             renderpass1.setPipeline(this.pipelines[pipeline_types.FINAL_SCREEN_PIPELINE] as GPURenderPipeline);
             renderpass1.setBindGroup(0, accumulatedBindingGroup as GPUBindGroup);
             renderpass1.draw(6, 1, 0, 0);
             renderpass1.end();
        }



        this.drawSky(finalTextureView,commandEncoder);



        this.device.queue.onSubmittedWorkDone().then(
            () => {
                let end: number = performance.now();
                this.frametime = end - start;
                let performanceLabel: HTMLElement =  <HTMLElement> document.getElementById("render-time");
                if (performanceLabel) {
                    performanceLabel.innerText = this.frametime.toString();
                }
            }
        );
       

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
            }]
            
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
        
        renderpass.setVertexBuffer(0, this.quadMesh.buffer);

       
        //Floor Quads Draw
        renderpass.setBindGroup(1, this.quadMaterial.bindGroup); 
        renderpass.draw(6, renderables.object_counts[object_types.FLOOR], 0, objects_drawn);
        objects_drawn += renderables.object_counts[object_types.FLOOR];


        //First purple quad draw
        renderpass.setBindGroup(1, this.purpleQuadMaterial.bindGroup); 
        renderpass.draw(6, 1, 0, objects_drawn);
        objects_drawn += 1;

        //Second blue quad draw
        renderpass.setBindGroup(1, this.blueQuadMaterialRed.bindGroup); 
        renderpass.draw(6, 1, 0, objects_drawn);
        objects_drawn += 1;



        //Third orange quad draw
        renderpass.setBindGroup(1, this.orangeQuadMaterial.bindGroup); 


        renderpass.draw(
            6, 1, 
            0, objects_drawn
        );


        objects_drawn += 1;
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

        await this.drawModel(renderables,renderpass);

        renderpass.end();
    }
    
}