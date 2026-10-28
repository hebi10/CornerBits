import {describe,expect,it,vi} from 'vitest';
import {initialState,type AppState} from '../core/state';
import {initialCoast} from './model';
import {CoastalSession,type SessionPort} from './session';

function deferred(){let resolve!:()=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<void>((ok,no)=>{resolve=ok;reject=no;});return{promise,resolve,reject};}
const turns=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function source():AppState{return{...initialState(),revision:10,games:{...initialState().games,coast:{...initialCoast(),catches:5,fish:5,totalGathered:3,wood:3,coins:20}}};}
function harness(state:AppState|null=source()){
  const writes:AppState[]=[];const restores:AppState[]=[];
  const port:SessionPort={load:vi.fn(async()=>state),save:vi.fn(async next=>{writes.push(structuredClone(next));}),export:vi.fn(async()=> 'coast.cornerbits'),restore:vi.fn(async next=>{restores.push(structuredClone(next));})};
  return{session:new CoastalSession(port),port,writes,restores};
}

describe('coastal durable session controller',()=>{
  it('adopts costs only after the reserved start snapshot has saved and locks concurrent actions',async()=>{
    const {session,port,writes}=harness();await session.load();const release=deferred();vi.mocked(port.save).mockImplementationOnce(async state=>{writes.push(structuredClone(state));await release.promise;});
    const starting=session.start('flower');expect(session.getSnapshot()).toMatchObject({busy:true,coast:{activity:null,wood:3,coins:20,decoration:0}});await turns();
    expect(writes[0].games.coast).toMatchObject({activity:'flower',wood:0,coins:0});await session.start('gather');session.advance(10000);expect(port.save).toHaveBeenCalledTimes(1);
    release.resolve();await starting;expect(session.getSnapshot()).toMatchObject({busy:false,saveFailed:false,saveStatus:'저장 완료',coast:{activity:'flower',wood:0,coins:0,decoration:0}});
    session.advance(4200);await session.checkpoint();expect(session.getSnapshot().coast).toMatchObject({activity:null,decoration:1,wood:0,coins:0});expect(port.save).toHaveBeenCalledTimes(2);
  });
  it('does not write animation ticks and checkpoints resumable elapsed time',async()=>{
    const {session,port,writes}=harness();await session.load();await session.start('fish');session.advance(600);session.advance(480);expect(port.save).toHaveBeenCalledTimes(1);expect(session.getSnapshot().state!.games.coast.elapsedMs).toBe(0);expect(session.getSnapshot().coast!.elapsedMs).toBe(1080);
    expect(await session.checkpoint()).toBe(true);expect(port.save).toHaveBeenCalledTimes(2);expect(writes[1].games.coast.elapsedMs).toBe(1080);expect(await session.checkpoint()).toBe(true);expect(port.save).toHaveBeenCalledTimes(2);
    const reopened=harness(writes[1]);await reopened.session.load();reopened.session.advance(4120);await reopened.session.checkpoint();expect(reopened.session.getSnapshot().coast).toMatchObject({activity:null,fish:6,catches:6});
  });
  it('does not show completion rewards before the save succeeds',async()=>{
    const {session,port}=harness();await session.load();await session.start('fish');session.advance(5100);const release=deferred();vi.mocked(port.save).mockImplementationOnce(()=>release.promise);
    session.advance(100);await turns();expect(session.getSnapshot()).toMatchObject({busy:true,coast:{activity:'fish',fish:5,catches:5,elapsedMs:5100}});
    release.resolve();await session.checkpoint();expect(session.getSnapshot()).toMatchObject({busy:false,coast:{activity:null,fish:6,catches:6}});
  });
  it('keeps a failed exact snapshot for retry without duplicate reserved costs or rewards',async()=>{
    const {session,port}=harness();await session.load();vi.mocked(port.save).mockRejectedValueOnce(new Error('disk full'));await session.start('flower');
    expect(session.getSnapshot()).toMatchObject({saveFailed:true,coast:{activity:null,wood:3,coins:20}});const attempted=structuredClone(vi.mocked(port.save).mock.calls[0][0]);session.advance(10000);await session.sell();await session.start('gather');expect(port.save).toHaveBeenCalledTimes(1);
    await session.retry();expect(vi.mocked(port.save).mock.calls[1][0]).toEqual(attempted);expect(session.getSnapshot()).toMatchObject({saveFailed:false,coast:{activity:'flower',wood:0,coins:0}});
    vi.mocked(port.save).mockRejectedValueOnce(new Error('disk full'));session.advance(4200);await session.checkpoint();expect(session.getSnapshot().saveFailed).toBe(true);expect(session.getSnapshot().coast!.decoration).toBe(0);
    const completion=structuredClone(vi.mocked(port.save).mock.calls[2][0]);await session.retry();expect(vi.mocked(port.save).mock.calls[3][0]).toEqual(completion);expect(session.getSnapshot().coast).toMatchObject({decoration:1,wood:0,coins:0});
  });
  it('exports only after pending saves and a fresh animation checkpoint finish',async()=>{
    const {session,port}=harness();await session.load();const release=deferred();vi.mocked(port.save).mockImplementationOnce(()=>release.promise);const starting=session.start('fish');const exporting=session.exportBackup();await turns();expect(port.export).not.toHaveBeenCalled();release.resolve();await starting;expect(await exporting).toBe('coast.cornerbits');
    session.advance(1200);expect(await session.exportBackup()).toBe('coast.cornerbits');expect(vi.mocked(port.export).mock.calls[1][0].games.coast.elapsedMs).toBe(1200);
    session.advance(100);vi.mocked(port.save).mockRejectedValueOnce(new Error('checkpoint full'));expect(await session.exportBackup()).toBeNull();expect(port.export).toHaveBeenCalledTimes(2);
  });
  it('replaces a failed queue through restore and never replays its stale action',async()=>{
    const {session,port}=harness();await session.load();const gate=deferred();vi.mocked(port.save).mockImplementationOnce(()=>gate.promise);const starting=session.start('fish');
    const imported={...source(),revision:50,games:{...source().games,coast:{...initialCoast(),totalGathered:1,wood:1}}};const restoring=session.restore(imported);gate.reject(new Error('write failed'));await starting;expect(await restoring).toBe(true);
    expect(session.getSnapshot()).toMatchObject({saveFailed:false,state:{revision:51},coast:{activity:null,wood:1,fish:0,catches:0}});await session.retry();expect(port.save).toHaveBeenCalledTimes(1);
    await session.start('gather');session.advance(4200);await session.checkpoint();expect(session.getSnapshot().coast).toMatchObject({wood:2,catches:0});
  });
  it('preserves the previous state and retry after a restore failure',async()=>{
    const {session,port}=harness();await session.load();vi.mocked(port.save).mockRejectedValueOnce(new Error('write failed'));await session.start('flower');const previous=session.getSnapshot().state;
    vi.mocked(port.restore).mockRejectedValueOnce(new Error('snapshot failed'));expect(await session.restore(source())).toBe(false);expect(session.getSnapshot().state).toEqual(previous);expect(session.getSnapshot().saveFailed).toBe(true);
    await session.retry();expect(session.getSnapshot().coast).toMatchObject({activity:'flower',wood:0,coins:0});
  });
  it('waits for a close checkpoint and blocks new progress while closing',async()=>{
    const {session,port}=harness();await session.load();await session.start('fish');session.advance(1200);const release=deferred();vi.mocked(port.save).mockImplementationOnce(()=>release.promise);
    const closing=session.prepareClose();expect(session.getSnapshot().closing).toBe(true);await turns();expect(vi.mocked(port.save).mock.calls[1][0].games.coast.elapsedMs).toBe(1200);session.advance(10000);await session.start('gather');expect(session.getSnapshot().coast!.elapsedMs).toBe(1200);
    release.resolve();expect(await closing).toBe(true);expect(session.getSnapshot().closing).toBe(true);
  });
  it('refuses close on a failed checkpoint then allows exact retry and close',async()=>{
    const {session,port}=harness();await session.load();await session.start('fish');session.advance(1300);vi.mocked(port.save).mockRejectedValueOnce(new Error('disk full'));
    expect(await session.prepareClose()).toBe(false);expect(session.getSnapshot()).toMatchObject({closing:false,saveFailed:true});await session.retry();expect(session.getSnapshot().coast!.elapsedMs).toBe(1300);expect(await session.prepareClose()).toBe(true);
  });
  it('reopens a prepared session if the native window cannot be destroyed',async()=>{
    const {session,port}=harness();await session.load();expect(await session.prepareClose()).toBe(true);
    session.cancelClose();expect(session.getSnapshot().closing).toBe(false);
    await session.start('gather');session.advance(1200);expect(await session.checkpoint()).toBe(true);
    expect(session.getSnapshot().coast).toMatchObject({activity:'gather',elapsedMs:1200});expect(port.save).toHaveBeenCalledTimes(2);
    expect(await session.prepareClose()).toBe(true);
  });
  it('does not release the close lock while its final save is pending',async()=>{
    const {session,port}=harness();await session.load();await session.start('fish');session.advance(1200);
    const release=deferred();vi.mocked(port.save).mockImplementationOnce(()=>release.promise);const closing=session.prepareClose();await turns();
    session.cancelClose();expect(session.getSnapshot().closing).toBe(true);await session.start('gather');expect(session.getSnapshot().coast!.activity).toBe('fish');
    release.resolve();expect(await closing).toBe(true);session.cancelClose();expect(session.getSnapshot().closing).toBe(false);
  });
  it('never substitutes fresh progress for a read error but can recover from backup',async()=>{
    const {session,port}=harness();vi.mocked(port.load).mockRejectedValueOnce(new Error('corrupt original'));await session.load();expect(session.getSnapshot()).toMatchObject({ready:true,state:null,coast:null,saveFailed:false});expect(session.getSnapshot().error).toContain('원본');expect(port.save).not.toHaveBeenCalled();expect(await session.restore(source())).toBe(true);expect(session.getSnapshot().coast).toEqual(source().games.coast);
    const fresh=harness(null);await fresh.session.load();expect(fresh.port.save).toHaveBeenCalledTimes(1);expect(fresh.session.getSnapshot().coast).toEqual(initialCoast());
  });
});
