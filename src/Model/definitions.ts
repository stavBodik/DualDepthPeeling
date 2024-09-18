import { mat4 } from "gl-matrix";

export enum object_types {
    TRIANGLE,
    FLOOR
}

export enum pipeline_types {
    SKY_PIPELINE,
    DUEL_PEELING_PIPELINE,
    INIT_DUEL_PEELING_PIPELINE,
    SCREEN_PIPELINE
}

export enum binding_group_types {
    SKY,
    BASE_SCENE,
    SCREEN,
}

export interface RenderData {
    view_transform: mat4;
    model_transforms: Float32Array;
    object_counts: {[obj in object_types]: number}
}