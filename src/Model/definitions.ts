import { mat4 } from "gl-matrix";

export enum object_types {
    TRIANGLE,
    FLOOR,
    STANDING_QUAD
}

export enum pipeline_types {
    SKY,
    STANDARD_LESS,
    STANDARD_LESS_DEPTH_BUFFER
}

export interface RenderData {
    view_transform: mat4;
    model_transforms: Float32Array;
    object_counts: {[obj in object_types]: number}
}