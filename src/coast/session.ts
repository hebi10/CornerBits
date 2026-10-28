import {initialState,parseState,SaveQueue,type AppState} from '../core/state';
import {nextRevision} from '../core/lifecycle';
import {advanceCoast,PROJECTS,projectCost,sellFish,startActivity,stopWork,setWorkInterval,isWork,type CoastalAction,type CoastalState} from './model';
import {workReportText} from './workText';

export interface SessionPort {
  load:()=>Promise<AppState|null>;
  save:(state:AppState)=>Promise<void>;
  export:(state:AppState)=>Promise<string|null>;
  restore:(state:AppState)=>Promise<void>;
}
export interface SessionView {
  state:AppState|null;
  coast:CoastalState|null;
  ready:boolean;
  busy:boolean;
  closing:boolean;
  saveFailed:boolean;
  saveStatus:string;
  error:string;
  notice:string;
}
interface RetrySnapshot {state:AppState;notice:string;generation:number}
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);
const copyState=(state:AppState)=>parseState(JSON.stringify(state));
const sameCoast=(a:CoastalState,b:CoastalState)=>Object.keys(a).every(key=>a[key as keyof CoastalState]===b[key as keyof CoastalState]);

/** Owns confirmed progress separately from display-only elapsed animation. */
export class CoastalSession {
  private view:SessionView={state:null,coast:null,ready:false,busy:false,closing:false,saveFailed:false,saveStatus:'불러오는 중',error:'',notice:''};
  private listeners=new Set<()=>void>();
  private queue:SaveQueue;
  private tail:Promise<void>=Promise.resolve();
  private queued=0;
  private generation=0;
  private pendingRetry:RetrySnapshot|null=null;
  private loading:Promise<void>|null=null;
  private closingTask:Promise<boolean>|null=null;
  private uncheckpointedMs=0;

  constructor(private readonly port:SessionPort){this.queue=new SaveQueue(state=>this.port.save(state));}

  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=():SessionView=>this.view;
  setError=(message:string)=>{this.publish({error:message});};

  private publish(patch:Partial<SessionView>){
    if(!Object.keys(patch).some(key=>this.view[key as keyof SessionView]!==patch[key as keyof SessionView]))return;
    this.view={...this.view,...patch};
    for(const listener of [...this.listeners])listener();
  }
  private enqueue<T>(operation:()=>Promise<T>):Promise<T>{
    this.queued+=1;this.publish({busy:true});
    const task=this.tail.then(operation);
    const finish=()=>{this.queued-=1;this.publish({busy:this.queued>0});};
    this.tail=task.then(finish,finish);
    return task;
  }
  private canChange(){return this.view.ready&&this.view.state!==null&&this.view.coast!==null&&!this.view.closing&&!this.view.saveFailed&&this.queued===0;}
  private snapshotFor(coast:CoastalState):AppState {
    const current=this.view.state;
    if(!current)throw new Error('저장할 기록을 먼저 불러와 주세요.');
    return copyState({...current,revision:nextRevision(current.revision),updatedAt:new Date().toISOString(),games:{...current.games,coast}});
  }
  private adopt(state:AppState,notice?:string){
    this.uncheckpointedMs=0;
    this.publish({state,coast:state.games.coast,ready:true,saveFailed:false,saveStatus:'저장 완료',error:'',...(notice===undefined?{}:{notice})});
  }
  private async saveAndAdopt(state:AppState,notice:string|undefined,generation=this.generation):Promise<boolean>{
    this.publish({saveStatus:'저장 중'});
    try {await this.queue.enqueue(state);}
    catch(cause){
      if(generation===this.generation){
        this.pendingRetry={state,notice:notice??this.view.notice,generation};
        this.publish({saveFailed:true,saveStatus:'저장 실패',error:`자동 저장에 실패했습니다. ${errorText(cause)} 다시 시도해 주세요.`});
      }
      return false;
    }
    if(generation!==this.generation)return false;
    this.pendingRetry=null;this.adopt(state,notice);return true;
  }
  private async checkpointInside():Promise<boolean>{
    if(this.pendingRetry||this.view.saveFailed)return false;
    const current=this.view.state,coast=this.view.coast;
    if(!current||!coast)return false;
    if(!sameCoast(current.games.coast,coast)&&!await this.saveAndAdopt(this.snapshotFor(coast),undefined))return false;
    try {await this.queue.flush();return true;}
    catch(cause){this.publish({error:`저장을 마치지 못했습니다. ${errorText(cause)}`});return false;}
  }

  load():Promise<void>{
    if(this.loading)return this.loading;
    if(this.view.ready)return Promise.resolve();
    this.loading=this.enqueue(async()=>{
      try {
        const stored=await this.port.load();
        if(stored===null)await this.saveAndAdopt(initialState(),'부두 · 해변 · 집을 눌러보세요');
        else this.adopt(copyState(stored),stored.games.coast.activity?'':'부두 · 해변 · 집을 눌러보세요');
      }catch(cause){this.publish({state:null,coast:null,saveStatus:'확인 필요',error:`기록을 불러오지 못했습니다. 원본은 보존했습니다. ${errorText(cause)} 백업에서 복원할 수 있습니다.`});}
      finally {this.publish({ready:true});}
    });
    return this.loading;
  }

  start(action:CoastalAction):Promise<void>{
    if(!this.canChange())return Promise.resolve();
    const current=this.view.coast!;
    const next=startActivity(current,action);
    if(next===current){
      const item=PROJECTS.find(project=>project.action===action);
      const cost=projectCost(current,action);
      const notice=current.activity!==null?'지금 하던 일을 마친 뒤 시작해 주세요.':item&&current.houseLevel<item.requiredLevel?`집 ${item.requiredLevel}단계부터 만들 수 있어요.`:item&&(current.decoration&item.bit)!==0?'이미 놓은 장식입니다.':action==='upgrade'&&current.houseLevel===3?'집이 최고 단계에 도달했어요.':`나무 ${cost.wood}개 · 조개코인 ${cost.coins}개가 필요해요.`;
      this.publish({notice});return Promise.resolve();
    }
    return this.enqueue(async()=>{
      try {await this.saveAndAdopt(this.snapshotFor(next),'');}
      catch(cause){this.setError(`행동을 시작하지 못했습니다. ${errorText(cause)}`);}
    });
  }

  sell():Promise<void>{
    if(!this.canChange())return Promise.resolve();
    const current=this.view.coast!,next=sellFish(current);
    if(next===current){this.publish({notice:current.activity!==null?'지금 하던 일을 마친 뒤 판매해 주세요.':'지금 판매할 수 있는 물고기가 없습니다.'});return Promise.resolve();}
    return this.enqueue(async()=>{
      try {await this.saveAndAdopt(this.snapshotFor(next),`물고기 ${current.fish}마리 판매 · 조개코인 +${next.coins-current.coins}`);}
      catch(cause){this.setError(`판매하지 못했습니다. ${errorText(cause)}`);}
    });
  }

  stop():Promise<void>{
    if(!this.canChange())return Promise.resolve();
    const current=this.view.coast!,next=stopWork(current);if(next===current)return Promise.resolve();
    return this.enqueue(async()=>{await this.saveAndAdopt(this.snapshotFor(next),'작업을 마쳤어요. 모은 재료는 그대로 남아요.');});
  }

  changeInterval(minutes:10|15):Promise<void>{
    if(!this.canChange())return Promise.resolve();
    const current=this.view.coast!,next=setWorkInterval(current,minutes);if(next===current)return Promise.resolve();
    return this.enqueue(async()=>{await this.saveAndAdopt(this.snapshotFor(next),`작업 자원은 ${minutes}분마다 정산해요.`);});
  }

  advance(deltaMs:number):void {
    if(!this.canChange())return;
    const previous=this.view.coast!,next=advanceCoast(previous,deltaMs);
    if(next===previous)return;
    const reportChanged=next.lastReport?.id!==previous.lastReport?.id;
    if(next.activity!==null&&!reportChanged){
      this.publish({coast:next});this.uncheckpointedMs+=deltaMs;
      if(this.uncheckpointedMs>=60_000)void this.checkpoint();
      return;
    }
    const generation=this.generation;
    const item=PROJECTS.find(project=>project.action===previous.activity);
    const notice=reportChanged?workReportText(next.lastReport):isWork(previous.activity)?'보관할 수 있는 양에 도달해 작업을 마쳤어요.':previous.activity==='upgrade'?`집 ${next.houseLevel}단계 완성`:item?`${item.name}를 놓았어요.`:'';
    void this.enqueue(async()=>{
      try {await this.saveAndAdopt(this.snapshotFor(next),notice,generation);}
      catch(cause){this.setError(`진행을 마치지 못했습니다. ${errorText(cause)}`);}
    });
  }

  checkpoint():Promise<boolean>{
    if(this.view.closing)return this.closingTask??Promise.resolve(false);
    return this.enqueue(async()=>{
      try {return await this.checkpointInside();}
      catch(cause){this.setError(`진행을 저장하지 못했습니다. ${errorText(cause)}`);return false;}
    });
  }

  retry():Promise<void>{
    if(this.view.closing||this.queued>0||!this.pendingRetry)return Promise.resolve();
    const pending=this.pendingRetry;
    return this.enqueue(async()=>{await this.saveAndAdopt(pending.state,pending.notice,pending.generation);});
  }

  exportBackup():Promise<string|null>{
    if(this.view.closing)return Promise.resolve(null);
    return this.enqueue(async()=>{
      try {
        if(!await this.checkpointInside())return null;
        const result=await this.port.export(copyState(this.view.state!));
        if(result!==null)this.publish({notice:'백업을 저장했습니다.'});
        return result;
      }catch(cause){this.setError(`백업을 내보내지 못했습니다. ${errorText(cause)}`);return null;}
    });
  }

  restore(next:AppState):Promise<boolean>{
    if(this.view.closing)return Promise.resolve(false);
    return this.enqueue(async()=>{
      try {
        const imported=copyState(next);
        const replacement=copyState({...imported,revision:nextRevision(this.view.state?.revision??0,imported.revision),updatedAt:new Date().toISOString()});
        // A confirmed restore can replace an unsaved failed action. The port
        // preserves the actual previous file before replacement.
        await this.port.restore(structuredClone(replacement));
        this.generation+=1;this.pendingRetry=null;this.queue=new SaveQueue(state=>this.port.save(state));
        this.adopt(replacement,'백업을 복원했습니다. 이전 기록도 별도 보관했습니다.');
        return true;
      }catch(cause){this.setError(`백업을 복원하지 못했습니다. 기존 기록은 유지했습니다. ${errorText(cause)}`);return false;}
    });
  }

  prepareClose():Promise<boolean>{
    if(this.closingTask)return this.closingTask;
    this.publish({closing:true});
    const operation=this.enqueue(async()=>{
      try {
        if(this.pendingRetry||this.view.saveFailed)throw new Error('저장 다시 시도를 먼저 완료해 주세요.');
        if(this.view.state&&this.view.coast&&!await this.checkpointInside())throw new Error('진행 중인 저장을 완료하지 못했습니다.');
        await this.queue.flush();return true;
      }catch(cause){this.publish({closing:false,error:`저장을 마치지 못해 창을 닫지 않았습니다. ${errorText(cause)}`});return false;}
    });
    this.closingTask=operation.then(ok=>{if(!ok)this.closingTask=null;return ok;});
    return this.closingTask;
  }

  /** Release a completed close preparation only when native destruction fails. */
  cancelClose():void {
    if(!this.view.closing||this.queued>0)return;
    this.closingTask=null;
    this.publish({closing:false});
  }
}
