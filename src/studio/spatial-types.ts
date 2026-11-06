/** World metres. Rectangles use [minX,minZ,maxX,maxZ]; yaw is degrees, 0 faces +Z. */
export type Rect = [number,number,number,number];
export interface SpatialPose {x:number;y:number;z:number;yaw:number}
export interface SpatialRegion {id:string;kind:'walkway'|'road'|'dock'|'court'|'stage';bounds:Rect;y:number}
export interface SpatialObstacle {bounds:Rect;bottom:number;top:number}
export interface SpatialRoute {id:string;mode:'pedestrian'|'ground-vehicle'|'boat';start:SpatialPose;end:SpatialPose;clearance:number;stop:string}
export interface BoardingAnchor {
 id:string;model:'motorboat';stand:SpatialPose;vehicle:SpatialPose;approach:SpatialPose;
 departure:SpatialPose;note:string;
}
export interface LocationMap {
 id:string;bounds:Rect;land:{bounds:Rect;exceptWater:true};water:Rect[];
 regions:SpatialRegion[];obstacles:SpatialObstacle[];seats:SpatialPose[];
 routes:SpatialRoute[];starts:{mode:SpatialRoute['mode'];models:string[];pose:SpatialPose;clearance:number}[];
 boarding:BoardingAnchor[];notes:string[];
}
export interface VehicleEnvelope {bounds:Rect;bottom:number;top:number}
