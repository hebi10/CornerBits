import {describe,expect,it} from 'vitest';
import {ANCHORS,COIN_PER_FISH,PROJECTS,activityDuration,advanceCoast,canStartActivity,initialCoast,parseCoast,projectCost,sampleCoast,sellFish,startActivity,type CoastalAction,type CoastalState} from './model';

const finish=(state:CoastalState,action:CoastalAction)=>advanceCoast(startActivity(state,action),activityDuration(action));
const funded=():CoastalState=>({...initialCoast(),catches:20,fish:20,totalGathered:100,wood:100,coins:500});

describe('durable coastal resources and activities',()=>{
  it('starts with strict independent durable progress and one active trip',()=>{
    const state=initialCoast();expect(state).toEqual({activity:null,elapsedMs:0,catches:0,totalGathered:0,fish:0,wood:0,coins:0,decoration:0,houseLevel:1});
    const started=startActivity(state,'fish');expect(started).toMatchObject({activity:'fish',elapsedMs:0});expect(startActivity(started,'gather')).toBe(started);expect(state.activity).toBeNull();expect(initialCoast()).not.toBe(state);
  });
  it('advances a saved trip and awards exactly once after its completed return',()=>{
    const started=startActivity(initialCoast(),'fish');const partial=advanceCoast(started,1500);expect(partial).toMatchObject({activity:'fish',elapsedMs:1500,fish:0,catches:0});
    const restored=parseCoast(JSON.parse(JSON.stringify(partial)));const almost=advanceCoast(restored,3699);expect(almost.activity).toBe('fish');expect(almost.fish).toBe(0);
    const done=advanceCoast(almost,1);expect(done).toMatchObject({activity:null,elapsedMs:0,fish:1,catches:1});expect(advanceCoast(done,1_000_000)).toBe(done);expect(started.fish).toBe(0);
  });
  it('connects fish sales and wood gathering to a crafted flowerpot',()=>{
    let state=initialCoast();for(let i=0;i<3;i++){state=finish(state,'fish');state=finish(state,'gather');}
    expect(state).toMatchObject({fish:3,catches:3,wood:3,totalGathered:3});state=sellFish(state);expect(COIN_PER_FISH).toBe(15);expect(state).toMatchObject({fish:0,catches:3,coins:45});
    const project=startActivity(state,'flower');expect(project).toMatchObject({activity:'flower',wood:0,coins:25,decoration:0});const done=advanceCoast(project,4200);expect(done).toMatchObject({decoration:1,wood:0,coins:25});expect(startActivity(done,'flower')).toBe(done);
  });
  it('reserves project costs once and restores a pending build without charging again',()=>{
    const ready={...initialCoast(),totalGathered:3,wood:3,coins:20};const started=startActivity(ready,'flower');expect(started).toMatchObject({wood:0,coins:0,decoration:0});
    const pending=parseCoast(advanceCoast(started,2000));expect(pending.elapsedMs).toBe(2000);expect(advanceCoast(pending,2200)).toMatchObject({wood:0,coins:0,decoration:1,activity:null});
  });
  it('makes home expansion increase both resource yields and unlock projects',()=>{
    const state=funded();expect(canStartActivity(state,'lantern')).toBe(false);expect(canStartActivity(state,'bench')).toBe(false);expect(projectCost(state,'upgrade')).toEqual({wood:12,coins:75});
    const upgrade=startActivity(state,'upgrade');expect(upgrade).toMatchObject({wood:88,coins:425,houseLevel:1});let level2=advanceCoast(upgrade,4200);expect(level2.houseLevel).toBe(2);expect(projectCost(level2,'upgrade')).toEqual({wood:25,coins:150});
    expect(finish(level2,'fish').fish-level2.fish).toBe(2);expect(finish(level2,'gather').wood-level2.wood).toBe(2);expect(canStartActivity(level2,'lantern')).toBe(true);
    level2=finish(level2,'lantern');expect(level2.decoration).toBe(2);const level3=finish(level2,'upgrade');expect(level3.houseLevel).toBe(3);expect(finish(level3,'fish').fish-level3.fish).toBe(3);expect(finish(level3,'gather').wood-level3.wood).toBe(3);expect(canStartActivity(level3,'bench')).toBe(true);expect(startActivity(level3,'upgrade')).toBe(level3);
  });
  it('supports independent decoration ownership while enforcing required home levels',()=>{
    const state={...funded(),houseLevel:3};const bench=finish(state,'bench');expect(bench.decoration).toBe(4);const all=finish(finish(bench,'flower'),'lantern');expect(all.decoration).toBe(7);for(const project of PROJECTS)expect(startActivity(all,project.action)).toBe(all);
    expect(PROJECTS.map(({name,bit,frame,requiredLevel,wood,coins})=>({name,bit,frame,requiredLevel,wood,coins}))).toEqual([{name:'꽃화분',bit:1,frame:5,requiredLevel:1,wood:3,coins:20},{name:'등불',bit:2,frame:6,requiredLevel:2,wood:6,coins:45},{name:'벤치',bit:4,frame:7,requiredLevel:3,wood:12,coins:90}]);
  });
  it('rejects unavailable transactions and keeps sale atomic at the coin cap',()=>{
    const state=initialCoast();for(const action of ['flower','lantern','bench','upgrade'] as const)expect(startActivity(state,action)).toBe(state);expect(sellFish(state)).toBe(state);
    const active=startActivity(funded(),'gather');expect(sellFish(active)).toBe(active);const tooMuch={...funded(),coins:1_000_000_000_000};expect(sellFish(tooMuch)).toBe(tooMuch);const boundary={...funded(),fish:1,coins:1_000_000_000_000-15};expect(sellFish(boundary)).toMatchObject({fish:0,coins:1_000_000_000_000});
  });
  it('samples the saved elapsed time through the existing path and action frames',()=>{
    const active=startActivity(initialCoast(),'fish');expect(sampleCoast(active)).toMatchObject({...ANCHORS.home,pose:'walk',phase:'outbound',frame:0,progress:0});expect(sampleCoast(advanceCoast(active,600))).toMatchObject({x:48,y:56,phase:'outbound'});
    expect(sampleCoast(advanceCoast(active,1200))).toMatchObject({...ANCHORS.dock,pose:'fish',phase:'working',frame:4});expect(sampleCoast(advanceCoast(active,1400)).frame).toBe(5);expect(sampleCoast(advanceCoast(active,4600))).toMatchObject({x:48,y:56,phase:'inbound'});
    expect(sampleCoast(startActivity(funded(),'flower'))).toMatchObject({...ANCHORS.home,pose:'walk'});expect(sampleCoast(advanceCoast(startActivity(funded(),'upgrade'),1200))).toMatchObject({...ANCHORS.house,pose:'decorate',frame:12});
  });
  it('strictly rejects missing unknown fractional unowned and inconsistent records',()=>{
    const state=initialCoast();const {fish:ignored,...missing}=state;void ignored;
    const invalid=[missing,{...state,extra:true},{...state,elapsedMs:1},{...state,fish:1},{...state,wood:1},{...state,houseLevel:0},{...state,houseLevel:4},{...state,decoration:2},{...state,decoration:8},{...state,coins:0.5},{...state,catches:NaN},{...state,coins:1_000_000_000_001},{...state,activity:'decorate'},{...state,activity:'fish',elapsedMs:5200},{...state,activity:'upgrade',houseLevel:3},{...state,activity:'flower',decoration:1}];
    for(const value of invalid)expect(()=>parseCoast(value)).toThrow(/[가-힣]/);expect(parseCoast(state)).toEqual(state);
  });
  it('guards invalid deltas and maximum-resource pending rewards without losing resources',()=>{
    const active=startActivity(initialCoast(),'fish');for(const delta of [NaN,Infinity,-1,0.5])expect(advanceCoast(active,delta)).toBe(active);expect(advanceCoast(active,0)).toBe(active);
    const full={...initialCoast(),catches:1_000_000_000_000,fish:1_000_000_000_000,totalGathered:1_000_000_000_000,wood:1_000_000_000_000};expect(startActivity(full,'fish')).toBe(full);expect(startActivity(full,'gather')).toBe(full);expect(()=>parseCoast({...full,activity:'fish'})).toThrow();expect(()=>parseCoast({...full,activity:'gather'})).toThrow();
    const invalid={...initialCoast(),wood:Infinity};expect(startActivity(invalid,'fish')).toBe(invalid);expect(advanceCoast(invalid,10000)).toBe(invalid);expect(sellFish(invalid)).toBe(invalid);
  });
});