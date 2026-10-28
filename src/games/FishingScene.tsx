import type { CSSProperties } from 'react';
import type { FishingState } from './fishing';
import { BAITS, FISH, locationNames } from './fishing';
import type { FishingFeedback } from './Fishing.tsx';

export function FishSprite({species,className=''}:{species:number;className?:string}) {
  return <span className={`fish-sprite ${className}`} data-species={species} aria-hidden="true"
    style={{backgroundPosition:`${species%6*20}% ${[6,24,42,60,80,99][Math.floor(species/6)]}%`}} />;
}

export function RegionSprite({location,className=''}:{location:number;className?:string}) {
  return <span className={`fishing-region ${className}`} data-location={location} aria-hidden="true"
    style={{backgroundPosition:`${location%3*50}% ${Math.floor(location/3)*50}%`}} />;
}

export function RodSprite({rod,className=''}:{rod:number;className?:string}) {
  const frame=rod-1;
  return <span className={`fishing-rod ${className}`} data-rod={rod} aria-hidden="true"
    style={{backgroundPosition:`${frame%4*100/3}% ${frame<4?7.1:40.5}%`}} />;
}

interface FishingSceneProps {
  state:FishingState;
  scene:string;
  status:string;
  buttonLabel:string;
  disabled:boolean;
  urgent:boolean;
  feedback:FishingFeedback|null;
  onFish:()=>void;
  onCollection:(species:number)=>void;
}

export default function FishingScene({state,scene,status,buttonLabel,disabled,urgent,feedback,onFish,onCollection}:FishingSceneProps) {
  return <div className="fishing-play">
    <button type="button" className="fishing-main-action" aria-label={buttonLabel}
      title={`${locationNames[state.location]} · ${BAITS[state.bait]} · ${status||buttonLabel}`} disabled={disabled} onClick={onFish}>
      <span className="fishing-world">
        <RegionSprite location={state.location}/>
        <span className="fishing-angler-scene" data-scene={scene} aria-hidden="true"/>
        <RodSprite rod={state.rod} className="fishing-equipped-rod"/>
        {feedback?.type==='catch'&&scene==='catch'&&<FishSprite species={feedback.species!} className={`fishing-catch-reveal${feedback.discovered?' fishing-catch-new':''}${feedback.species!%6>=4?' fishing-catch-rare':''}`}/>}
      </span>
    </button>
    <p className={`fishing-status${urgent?'':' sr-only'}`} role="status" aria-live="polite">{status}</p>
    <div className="fishing-keepsakes" aria-label="수집한 물고기 전시">
      {state.keepsakes.map((species,index)=><button key={species} type="button" className="fishing-keepsake" style={{'--display-order':index} as CSSProperties}
        aria-label={`${FISH[species]} 수집 기록 보기`} title={`${FISH[species]} · 누적 ${state.caught[species]}마리 · 판매 후에도 전시됩니다`} onClick={()=>onCollection(species)}>
        <FishSprite species={species}/>
      </button>)}
    </div>
  </div>;
}
