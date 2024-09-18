import { mat4 } from "gl-matrix";

export enum object_types {
    TRIANGLE,
    FLOOR
}

export enum pipeline_types {
    SKY,
    DUEL_PEELING_PIPELINE,
    INIT_DUEL_PEELING_PIPELINE,
    SCREEN_PIPELINE
}

export interface RenderData {
    view_transform: mat4;
    model_transforms: Float32Array;
    object_counts: {[obj in object_types]: number}
}