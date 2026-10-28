const offsets=[[-.660,-3.238],[-.603,-3.123],[-.545,-3.238],[-.603,-3.123],[-1.522,-3.181],[.144,-4.214],[.488,-3.181],[.545,-5.248]];
export const actorX=[-.603,-.603,-.545,-.660,-1.636,-1.464,-1.522,-1.005,-1.464,-2.498,-2.383,-.947,-1.062,-1.636,-2.727,-1.120];
export const actorY=[-3.437,-3.380,-3.552,-.509];
export function spritePosition(frame:number,x:number,y:number){return `calc(${frame%4*100/3}% + ${x}px) calc(${Math.floor(frame/4)*100/3}% + ${y}px)`;}

export function CoastIcon({frame,size=28}:{frame:number;size?:number}) {
  const offset=offsets[frame];
  return <span className="coast-icon" aria-hidden="true" style={{width:size,height:size,backgroundPosition:spritePosition(frame,offset[0]*size/36,offset[1]*size/36)}}/>;
}
