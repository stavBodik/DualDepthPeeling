import { mat4 } from "gl-matrix";

export enum object_types {
    TRIANGLE,
    FLOOR
}

export enum pipeline_types {
    SKY_PIPELINE,
    DUEL_PEELING_PIPELINE,
    INIT_DUEL_PEELING_PIPELINE,
    ACCUMULATE_SCREEN_PIPELINE,
    FINAL_SCREEN_PIPELINE
}

export enum binding_group_types {
    SKY,
    BASE_SCENE,
    ACCUMULATE_SCREEN,
    FINAL_SCREEN_FRONT,
    FINAL_SCREEN_BACK,
    DUEL_PEELING_DEPTH_BUFFER_1,
    DUEL_PEELING_DEPTH_BUFFER_2
}

export interface RenderData {
    view_transform: mat4;
    model_transforms: Float32Array;
    object_counts: {[obj in object_types]: number}
}